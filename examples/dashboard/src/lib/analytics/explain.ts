import {
  sumByCurrency,
  type BrokerageFeeMovement,
  type Money,
  type Movement,
  type ParseResult,
  type TradeSide,
  type Transaction,
} from 'libdegiro';
import type { ExchangeRef } from './exchange';
import { collectFees, type FeeEntry } from './fees';

/**
 * Every brokerage fee in a statement has a cause, and the statement almost
 * always records it — as an order id shared with the trade legs. This module
 * turns that into an answer to "what was this fee for?".
 */

export type OrphanNote =
  /** The order id exists but its only movement is the fee itself. */
  | 'fee-only-order'
  /** The order grouped with other movements, none of which is a trade. */
  | 'non-trade-order'
  /** The fee row carries no order id at all. */
  | 'no-order-id'
  /** The fee has an order id that matches no grouped transaction. */
  | 'order-not-found';

export type FeeReason =
  | {
      readonly kind: 'trade';
      readonly side: TradeSide;
      readonly quantity: number;
      readonly product: string | null;
      readonly isin: string | null;
      readonly tradeDate: Date;
      /** What the trade legs moved, per currency. Never netted against the fee. */
      readonly consideration: readonly Money[];
    }
  | {
      readonly kind: 'fxTrade';
      readonly side: TradeSide;
      readonly pair: string | null;
      readonly quantity: number;
      readonly tradeDate: Date;
      readonly consideration: readonly Money[];
    }
  | {
      readonly kind: 'connectivity';
      readonly year: number | null;
      readonly exchange: ExchangeRef | null;
      /** Calendar year the fee actually hit the account. */
      readonly bookedIn: number;
    }
  | {
      readonly kind: 'orphan';
      readonly orderId: string | null;
      readonly note: OrphanNote;
      /** Sibling movements under the same order, to show what else was there. */
      readonly siblings: readonly Movement[];
    };

export interface FeeContext {
  readonly fee: FeeEntry;
  readonly transaction: Transaction | null;
  readonly reason: FeeReason;
}

/**
 * Pull the brokerage fees off a transaction.
 *
 * `CompositeTransaction` has no `fees` field — the discriminated union makes
 * `tx.fees` a compile error there, which is the right outcome but means every
 * caller needs this fallback. Centralised here so the edge case is handled once.
 */
export function feesOf(tx: Transaction): readonly BrokerageFeeMovement[] {
  if (tx.type === 'trade' || tx.type === 'fxTrade') return tx.fees;
  return tx.movements.filter((m): m is BrokerageFeeMovement => m.kind === 'brokerageFee');
}

const isFee = (m: Movement): boolean => m.kind === 'brokerageFee' || m.kind === 'connectivityFee';

function orphan(
  orderId: string | null,
  note: OrphanNote,
  siblings: readonly Movement[] = [],
): FeeReason {
  return { kind: 'orphan', orderId, note, siblings };
}

function reasonFor(fee: FeeEntry, tx: Transaction | null): FeeReason {
  if (fee.category === 'connectivity') {
    return {
      kind: 'connectivity',
      year: fee.year,
      exchange: fee.exchange,
      bookedIn: fee.date.getUTCFullYear(),
    };
  }

  if (fee.orderId === null) return orphan(null, 'no-order-id');
  if (tx === null) return orphan(fee.orderId, 'order-not-found');

  switch (tx.type) {
    case 'trade':
      return {
        kind: 'trade',
        side: tx.side,
        quantity: tx.quantity,
        product: tx.product,
        isin: tx.isin,
        tradeDate: tx.date,
        consideration: sumByCurrency(tx.trades.map((t) => t.amount)),
      };
    case 'fxTrade':
      return {
        kind: 'fxTrade',
        side: tx.side,
        pair: tx.pair,
        quantity: tx.fxTrades.reduce((sum, leg) => sum + leg.quantity, 0),
        tradeDate: tx.date,
        consideration: sumByCurrency(tx.fxTrades.map((leg) => leg.amount)),
      };
    default: {
      // A composite (or, unusually, a single) order bucket. Distinguish "the fee
      // is all that was exported" from "the order held something that is not a
      // trade" -- the first usually means the trade fell outside the export's
      // date window, which is a very different thing to tell a user.
      const siblings = tx.movements.filter((m) => !isFee(m));
      return orphan(
        fee.orderId,
        siblings.length === 0 ? 'fee-only-order' : 'non-trade-order',
        siblings,
      );
    }
  }
}

/** Explain every fee in a parsed statement, newest first. */
export function explainFees(result: ParseResult): FeeContext[] {
  const byOrderId = new Map<string, Transaction>();
  for (const tx of result.transactions) {
    if (tx.orderId !== null) byOrderId.set(tx.orderId, tx);
  }

  return collectFees(result.movements).entries.map((fee) => {
    const tx = fee.orderId === null ? null : (byOrderId.get(fee.orderId) ?? null);
    return { fee, transaction: tx, reason: reasonFor(fee, tx) };
  });
}

export type FeeRatio =
  | { readonly kind: 'pct'; readonly value: number; readonly currency: string }
  | {
      readonly kind: 'unavailable';
      readonly why: 'currency-mismatch' | 'no-consideration' | 'multi-currency';
    };

/**
 * Fee as a fraction of what the trade moved.
 *
 * Only computed when the fee and the consideration are in the same currency.
 * DEGIRO routinely books a EUR fee against a CHF-settled trade, and bridging
 * that would need an FX rate this app has no way to obtain — it makes no network
 * calls. Reaching for the sibling FX leg's rate would be a guess dressed up as a
 * number, so the UI shows a dash and explains why instead.
 */
export function feeRatio(fee: Money, consideration: readonly Money[]): FeeRatio {
  if (consideration.length === 0) return { kind: 'unavailable', why: 'no-consideration' };
  if (consideration.length > 1) return { kind: 'unavailable', why: 'multi-currency' };

  const base = consideration[0]!;
  if (base.currency !== fee.currency) return { kind: 'unavailable', why: 'currency-mismatch' };
  if (base.isZero()) return { kind: 'unavailable', why: 'no-consideration' };

  const value = Number(fee.abs().amount.div(base.abs().amount).toFixed(6));
  return { kind: 'pct', value, currency: fee.currency };
}

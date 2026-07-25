import Big from 'big.js';
import { Money } from '../money/money';
import type { Movement, TradeMovement } from '../classify/types';

/** Net holding in a single instrument. */
export interface Position {
  readonly isin: string;
  readonly product: string | null;
  /** Net quantity held (`bought - sold`). */
  readonly quantity: number;
  readonly bought: number;
  readonly sold: number;
}

/** FIFO realized profit/loss for a single instrument. */
export interface RealizedPnl {
  readonly isin: string;
  readonly product: string | null;
  /**
   * Realized P/L, or `null` when it cannot be computed unambiguously — e.g. the
   * instrument was traded in more than one currency, a sell lacked cost basis
   * within the statement window, or a price was missing.
   */
  readonly amount: Money | null;
  /** Quantity of shares closed (matched buy↔sell). */
  readonly matchedQuantity: number;
}

/** A currency-keyed roll-up of an account. */
export interface PortfolioSummary {
  /** Net positions per ISIN. */
  readonly positions: readonly Position[];
  /** FIFO realized P/L per ISIN. */
  readonly realizedPnl: readonly RealizedPnl[];
  /** Latest DEGIRO (trading) account balance per currency. */
  readonly cashByCurrency: readonly Money[];
  /** Total dividends received per currency. */
  readonly dividends: readonly Money[];
  /** Total dividend tax withheld per currency. */
  readonly dividendTax: readonly Money[];
  /** Total fees paid per currency (brokerage + connectivity). */
  readonly fees: readonly Money[];
  /** Total external deposits per currency. */
  readonly deposits: readonly Money[];
  /** Total interest income per currency. */
  readonly interest: readonly Money[];
}

const isTrade = (m: Movement): m is TradeMovement => m.kind === 'buy' || m.kind === 'sell';
const byCurrencyName = (a: Money, b: Money): number => a.currency.localeCompare(b.currency);

/** Sum a collection of amounts grouped by currency. */
export function sumByCurrency(amounts: Iterable<Money | null | undefined>): Money[] {
  const totals = new Map<string, Big>();
  for (const amount of amounts) {
    if (!amount) continue;
    totals.set(amount.currency, (totals.get(amount.currency) ?? new Big(0)).plus(amount.amount));
  }
  return [...totals.entries()]
    .map(([currency, total]) => new Money(total, currency))
    .sort(byCurrencyName);
}

/** Compute net positions per ISIN from trade movements. */
export function computePositions(movements: readonly Movement[]): Position[] {
  const map = new Map<string, { product: string | null; bought: number; sold: number }>();
  for (const movement of movements) {
    if (!isTrade(movement) || movement.isin === null) continue;
    const entry = map.get(movement.isin) ?? { product: movement.product, bought: 0, sold: 0 };
    if (movement.kind === 'buy') entry.bought += movement.quantity;
    else entry.sold += movement.quantity;
    if (entry.product === null && movement.product !== null) entry.product = movement.product;
    map.set(movement.isin, entry);
  }
  return [...map.entries()]
    .map(([isin, e]) => ({
      isin,
      product: e.product,
      quantity: e.bought - e.sold,
      bought: e.bought,
      sold: e.sold,
    }))
    .sort((a, b) => a.isin.localeCompare(b.isin));
}

interface Lot {
  qty: number;
  price: Big;
  currency: string;
}

/**
 * Compute FIFO realized P/L per ISIN. Best-effort: returns `null` for an
 * instrument whose history is multi-currency or incomplete (see {@link RealizedPnl}).
 */
export function computeRealizedPnl(movements: readonly Movement[]): RealizedPnl[] {
  const byIsin = new Map<string, TradeMovement[]>();
  for (const movement of movements) {
    if (!isTrade(movement) || movement.isin === null) continue;
    const bucket = byIsin.get(movement.isin);
    if (bucket) bucket.push(movement);
    else byIsin.set(movement.isin, [movement]);
  }

  const results: RealizedPnl[] = [];
  for (const [isin, trades] of byIsin) {
    const chrono = [...trades].sort(
      (a, b) => a.record.bookingDate.getTime() - b.record.bookingDate.getTime(),
    );
    const lots: Lot[] = [];
    let realized = new Big(0);
    let currency: string | null = null;
    let ambiguous = false;
    let matched = 0;

    for (const trade of chrono) {
      if (!trade.unitPrice) {
        ambiguous = true;
        continue;
      }
      const tradeCurrency = trade.unitPrice.currency;
      if (currency === null) currency = tradeCurrency;
      else if (currency !== tradeCurrency) ambiguous = true;

      if (trade.side === 'buy') {
        lots.push({ qty: trade.quantity, price: trade.unitPrice.amount, currency: tradeCurrency });
        continue;
      }

      let remaining = trade.quantity;
      while (remaining > 0 && lots.length > 0) {
        const lot = lots[0]!;
        const take = Math.min(remaining, lot.qty);
        if (lot.currency !== tradeCurrency) ambiguous = true;
        realized = realized.plus(trade.unitPrice.amount.minus(lot.price).times(take));
        matched += take;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 0) lots.shift();
      }
      if (remaining > 0) ambiguous = true; // sold more than the known cost basis
    }

    results.push({
      isin,
      product: chrono[0]?.product ?? null,
      amount: ambiguous || currency === null ? null : new Money(realized, currency),
      matchedQuantity: matched,
    });
  }
  return results.sort((a, b) => a.isin.localeCompare(b.isin));
}

/**
 * Latest DEGIRO (trading) account balance per currency. Cash-transfer mirror
 * rows (which report the separate flatexDEGIRO cash account) are ignored.
 *
 * Assumes `movements` are newest-first, as produced by the parser.
 */
export function cashByCurrency(movements: readonly Movement[]): Money[] {
  const latest = new Map<string, Money>();
  for (const movement of movements) {
    if (movement.kind === 'cashTransfer') continue;
    const balance = movement.record.balance;
    if (!balance || latest.has(balance.currency)) continue;
    latest.set(balance.currency, balance);
  }
  return [...latest.values()].sort(byCurrencyName);
}

const amountsOf = (movements: readonly Movement[], kinds: ReadonlySet<Movement['kind']>): Money[] =>
  movements
    .filter((m) => kinds.has(m.kind))
    .map((m) => m.amount)
    .filter((a): a is Money => a !== null);

/** Roll up a set of movements into a {@link PortfolioSummary}. */
export function summarizePortfolio(movements: readonly Movement[]): PortfolioSummary {
  return {
    positions: computePositions(movements),
    realizedPnl: computeRealizedPnl(movements),
    cashByCurrency: cashByCurrency(movements),
    dividends: sumByCurrency(amountsOf(movements, new Set(['dividend']))),
    dividendTax: sumByCurrency(amountsOf(movements, new Set(['dividendTax']))),
    fees: sumByCurrency(amountsOf(movements, new Set(['brokerageFee', 'connectivityFee']))),
    deposits: sumByCurrency(amountsOf(movements, new Set(['deposit']))),
    interest: sumByCurrency(amountsOf(movements, new Set(['interest']))),
  };
}

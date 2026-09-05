import {
  convert,
  sumByCurrency,
  type Money,
  type PortfolioOptions,
  type PortfolioSummary,
} from 'libdegiro';
import { totalAsOf, type ConvertedTotal } from './convert';
import type { FeeEntry } from './fees';

export interface PositionRow {
  readonly isin: string;
  readonly product: string | null;
  readonly quantity: number;
  readonly bought: number;
  readonly sold: number;
  readonly closed: boolean;
  /** Shares FIFO matched buy↔sell, i.e. what `gross` was computed over. */
  readonly matchedQuantity: number;
  /** FIFO realised P/L before fees, or null when it could not be computed. */
  readonly gross: Money | null;
  /** Every brokerage fee booked against this instrument, per currency. */
  readonly fees: readonly Money[];
  /** `gross` with the fees below netted off, or null when `gross` is null. */
  readonly net: Money | null;
  /** The fees `net` absorbed — empty when nothing was realised. */
  readonly appliedFees: readonly Money[];
  /** Fees `net` could not absorb, being in another currency. */
  readonly unappliedFees: readonly Money[];
  readonly cost: Money | null;
  readonly pnlConverted: boolean;
  readonly costConverted: boolean;
  readonly feesConverted: boolean;
}

export interface PositionTotals {
  readonly cost: ConvertedTotal;
  readonly fees: ConvertedTotal;
  readonly net: ConvertedTotal;
  readonly missingCost: number;
  readonly missingNet: number;
}

export interface PositionRows {
  readonly active: readonly PositionRow[];
  readonly closed: readonly PositionRow[];
  readonly activeTotals: PositionTotals;
  readonly closedTotals: PositionTotals;
  readonly costWeights: ReadonlyMap<string, number>;
}

/**
 * Positions joined to their realised P/L and their brokerage fees.
 *
 * Two rules keep the netting exact rather than merely plausible:
 *
 *  1. Fees are folded in only where shares were actually closed. On a position
 *     that was bought and never sold, realised P/L is a trivial zero and its
 *     fees are part of the cost basis of shares still held — netting them would
 *     invent a loss that has not happened.
 *  2. A fee booked in another currency is netted only when an exchange rate can
 *     bridge it, converted on the day it was charged. DEGIRO charges an EUR fee
 *     against a CHF trade routinely; with no rate table the remainder stays
 *     visible as `unappliedFees` rather than being folded in at a made-up rate.
 *
 * Nothing is pro-rated. A partially closed position therefore carries the whole
 * instrument's fees against the part that closed, which overstates the cost —
 * but every figure in the row is one the statement actually booked, and the
 * row's own arithmetic explains it.
 */
export function buildPositionRows(
  portfolio: PortfolioSummary,
  feeEntries: readonly FeeEntry[],
  fx?: PortfolioOptions | null,
  asOf?: Date | null,
): PositionRows {
  const pnlByIsin = new Map(portfolio.realizedPnl.map((entry) => [entry.isin, entry]));
  const costByIsin = new Map(portfolio.openCost.map((entry) => [entry.isin, entry]));

  const feesByIsin = new Map<string, FeeEntry[]>();
  for (const entry of feeEntries) {
    if (entry.category !== 'brokerage' || entry.isin === null) continue;
    const bucket = feesByIsin.get(entry.isin) ?? [];
    bucket.push(entry);
    feesByIsin.set(entry.isin, bucket);
  }

  const rows = portfolio.positions.map((position): PositionRow => {
    const pnl = pnlByIsin.get(position.isin);
    const closed = position.quantity === 0;
    const open = costByIsin.get(position.isin);
    const gross = pnl?.amount ?? null;
    const matchedQuantity = pnl?.matchedQuantity ?? 0;
    const entries = feesByIsin.get(position.isin) ?? [];
    const fees = sumByCurrency(entries.map((entry) => entry.amount));

    const target = gross !== null && matchedQuantity > 0 ? gross.currency : null;
    const bridged: Money[] = [];
    const stranded: Money[] = [];
    let feesConverted = false;
    if (target !== null) {
      for (const entry of entries) {
        if (entry.amount.currency === target) {
          bridged.push(entry.amount);
          continue;
        }
        const converted = fx?.rates ? convert(entry.amount, target, entry.date, fx.rates) : null;
        if (converted) {
          bridged.push(converted);
          feesConverted = true;
        } else {
          stranded.push(entry.amount);
        }
      }
    }
    const applied = sumByCurrency(bridged);
    const unapplied = sumByCurrency(stranded);

    return {
      isin: position.isin,
      product: position.product,
      quantity: position.quantity,
      bought: position.bought,
      sold: position.sold,
      closed,
      matchedQuantity,
      gross,
      fees,
      net: gross === null ? null : applied.reduce((total, fee) => total.add(fee), gross),
      appliedFees: applied,
      unappliedFees: unapplied,
      cost: closed ? (pnl?.costBasis ?? null) : (open?.cost ?? null),
      pnlConverted: pnl?.converted ?? false,
      costConverted: (closed ? pnl?.converted : open?.converted) ?? false,
      feesConverted,
    };
  });

  const active = rows.filter((row) => !row.closed);
  const closed = rows.filter((row) => row.closed);
  const on = asOf ?? null;

  return {
    active,
    closed,
    activeTotals: totalPositions(active, on, fx),
    closedTotals: totalPositions(closed, on, fx),
    costWeights: costWeights(active, on, fx),
  };
}

function totalPositions(
  rows: readonly PositionRow[],
  asOf: Date | null,
  fx: PortfolioOptions | null | undefined,
): PositionTotals {
  const present = <T>(value: T | null): value is T => value !== null;

  return {
    cost: totalAsOf(rows.map((row) => row.cost).filter(present), asOf, fx),
    fees: totalAsOf(
      rows.flatMap((row) => row.fees),
      asOf,
      fx,
    ),
    net: totalAsOf(rows.map((row) => row.net).filter(present), asOf, fx),
    missingCost: rows.filter((row) => row.cost === null).length,
    missingNet: rows.filter((row) => row.net === null).length,
  };
}

function costWeights(
  rows: readonly PositionRow[],
  asOf: Date | null,
  fx: PortfolioOptions | null | undefined,
): ReadonlyMap<string, number> {
  const scaled = new Map<string, Money>();
  for (const row of rows) {
    if (row.cost === null) continue;
    const { amount } = totalAsOf([row.cost], asOf, fx);
    if (amount !== null) scaled.set(row.isin, amount);
  }

  const currencies = new Set([...scaled.values()].map((amount) => amount.currency));
  if (currencies.size !== 1) return new Map();

  const total = [...scaled.values()].reduce((sum, amount) => sum.add(amount));
  if (total.isZero()) return new Map();

  return new Map(
    [...scaled].map(([isin, amount]) => [isin, Number(amount.amount.div(total.amount))]),
  );
}

import { sumByCurrency, type Money, type PortfolioSummary } from 'libdegiro';
import type { FeeEntry } from './fees';

/** One currency's worth of fees on an instrument, and when they were charged. */
export interface FeePeriod {
  readonly currency: string;
  readonly total: Money;
  readonly count: number;
  readonly from: Date;
  readonly to: Date;
}

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
  /**
   * The same fees, each currency with the window it was charged over. A row
   * showing two currencies is a row that straddles a change in the currency
   * DEGIRO bills fees in, and the dates are what make that legible.
   */
  readonly feePeriods: readonly FeePeriod[];
  /** `gross` with the fees below netted off, or null when `gross` is null. */
  readonly net: Money | null;
  /** The fees `net` absorbed — empty when nothing was realised. */
  readonly appliedFees: readonly Money[];
  /** Fees `net` could not absorb, being in another currency. */
  readonly unappliedFees: readonly Money[];
}

export interface PositionRows {
  readonly active: readonly PositionRow[];
  readonly closed: readonly PositionRow[];
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
 *  2. Only fees booked in the P/L's own currency are netted. DEGIRO charges an
 *     EUR fee against a CHF trade routinely, and there is no FX rate here to
 *     bridge them. The remainder stays visible as `unappliedFees`.
 *
 * Nothing is pro-rated. A partially closed position therefore carries the whole
 * instrument's fees against the part that closed, which overstates the cost —
 * but every figure in the row is one the statement actually booked, and the
 * row's own arithmetic explains it.
 */
function periodsOf(entries: readonly FeeEntry[]): FeePeriod[] {
  const byCurrency = new Map<string, FeeEntry[]>();
  for (const entry of entries) {
    byCurrency.set(entry.currency, [...(byCurrency.get(entry.currency) ?? []), entry]);
  }

  return [...byCurrency.entries()]
    .map(([currency, charged]): FeePeriod => {
      const times = charged.map((entry) => entry.date.getTime());
      return {
        currency,
        total: sumByCurrency(charged.map((entry) => entry.amount))[0]!,
        count: charged.length,
        from: new Date(Math.min(...times)),
        to: new Date(Math.max(...times)),
      };
    })
    .sort((a, b) => a.from.getTime() - b.from.getTime());
}

export function buildPositionRows(
  portfolio: PortfolioSummary,
  feeEntries: readonly FeeEntry[],
): PositionRows {
  const pnlByIsin = new Map(portfolio.realizedPnl.map((entry) => [entry.isin, entry]));

  const feesByIsin = new Map<string, FeeEntry[]>();
  for (const entry of feeEntries) {
    if (entry.category !== 'brokerage' || entry.isin === null) continue;
    const bucket = feesByIsin.get(entry.isin) ?? [];
    bucket.push(entry);
    feesByIsin.set(entry.isin, bucket);
  }

  const rows = portfolio.positions.map((position): PositionRow => {
    const pnl = pnlByIsin.get(position.isin);
    const gross = pnl?.amount ?? null;
    const matchedQuantity = pnl?.matchedQuantity ?? 0;
    const charged = feesByIsin.get(position.isin) ?? [];
    const fees = sumByCurrency(charged.map((entry) => entry.amount));
    const feePeriods = periodsOf(charged);

    const nettable = gross !== null && matchedQuantity > 0;
    const applied = nettable ? fees.filter((fee) => fee.currency === gross.currency) : [];
    const unapplied = nettable ? fees.filter((fee) => fee.currency !== gross.currency) : [];

    return {
      isin: position.isin,
      product: position.product,
      quantity: position.quantity,
      bought: position.bought,
      sold: position.sold,
      closed: position.quantity === 0,
      matchedQuantity,
      gross,
      fees,
      feePeriods,
      net: gross === null ? null : applied.reduce((total, fee) => total.add(fee), gross),
      appliedFees: applied,
      unappliedFees: unapplied,
    };
  });

  return {
    active: rows.filter((row) => !row.closed),
    closed: rows.filter((row) => row.closed),
  };
}

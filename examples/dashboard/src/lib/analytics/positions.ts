import { sumByCurrency, type Money, type PortfolioSummary } from 'libdegiro';
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
export function buildPositionRows(
  portfolio: PortfolioSummary,
  feeEntries: readonly FeeEntry[],
): PositionRows {
  const pnlByIsin = new Map(portfolio.realizedPnl.map((entry) => [entry.isin, entry]));

  const feesByIsin = new Map<string, Money[]>();
  for (const entry of feeEntries) {
    if (entry.category !== 'brokerage' || entry.isin === null) continue;
    const bucket = feesByIsin.get(entry.isin) ?? [];
    bucket.push(entry.amount);
    feesByIsin.set(entry.isin, bucket);
  }

  const rows = portfolio.positions.map((position): PositionRow => {
    const pnl = pnlByIsin.get(position.isin);
    const gross = pnl?.amount ?? null;
    const matchedQuantity = pnl?.matchedQuantity ?? 0;
    const fees = sumByCurrency(feesByIsin.get(position.isin) ?? []);

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

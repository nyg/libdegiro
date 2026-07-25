import type { Money } from 'libdegiro';
import { formatMoneyAbs, formatMonth } from '@/lib/format';
import { feesByMonth, feesByProduct, type FeeEntry, type FeeTotals } from './fees';

/**
 * The plain-English answer to "how much have I paid in fees?".
 *
 * Every clause is conditional, so the sentence degrades gracefully on a
 * statement with no fees, one currency, or no connectivity charges — rather
 * than emitting "You paid  in fees across 0 orders".
 */
export interface FeeNarrative {
  readonly headline: string;
  readonly details: readonly string[];
}

/** "41.23 EUR and 40.57 CHF", "41.23 EUR", or null when there is nothing. */
function joinAmounts(amounts: readonly Money[]): string | null {
  const nonZero = amounts.filter((money) => !money.isZero());
  if (nonZero.length === 0) return null;

  const parts = nonZero.map(formatMoneyAbs);
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function buildFeeNarrative(entries: readonly FeeEntry[], totals: FeeTotals): FeeNarrative {
  if (entries.length === 0) {
    return { headline: 'No fees appear in this statement.', details: [] };
  }

  const brokerage = joinAmounts(totals.brokerage);
  const connectivity = joinAmounts(totals.connectivity);

  const clauses: string[] = [];
  if (brokerage) {
    clauses.push(
      `You paid ${brokerage} in brokerage fees across ${plural(totals.orderCount, 'order')}`,
    );
  }
  if (connectivity) {
    const suffix = `${connectivity} in exchange connectivity fees`;
    clauses.push(clauses.length > 0 ? `plus ${suffix}` : `You paid ${suffix}`);
  }

  const headline =
    clauses.length > 0 ? `${clauses.join(', ')}.` : 'No fees appear in this statement.';

  const details: string[] = [];

  // Most expensive month, per currency — a cross-currency "worst month" would
  // need an FX rate this app deliberately does not have.
  for (const currency of totals.currencies) {
    const worst = feesByMonth(entries, currency, { fill: false })
      .filter((bucket) => bucket.total.isNegative())
      .sort((a, b) => Number(a.total.amount.minus(b.total.amount)))[0];
    if (worst) {
      details.push(
        `Your most expensive month in ${currency} was ${formatMonth(worst.start)} at ${formatMoneyAbs(worst.total)}.`,
      );
    }
  }

  for (const currency of totals.currencies) {
    const top = feesByProduct(entries, currency)[0];
    if (top && top.total.isNegative()) {
      details.push(
        `${top.label} cost the most in ${currency}: ${formatMoneyAbs(top.total)} over ${plural(top.count, 'fee')}.`,
      );
    }
  }

  const refunds = entries.filter((entry) => entry.amount.isPositive());
  if (refunds.length > 0) {
    details.push(
      `${plural(refunds.length, 'fee')} ${refunds.length === 1 ? 'was' : 'were'} refunded and ${refunds.length === 1 ? 'is' : 'are'} netted off the totals above.`,
    );
  }

  return { headline, details };
}

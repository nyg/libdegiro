import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Money, parseDegiroCsv, type Money as MoneyType } from 'libdegiro';
import {
  averageFeePerOrder,
  collectFees,
  connectivityFeesByYearAndExchange,
  cumulativeFees,
  feesByMonth,
  feesByProduct,
  inCurrency,
  ofCategory,
  totalFees,
} from '@/lib/analytics/fees';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const result = parseDegiroCsv(csv);
const { entries, skipped } = collectFees(result.movements);

/** Compare exactly. `toNumber()` is lossy and must never decide a test. */
const show = (money: MoneyType): string => `${money.amount.toFixed(2)} ${money.currency}`;
const showAll = (amounts: readonly MoneyType[]): string[] => amounts.map(show);

describe('collectFees', () => {
  it('finds every fee row and drops none', () => {
    expect(entries).toHaveLength(46);
    expect(skipped).toEqual([]);
  });

  it('splits brokerage from connectivity', () => {
    expect(ofCategory(entries, 'brokerage')).toHaveLength(44);
    expect(ofCategory(entries, 'connectivity')).toHaveLength(2);
  });

  it('keeps amounts signed as booked, including refunds', () => {
    // Line 179 is a *positive* brokerage fee — DEGIRO refunding one. Taking an
    // absolute value in the analytics layer would silently double-count it as a
    // cost. Signs are preserved here and only flipped at the chart boundary.
    const refunds = entries.filter((entry) => entry.amount.isPositive());
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.line).toBe(179);
    expect(entries.filter((entry) => entry.amount.isNegative())).toHaveLength(45);
  });

  it('carries attribution on brokerage fees only', () => {
    const brokerage = ofCategory(entries, 'brokerage');
    expect(brokerage.every((entry) => entry.orderId !== null)).toBe(true);
    expect(brokerage.every((entry) => entry.product !== null)).toBe(true);

    const connectivity = ofCategory(entries, 'connectivity');
    expect(connectivity.every((entry) => entry.orderId === null)).toBe(true);
    expect(connectivity.every((entry) => entry.year !== null)).toBe(true);
  });
});

describe('totalFees', () => {
  const totals = totalFees(entries);

  it('reports per-currency totals split by category', () => {
    expect(showAll(totals.brokerage)).toEqual(['-40.57 CHF', '-41.23 EUR']);
    expect(showAll(totals.connectivity)).toEqual(['-5.00 EUR']);
    expect(showAll(totals.all)).toEqual(['-40.57 CHF', '-46.23 EUR']);
  });

  it('never nets across currencies', () => {
    expect(totals.currencies).toEqual(['CHF', 'EUR']);
    expect(totals.all).toHaveLength(2);
  });

  it('counts distinct fee-bearing orders', () => {
    expect(totals.count).toEqual({ brokerage: 44, connectivity: 2 });
    expect(totals.orderCount).toBe(42);
  });
});

describe('averageFeePerOrder', () => {
  it('divides within a single currency', () => {
    const eur = averageFeePerOrder(entries, 'EUR');
    const chf = averageFeePerOrder(entries, 'CHF');
    expect(eur).not.toBeNull();
    expect(chf).not.toBeNull();
    expect(eur!.currency).toBe('EUR');
    expect(chf!.currency).toBe('CHF');
  });

  it('returns null for a currency with no brokerage fees', () => {
    expect(averageFeePerOrder(entries, 'USD')).toBeNull();
  });
});

describe('feesByMonth', () => {
  it('sums back to the currency total', () => {
    for (const currency of ['EUR', 'CHF']) {
      const buckets = feesByMonth(entries, currency);
      const summed = buckets.reduce((sum, b) => sum.add(b.total), Money.zero(currency));
      const expected = totalFees(inCurrency(entries, currency)).all;
      expect(show(summed)).toBe(show(expected[0]!));
    }
  });

  it('zero-fills gaps so a bar chart does not imply monthly charges', () => {
    const filled = feesByMonth(entries, 'EUR', { fill: true });
    const sparse = feesByMonth(entries, 'EUR', { fill: false });
    expect(filled.length).toBeGreaterThan(sparse.length);
    expect(filled.some((bucket) => bucket.count === 0)).toBe(true);
  });

  it('produces a contiguous, sorted run of months when filled', () => {
    const months = feesByMonth(entries, 'EUR', { fill: true }).map((b) => b.month);
    expect([...months].sort()).toEqual(months);
    for (let i = 1; i < months.length; i++) {
      const previous = new Date(`${months[i - 1]!}-01T00:00:00Z`);
      const expected = new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 1));
      expect(months[i]).toBe(expected.toISOString().slice(0, 7));
    }
  });

  it('buckets by UTC month, not local time', () => {
    // The fixture books EUR fees on 01-02-2025 at 10:02–11:42 UTC. Read with
    // local getters, those land on 31 January anywhere west of UTC-10, moving
    // them into the wrong month and out of the "most expensive month" headline.
    const boundary = inCurrency(entries, 'EUR').filter(
      (entry) => entry.date.toISOString().slice(0, 10) === '2025-02-01',
    );
    expect(boundary.length).toBeGreaterThan(0);

    const months = feesByMonth(entries, 'EUR', { fill: false }).map((b) => b.month);
    expect(months).toContain('2025-02');
    expect(months[0]).toBe('2023-11');
  });
});

describe('cumulativeFees', () => {
  it('is monotonic and ends at the total', () => {
    for (const currency of ['EUR', 'CHF']) {
      const points = cumulativeFees(entries, currency);
      expect(points.length).toBeGreaterThan(0);

      for (let i = 1; i < points.length; i++) {
        // Fees are negative, so the running total only ever decreases.
        expect(points[i]!.cumulative.greaterThan(points[i - 1]!.cumulative)).toBe(false);
      }

      const expected = totalFees(inCurrency(entries, currency)).all[0]!;
      expect(show(points[points.length - 1]!.cumulative)).toBe(show(expected));
    }
  });
});

describe('feesByProduct', () => {
  const groups = feesByProduct(entries, 'CHF');

  it('ranks instruments by how much they cost', () => {
    expect(groups.length).toBeGreaterThan(1);
    for (let i = 1; i < groups.length; i++) {
      const previous = Math.abs(Number(groups[i - 1]!.total.amount));
      expect(Math.abs(Number(groups[i]!.total.amount))).toBeLessThanOrEqual(previous);
    }
  });

  it('sums to the brokerage total for that currency', () => {
    const summed = groups.reduce((sum, g) => sum.add(g.total), Money.zero('CHF'));
    const expected = totalFees(ofCategory(inCurrency(entries, 'CHF'), 'brokerage')).brokerage[0]!;
    expect(show(summed)).toBe(show(expected));
  });

  it('excludes connectivity fees, which have no instrument', () => {
    expect(groups.every((group) => group.key !== 'Unattributed')).toBe(true);
  });
});

describe('connectivityFeesByYearAndExchange', () => {
  const groups = connectivityFeesByYearAndExchange(entries, 'EUR');

  it('groups by the fee year and venue', () => {
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.year)).toEqual([2025, 2024]);
    expect(groups.map((g) => g.exchange?.label)).toEqual(['FX', 'Euronext Amsterdam']);
  });

  it('separates the year a fee is for from the year it was booked', () => {
    const feeFor2025 = groups.find((group) => group.year === 2025);
    expect(feeFor2025).toBeDefined();
    // Booked in October 2024 -- the divergence the UI shows two columns for.
    expect(feeFor2025!.entries[0]!.date.getUTCFullYear()).toBe(2024);
  });
});

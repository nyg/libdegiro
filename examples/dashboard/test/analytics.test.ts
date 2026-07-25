import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cashByCurrency, parseDegiroCsv } from 'libdegiro';
import { parseExchange } from '@/lib/analytics/exchange';
import { balanceCurrencies, balanceSeries, statementRange } from '@/lib/analytics/timeseries';
import { dividendsByInstrument, incomeByYear } from '@/lib/analytics/income';
import { buildAnalytics } from '@/lib/analytics';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const result = parseDegiroCsv(csv);

describe('parseExchange', () => {
  it('splits a named venue from its code', () => {
    expect(parseExchange('Frais ... 2024 (Euronext Amsterdam - EAM)')).toEqual({
      code: 'EAM',
      name: 'Euronext Amsterdam',
      raw: 'Euronext Amsterdam - EAM',
      label: 'Euronext Amsterdam',
    });
  });

  it("treats DEGIRO's lone dash as absent, not as a name", () => {
    expect(parseExchange('Frais ... 2025 (- - FX)')).toEqual({
      code: 'FX',
      name: null,
      raw: '- - FX',
      label: 'FX',
    });
  });

  it('splits on the last separator, so venue names may contain one', () => {
    const parsed = parseExchange('Frais ... (Nasdaq - OMX Nordic - OMX)');
    expect(parsed?.name).toBe('Nasdaq - OMX Nordic');
    expect(parsed?.code).toBe('OMX');
  });

  it('returns null rather than guessing when there is nothing to parse', () => {
    expect(parseExchange('Frais de connexion aux places boursières 2024')).toBeNull();
    expect(parseExchange('Frais ... ()')).toEqual({
      code: null,
      name: null,
      raw: '',
      label: 'Unknown exchange',
    });
  });
});

describe('balanceSeries', () => {
  it('ends where cashByCurrency says the account stands', () => {
    // The regression test for the newest-first ordering assumption: cashByCurrency
    // takes the FIRST balance it sees per currency, so if this module ever sorts
    // the shared movements array the two silently disagree.
    const closing = cashByCurrency(result.movements);
    expect(closing.length).toBeGreaterThan(0);

    for (const balance of closing) {
      const series = balanceSeries(result.movements, balance.currency);
      const last = series[series.length - 1];
      expect(last).toBeDefined();
      expect(last!.balance.amount.toFixed(2)).toBe(balance.amount.toFixed(2));
    }
  });

  it('runs oldest first', () => {
    const series = balanceSeries(result.movements, 'CHF');
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.date.getTime()).toBeGreaterThanOrEqual(series[i - 1]!.date.getTime());
    }
  });

  it('does not mutate the caller’s array', () => {
    const before = result.movements.map((m) => m.record.line);
    balanceSeries(result.movements, 'CHF');
    expect(result.movements.map((m) => m.record.line)).toEqual(before);
  });

  it('excludes the flatex cash-account mirror rows', () => {
    const series = balanceSeries(result.movements, 'EUR');
    const transferDates = result.movements
      .filter((m) => m.kind === 'cashTransfer')
      .map((m) => m.record.bookingDate.getTime());
    // A transfer row's balance belongs to a different account; if one leaked in,
    // the series would disagree with cashByCurrency (covered above), but check
    // the count directly too.
    expect(series.length).toBeLessThan(result.movements.length - transferDates.length + 1);
  });

  it('reports only currencies that actually have balances', () => {
    expect(balanceCurrencies(result.movements)).toEqual(['CHF', 'EUR', 'USD']);
  });
});

describe('statementRange', () => {
  it('spans the statement by booking date', () => {
    const range = statementRange(result.movements);
    expect(range).not.toBeNull();
    expect(range!.from.toISOString().slice(0, 10)).toBe('2023-10-31');
    expect(range!.to.toISOString().slice(0, 10)).toBe('2025-02-01');
  });
});

describe('dividendsByInstrument', () => {
  const groups = dividendsByInstrument(result.movements);

  it('pairs dividends with the tax withheld on them', () => {
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some((group) => group.tax.length > 0)).toBe(true);
  });

  it('only computes a withholding rate within one currency', () => {
    for (const group of groups) {
      if (group.withholdingRate !== null) {
        expect(group.gross).toHaveLength(1);
        expect(group.tax).toHaveLength(1);
        expect(group.gross[0]!.currency).toBe(group.tax[0]!.currency);
      }
    }
  });
});

describe('incomeByYear', () => {
  const years = incomeByYear(result.movements);

  it('covers the statement’s years, oldest first', () => {
    expect(years.map((y) => y.year)).toEqual([2023, 2024, 2025]);
  });

  it('keeps every bucket per-currency', () => {
    for (const year of years) {
      for (const bucket of [year.dividends, year.dividendTax, year.interest, year.fees]) {
        const currencies = bucket.map((money) => money.currency);
        expect(new Set(currencies).size).toBe(currencies.length);
      }
    }
  });
});

describe('buildAnalytics', () => {
  const analytics = buildAnalytics(result);

  it('assembles every section from a single parse', () => {
    expect(analytics.fees.entries).toHaveLength(46);
    expect(analytics.feeContexts).toHaveLength(46);
    expect(analytics.currencies).toEqual(['CHF', 'EUR', 'USD']);
    expect(analytics.range).not.toBeNull();
  });

  it('reports a clean bill of health for the sample statement', () => {
    expect(analytics.health.ok).toBe(true);
    expect(analytics.health.errors).toEqual([]);
    expect(analytics.health.unknown).toEqual([]);
    expect(analytics.health.reconciliation.ok).toBe(true);
    expect(analytics.health.unparseableExchanges).toBe(0);
  });

  it('splits fees more finely than summarizePortfolio does', () => {
    // summarizePortfolio folds both fee kinds into one Money[]; the whole point
    // of the fee module is that these two add up to it but stay separable.
    const combined = analytics.portfolio.fees.map((m) => `${m.amount.toFixed(2)} ${m.currency}`);
    const all = analytics.feeTotals.all.map((m) => `${m.amount.toFixed(2)} ${m.currency}`);
    expect(all).toEqual(combined);
    expect(analytics.feeTotals.brokerage).not.toEqual(analytics.feeTotals.all);
  });
});

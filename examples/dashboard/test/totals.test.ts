import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Money, ecbRateTable, parseDegiroCsv, summarizePortfolio } from 'libdegiro';
import { buildAnalytics } from '@/lib/analytics';
import { totalAsOf, totalIn } from '@/lib/analytics/convert';
import { collectFees, feesIn } from '@/lib/analytics/fees';
import { incomeByYear, totalIncome } from '@/lib/analytics/income';
import { buildPositionRows } from '@/lib/analytics/positions';
import { totalBalanceSeries } from '@/lib/analytics/timeseries';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const result = parseDegiroCsv(csv);

const rates = ecbRateTable({
  '2023-01-01': { CHF: 1.0, USD: 2.0 },
  '2025-01-01': { CHF: 0.5, USD: 4.0 },
});
const fx = { rates, base: 'CHF' };

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const HEADER = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre';

const twoCurrencies = [
  HEADER,
  '03-01-2025,10:00,03-01-2025,,,Versement de fonds,,CHF,"100,00",CHF,"100,00",',
  '01-01-2025,10:00,01-01-2025,,,Versement de fonds,,EUR,"50,00",EUR,"50,00",',
  '',
].join('\n');

const roundTrip = [
  HEADER,
  '05-01-2025,10:00,05-01-2025,TEST,TEST00000001,"Vente 10 TEST@120 CHF (TEST00000001)",,CHF,"1200,00",CHF,"200,00",o2',
  '01-01-2025,10:00,01-01-2025,TEST,TEST00000001,"Achat 10 TEST@100 CHF (TEST00000001)",,CHF,"-1000,00",CHF,"-1000,00",o1',
  '',
].join('\n');

describe('totalIn', () => {
  it('leaves a single-currency total exactly as booked, and unmarked', () => {
    const total = totalIn(
      [
        { amount: new Money('10', 'CHF'), date: day('2025-01-01') },
        { amount: new Money('5', 'CHF'), date: day('2025-01-01') },
      ],
      fx,
    );
    expect(total.amount).toEqual(new Money('15', 'CHF'));
    expect(total.converted).toBe(false);
  });

  it('converts every leg on the day it was booked, not on one shared date', () => {
    const total = totalIn(
      [
        { amount: new Money('100', 'USD'), date: day('2023-06-01') },
        { amount: new Money('100', 'USD'), date: day('2025-06-01') },
      ],
      fx,
    );
    expect(total.amount?.amount.toFixed(2)).toBe('62.50');
    expect(total.converted).toBe(true);
  });

  it('refuses a partial sum when a leg cannot be bridged', () => {
    const beforeAnyQuote = [{ amount: new Money('100', 'USD'), date: day('2020-01-01') }];
    expect(totalIn(beforeAnyQuote, fx).amount).toBeNull();
  });

  it('has no answer for mixed currencies with no rate table', () => {
    const mixed = [
      { amount: new Money('10', 'CHF'), date: day('2025-01-01') },
      { amount: new Money('10', 'EUR'), date: day('2025-01-01') },
    ];
    expect(totalIn(mixed, null).amount).toBeNull();
    expect(totalIn(mixed, fx).amount).not.toBeNull();
  });

  it('totals nothing as zero in the reference currency, and as nothing without one', () => {
    expect(totalIn([], fx).amount).toEqual(Money.zero('CHF'));
    expect(totalIn([], null).amount).toBeNull();
  });
});

describe('totalAsOf', () => {
  it('stands one date in for figures that span many bookings', () => {
    const amounts = [new Money('100', 'USD'), new Money('10', 'CHF')];
    expect(totalAsOf(amounts, day('2023-06-01'), fx).amount?.amount.toFixed(2)).toBe('60.00');
    expect(totalAsOf(amounts, day('2025-06-01'), fx).amount?.amount.toFixed(2)).toBe('22.50');
  });

  it('needs no date at all while everything shares one currency', () => {
    const total = totalAsOf([new Money('10', 'CHF'), new Money('5', 'CHF')], null, fx);
    expect(total.amount).toEqual(new Money('15', 'CHF'));
    expect(total.converted).toBe(false);
  });
});

describe('position totals', () => {
  const fees = collectFees(result.movements);
  const asOf = new Date(Date.UTC(2025, 0, 1));
  const plain = buildPositionRows(summarizePortfolio(result.movements), fees.entries, null, asOf);
  const converted = buildPositionRows(
    summarizePortfolio(result.movements, fx),
    fees.entries,
    fx,
    asOf,
  );

  it('has no total to give while the rows span currencies with no rate', () => {
    expect(plain.activeTotals.cost.amount).toBeNull();
    expect(plain.activeTotals.net.amount).toBeNull();
    expect(plain.costWeights.size).toBe(0);
  });

  it('collapses to one reference figure once rates are supplied', () => {
    expect(converted.activeTotals.cost.amount?.currency).toBe('CHF');
    expect(converted.activeTotals.cost.converted).toBe(true);
    expect(converted.activeTotals.fees.amount?.currency).toBe('CHF');
    expect(converted.activeTotals.net.amount?.currency).toBe('CHF');
  });

  it('counts the rows it had to leave out rather than hiding them', () => {
    expect(plain.activeTotals.missingCost).toBe(2);
    expect(converted.activeTotals.missingCost).toBe(1);
    expect(converted.activeTotals.missingNet).toBe(1);
  });

  it('weights every priced position against the total, to exactly one', () => {
    const weights = [...converted.costWeights.values()];
    expect(weights).toHaveLength(converted.active.length - 1);
    expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 10);
  });

  it('gives no weight to a position whose cost is unknown', () => {
    expect(converted.costWeights.get('IE00B0H8QT01')).toBeUndefined();
  });
});

describe('closed positions', () => {
  const closedResult = parseDegiroCsv(roundTrip);
  const rows = buildPositionRows(
    summarizePortfolio(closedResult.movements),
    collectFees(closedResult.movements).entries,
  );

  it('costs a closed row at what the sold shares were bought for', () => {
    expect(rows.active).toHaveLength(0);
    expect(rows.closed[0]?.cost).toEqual(new Money('1000', 'CHF'));
    expect(rows.closed[0]?.net).toEqual(new Money('200', 'CHF'));
  });

  it('totals the closed table too', () => {
    expect(rows.closedTotals.cost.amount).toEqual(new Money('1000', 'CHF'));
    expect(rows.closedTotals.net.amount).toEqual(new Money('200', 'CHF'));
  });
});

describe('totalBalanceSeries', () => {
  const series = totalBalanceSeries(result.movements, 'CHF', rates);

  it('carries every currency forward into one running line', () => {
    expect(series.length).toBeGreaterThan(0);
    expect(series.every((point) => point.balance.currency === 'CHF')).toBe(true);
  });

  it('stays one point per day, oldest first', () => {
    const times = series.map((point) => point.date.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const days = series.map((point) => point.date.toISOString().slice(0, 10));
    expect(new Set(days).size).toBe(days.length);
  });

  it('adds a currency in only once it has reported a balance', () => {
    const single = totalBalanceSeries(parseDegiroCsv(roundTrip).movements, 'CHF', rates);
    expect(single.map((point) => point.balance.toString())).toEqual(['-1000 CHF', '200 CHF']);
  });

  it('carries a currency’s last balance forward through days it never reports', () => {
    const mixed = totalBalanceSeries(parseDegiroCsv(twoCurrencies).movements, 'CHF', rates);
    expect(mixed.map((point) => point.balance.toString())).toEqual(['25 CHF', '125 CHF']);
  });
});

describe('income totals', () => {
  it('gives a year no total while its lines span currencies with no rate', () => {
    const years = incomeByYear(result.movements);
    expect(years.find((year) => year.year === 2024)?.total.amount).toBeNull();
  });

  it('totals a year through the rate of each line’s own booking day', () => {
    const years = incomeByYear(result.movements, fx);
    const year = years.find((entry) => entry.year === 2024);
    expect(year?.total.amount?.currency).toBe('CHF');
    expect(year?.total.converted).toBe(true);
  });

  it('adds the whole statement up column by column', () => {
    const totals = totalIncome(result.movements, fx);
    const sum = [totals.dividends, totals.dividendTax, totals.interest, totals.fees]
      .map((entry) => entry.amount!)
      .reduce((total, amount) => total.add(amount));
    expect(totals.total.amount?.amount.toFixed(6)).toBe(sum.amount.toFixed(6));
  });

  it('matches the per-year totals it is built from', () => {
    const years = incomeByYear(result.movements, fx);
    const sum = years
      .map((year) => year.total.amount!)
      .reduce((total, amount) => total.add(amount));
    expect(totalIncome(result.movements, fx).total.amount?.amount.toFixed(6)).toBe(
      sum.amount.toFixed(6),
    );
  });
});

describe('feesIn', () => {
  const entries = collectFees(result.movements).entries;
  const converted = feesIn(entries, 'CHF', rates);

  it('restates every fee in one currency, keeping its date and its reason', () => {
    expect(converted.stranded).toEqual([]);
    expect(converted.entries).toHaveLength(entries.length);
    expect(new Set(converted.entries.map((entry) => entry.currency))).toEqual(new Set(['CHF']));
    expect(converted.entries.map((entry) => entry.description)).toEqual(
      entries.map((entry) => entry.description),
    );
  });

  it('leaves a fee already in the reference currency untouched', () => {
    const chf = entries.find((entry) => entry.currency === 'CHF')!;
    expect(converted.entries).toContain(chf);
  });

  it('strands a fee no rate reaches rather than dropping it silently', () => {
    const tooEarly = ecbRateTable({ '2030-01-01': { CHF: 1, EUR: 1 } });
    const { entries: kept, stranded } = feesIn(entries, 'CHF', tooEarly);
    expect(stranded.length).toBeGreaterThan(0);
    expect(kept.length + stranded.length).toBe(entries.length);
  });
});

describe('buildAnalytics with rates', () => {
  it('threads the reference currency through positions, income and the range', () => {
    const analytics = buildAnalytics(result, fx);
    expect(analytics.incomeTotals.total.amount?.currency).toBe('CHF');
    expect(analytics.positions.activeTotals.cost.amount?.currency).toBe('CHF');
    expect(analytics.positions.costWeights.size).toBeGreaterThan(0);
    expect(analytics.range).not.toBeNull();
  });
});

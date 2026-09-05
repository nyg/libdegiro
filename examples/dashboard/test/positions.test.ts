import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ecbRateTable, Money, parseDegiroCsv, summarizePortfolio } from 'libdegiro';
import { collectFees } from '@/lib/analytics/fees';
import { buildPositionRows } from '@/lib/analytics/positions';
import {
  buildHealthReport,
  describeHealthNotes,
  describeHealthProblems,
  diagnosticsText,
  explainDiscrepancy,
  type HealthReport,
} from '@/lib/analytics/health';
import type { BalanceDiscrepancy } from 'libdegiro';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const result = parseDegiroCsv(csv);
const portfolio = summarizePortfolio(result.movements);
const fees = collectFees(result.movements);
const rows = buildPositionRows(portfolio, fees.entries);

const find = (isin: string) => [...rows.active, ...rows.closed].find((row) => row.isin === isin)!;

const fx = { rates: ecbRateTable({ '2023-01-01': { CHF: 0.95, USD: 1.1 } }), base: 'CHF' };
const convertedRows = buildPositionRows(summarizePortfolio(result.movements, fx), fees.entries, fx);
const findConverted = (isin: string) =>
  [...convertedRows.active, ...convertedRows.closed].find((row) => row.isin === isin)!;

function discrepancy(
  kind: BalanceDiscrepancy['kind'],
  difference: string,
  overrides: Partial<BalanceDiscrepancy> = {},
): BalanceDiscrepancy {
  return {
    currency: 'CHF',
    kind,
    line: 5,
    previousLine: 6,
    description: 'Achat 37 UBS Core MSCI Japan UCITS ETF hCHF acc@41,305 CHF (LU1169821888)',
    movementKind: 'buy',
    previousBalance: new Money('28283.84', 'CHF'),
    statedMutation: new Money('-1528.28', 'CHF'),
    appliedMutation: new Money('-1528.29', 'CHF'),
    exactAmount: null,
    expected: new Money('26755.56', 'CHF'),
    actual: new Money('26755.55', 'CHF'),
    difference: new Money(difference, 'CHF'),
    ...overrides,
  };
}

function withDiscrepancies(
  report: HealthReport,
  discrepancies: readonly BalanceDiscrepancy[],
): HealthReport {
  const unexplained = discrepancies.filter((entry) => entry.kind === 'unexplained');
  const rounding = discrepancies.filter((entry) => entry.kind === 'rounding');
  const reconciliation = {
    ...report.reconciliation,
    ok: unexplained.length === 0,
    exact: discrepancies.length === 0,
    discrepancies,
    rounding,
    unexplained,
  };
  return { ...report, reconciliation, ok: report.ok && reconciliation.ok };
}

describe('buildPositionRows', () => {
  it('splits held instruments from ones sold down to nothing', () => {
    expect(rows.active.every((row) => row.quantity !== 0)).toBe(true);
    expect(rows.closed.every((row) => row.quantity === 0)).toBe(true);
    expect(rows.active.length + rows.closed.length).toBe(portfolio.positions.length);
  });

  it('nets same-currency fees off a realised P/L', () => {
    const row = find('CH0019852802');
    expect(row.gross).toEqual(new Money('-565.22', 'CHF'));
    expect(row.appliedFees).toEqual([new Money('-11.95', 'CHF')]);
    expect(row.net).toEqual(new Money('-577.17', 'CHF'));
  });

  it('leaves fees booked in another currency out of the net figure', () => {
    const row = find('CH0019852802');
    expect(row.unappliedFees).toEqual([new Money('-6.78', 'EUR')]);
    expect(row.net?.currency).toBe('CHF');
  });

  it('nets nothing into a position that was never sold', () => {
    const row = find('IE00B4L5Y983');
    expect(row.matchedQuantity).toBe(0);
    expect(row.appliedFees).toEqual([]);
    expect(row.net).toEqual(row.gross);
    expect(row.fees.length).toBeGreaterThan(0);
  });

  it('keeps every instrument fee visible even when none could be netted', () => {
    const row = find('IE00B4L5Y983');
    expect(row.fees).toEqual([new Money('-1.12', 'EUR')]);
  });

  it('carries a null P/L through rather than inventing one from fees alone', () => {
    const row = find('IE00B44Z5B48');
    expect(row.gross).toBeNull();
    expect(row.net).toBeNull();
    expect(row.fees.length).toBeGreaterThan(0);
  });

  it('costs only the lots no sale consumed, not everything ever bought', () => {
    const row = find('CH0019852802');
    expect(row.bought).toBe(86);
    expect(row.quantity).toBe(8);
    expect(row.cost).toEqual(new Money('840.32', 'CHF'));
  });

  it('costs the whole holding when nothing was ever sold', () => {
    const row = find('IE00B4L5Y983');
    expect(row.sold).toBe(0);
    expect(row.cost).toEqual(new Money('4036.62', 'CHF'));
  });

  it('leaves cost null rather than guessing when the FIFO walk was ambiguous', () => {
    const row = find('IE00B44Z5B48');
    expect(row.quantity).toBeGreaterThan(0);
    expect(row.cost).toBeNull();
  });
});

describe('buildPositionRows with exchange rates', () => {
  it('recovers the P/L and cost of an instrument traded in two currencies', () => {
    const row = findConverted('IE00B44Z5B48');
    expect(find('IE00B44Z5B48').gross).toBeNull();
    expect(row.gross).toEqual(new Money('-40.025', 'CHF'));
    expect(row.cost).toEqual(new Money('2590.26', 'CHF'));
    expect(row.pnlConverted).toBe(true);
    expect(row.costConverted).toBe(true);
  });

  it('nets a fee from another currency once a rate can bridge it', () => {
    const before = find('CH0019852802');
    const after = findConverted('CH0019852802');
    expect(before.unappliedFees).toEqual([new Money('-6.78', 'EUR')]);
    expect(after.unappliedFees).toEqual([]);
    expect(after.feesConverted).toBe(true);
    expect(after.appliedFees).toEqual([new Money('-18.391', 'CHF')]);
    expect(after.net).toEqual(new Money('-583.611', 'CHF'));
  });

  it('leaves the fee column showing what was actually charged, unconverted', () => {
    const after = findConverted('CH0019852802');
    expect(after.fees).toEqual([new Money('-11.95', 'CHF'), new Money('-6.78', 'EUR')]);
  });

  it('leaves a single-currency instrument booked, exact and unmarked', () => {
    const before = find('IE00B4L5Y983');
    const after = findConverted('IE00B4L5Y983');
    expect(after.cost).toEqual(before.cost);
    expect(after.net).toEqual(before.net);
    expect(after.pnlConverted).toBe(false);
    expect(after.costConverted).toBe(false);
  });
});

describe('describeHealthProblems', () => {
  it('says nothing about a statement that is entirely healthy', () => {
    const report = buildHealthReport(result, 0);
    expect(report.ok).toBe(true);
    expect(describeHealthProblems(report)).toEqual([]);
  });

  it('explains unparseable exchanges, which the counts line never mentions', () => {
    const report = buildHealthReport(result, 2);
    expect(report.ok).toBe(false);
    const problems = describeHealthProblems(report);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('2 exchange connectivity fees');
    expect(problems[0]).toContain('they are');
  });

  it('reads naturally for a single unparseable exchange', () => {
    const problems = describeHealthProblems(buildHealthReport(result, 1));
    expect(problems[0]).toContain('1 exchange connectivity fee ');
    expect(problems[0]).toContain('it is');
  });

  it('reports an unexplained balance discrepancy as its own problem', () => {
    const report = withDiscrepancies(buildHealthReport(result, 0), [
      discrepancy('unexplained', '1'),
    ]);

    expect(report.ok).toBe(false);
    expect(describeHealthProblems(report)).toEqual([
      '1 balance transition does not match the balance the statement itself reports, by more than rounding can explain — see the table below.',
    ]);
    expect(describeHealthNotes(report)).toEqual([]);
  });

  it('treats a rounding gap as a note, not a problem', () => {
    const report = withDiscrepancies(buildHealthReport(result, 0), [
      discrepancy('rounding', '-0.01'),
    ]);

    expect(report.ok).toBe(true);
    expect(describeHealthProblems(report)).toEqual([]);
    expect(describeHealthNotes(report)[0]).toContain('1 balance transition is off');
  });

  it('warns when the layout fallback read the file, ahead of any rounding note', () => {
    const dutchCsv = [
      'Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id',
      '18-11-2024,00:00,18-11-2024,,,Storting,,CHF,"9.000,00",CHF,"9.000,00",',
      '',
    ].join('\n');
    const parsed = parseDegiroCsv(dutchCsv);
    const report = withDiscrepancies(buildHealthReport(parsed, 0), [
      discrepancy('rounding', '-0.01'),
    ]);

    expect(report.heuristicDialect).toBe(true);
    const notes = describeHealthNotes(report);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('read by its column layout alone');
    expect(notes[1]).toContain('1 balance transition is off');
  });

  it('says nothing about the dialect when the header was recognised', () => {
    expect(buildHealthReport(result, 0).heuristicDialect).toBe(false);
  });

  it('explains a half-centime rounding from the row that caused it', () => {
    const entry = discrepancy('rounding', '-0.01', {
      statedMutation: new Money('-1528.28', 'CHF'),
      appliedMutation: new Money('-1528.29', 'CHF'),
      exactAmount: new Money('-1528.285', 'CHF'),
    });

    const sentence = explainDiscrepancy(entry);
    expect(sentence).toContain('-1528.285 CHF');
    expect(sentence).toContain('-1528.28 CHF');
    expect(sentence).toContain('-1528.29 CHF');
  });

  it('puts the failing arithmetic into the diagnostics blob', () => {
    const report = withDiscrepancies(buildHealthReport(result, 0), [
      discrepancy('rounding', '-0.01', {
        exactAmount: new Money('-1528.285', 'CHF'),
      }),
    ]);

    const text = diagnosticsText(report, 'fr');
    expect(text).toContain('balance discrepancies (1)');
    expect(text).toContain('quantity × price');
    expect(text).toContain('-1528.285 CHF');
    expect(text).toContain('previous row');
    expect(text).toContain('reading');
  });
});

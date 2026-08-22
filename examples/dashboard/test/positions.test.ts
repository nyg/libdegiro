import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Money, parseDegiroCsv, summarizePortfolio } from 'libdegiro';
import { collectFees } from '@/lib/analytics/fees';
import { buildPositionRows } from '@/lib/analytics/positions';
import { buildHealthReport, describeHealthProblems } from '@/lib/analytics/health';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const result = parseDegiroCsv(csv);
const portfolio = summarizePortfolio(result.movements);
const fees = collectFees(result.movements);
const rows = buildPositionRows(portfolio, fees.entries);

const find = (isin: string) => [...rows.active, ...rows.closed].find((row) => row.isin === isin)!;

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

  it('reports a balance discrepancy as its own problem', () => {
    const report = buildHealthReport(result, 0);
    const broken = {
      ...report,
      reconciliation: {
        ok: false,
        byCurrency: report.reconciliation.byCurrency,
        discrepancies: [
          {
            currency: 'CHF',
            description: 'Achat',
            expected: new Money('1', 'CHF'),
            actual: new Money('2', 'CHF'),
            difference: new Money('1', 'CHF'),
          },
        ],
      },
    };
    expect(describeHealthProblems(broken)).toEqual([
      '1 balance transition does not match the balance the statement itself reports — see the table below.',
    ]);
  });
});

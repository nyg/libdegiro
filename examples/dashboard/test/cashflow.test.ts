import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDegiroCsv } from 'libdegiro';
import { buildCashFlow } from '@/lib/analytics/cashflow';

const HEADER = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre';

const fixture = readFileSync(
  new URL('../../../test/fixtures/Account.csv', import.meta.url),
  'utf8',
);

const flowOf = (rows: readonly string[]) =>
  buildCashFlow(parseDegiroCsv([HEADER, ...rows].join('\n')).movements);

describe('buildCashFlow', () => {
  it('finds the external transfers in the sample export', () => {
    const report = buildCashFlow(parseDegiroCsv(fixture).movements);
    expect(report.currencies).toContain('CHF');
    expect(report.events.length).toBeGreaterThan(0);
    expect(report.events.every((event) => event.amount.isZero())).toBe(false);
  });

  it('excludes sweeps to the flatexDEGIRO cash account', () => {
    const report = buildCashFlow(parseDegiroCsv(fixture).movements);
    expect(report.events.some((event) => /sweep|virement/i.test(event.description))).toBe(false);
  });

  it('reads direction from the sign, not the description', () => {
    const report = flowOf([
      '03-03-2025,10:00,03-03-2025,,,Retrait de fonds,,CHF,"-400,00",CHF,"600,00",',
      '02-03-2025,10:00,02-03-2025,,,Versement de fonds,,CHF,"-100,00",CHF,"1000,00",',
      '01-03-2025,10:00,01-03-2025,,,Versement de fonds,,CHF,"1100,00",CHF,"1100,00",',
    ]);
    const chf = report.byCurrency[0]!;

    expect(chf.depositCount).toBe(1);
    expect(chf.withdrawalCount).toBe(2);
    expect(chf.deposits.toString()).toBe('1100 CHF');
    expect(chf.withdrawals.toString()).toBe('-500 CHF');
    expect(chf.net.toString()).toBe('600 CHF');
  });

  it('accumulates oldest first and lists newest first', () => {
    const report = flowOf([
      '02-03-2025,10:00,02-03-2025,,,Versement de fonds,,CHF,"250,00",CHF,"1350,00",',
      '01-03-2025,10:00,01-03-2025,,,Versement de fonds,,CHF,"1100,00",CHF,"1100,00",',
    ]);

    expect(report.byCurrency[0]!.events.map((e) => e.cumulative.toString())).toEqual([
      '1100 CHF',
      '1350 CHF',
    ]);
    expect(report.events[0]!.amount.toString()).toBe('250 CHF');
  });

  it('keeps a running total per currency, never across them', () => {
    const report = flowOf([
      '02-03-2025,10:00,02-03-2025,,,Versement de fonds,,EUR,"200,00",EUR,"200,00",',
      '01-03-2025,10:00,01-03-2025,,,Versement de fonds,,CHF,"1100,00",CHF,"1100,00",',
    ]);

    expect(report.currencies).toEqual(['CHF', 'EUR']);
    expect(report.byCurrency.map((entry) => entry.net.toString())).toEqual(['1100 CHF', '200 EUR']);
  });
});

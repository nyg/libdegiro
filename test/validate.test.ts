import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDegiroCsv, reconcileBalances } from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

const HEADER = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre';

describe('reconcileBalances', () => {
  const { movements } = parseDegiroCsv(fixture);

  it('reconciles the entire sample export exactly', () => {
    const report = reconcileBalances(movements);
    expect(report.ok).toBe(true);
    expect(report.exact).toBe(true);
    expect(report.discrepancies).toHaveLength(0);
  });

  it('reports opening/closing balances and check counts per currency', () => {
    const report = reconcileBalances(movements);
    const currencies = report.byCurrency.map((c) => c.currency).sort();
    expect(currencies).toEqual(['CHF', 'EUR', 'USD']);
    for (const cur of report.byCurrency) {
      expect(cur.checked).toBeGreaterThan(0);
      expect(cur.openingBalance.currency).toBe(cur.currency);
      expect(cur.closingBalance.currency).toBe(cur.currency);
    }
  });

  it('classifies a one-centime gap as rounding rather than a failure', () => {
    const corrupted = fixture.replace('"36618,40"', '"36618,39"');
    expect(corrupted).not.toBe(fixture);
    const report = reconcileBalances(parseDegiroCsv(corrupted).movements);

    expect(report.exact).toBe(false);
    expect(report.ok).toBe(true);
    expect(report.unexplained).toHaveLength(0);
    expect(report.rounding.length).toBeGreaterThan(0);
    expect(report.rounding.every((entry) => entry.kind === 'rounding')).toBe(true);
  });

  it('exposes the exact trade amount that explains a half-centime rounding', () => {
    // 37 x 41.305 = 1528.285 lands on the half centime: DEGIRO truncates it in
    // the Mouvements column and rounds it up in Solde, so its own two columns
    // describe the same purchase one centime apart.
    const csv = [
      HEADER,
      '22-07-2026,09:12,22-07-2026,UBS,LU1169821888,"Achat 37 UBS Core MSCI Japan UCITS ETF hCHF acc@41,305 CHF (LU1169821888)",,CHF,"-1528,28",CHF,"26755,55",o1',
      '22-07-2026,09:11,22-07-2026,,,Versement de fonds,,CHF,"28283,84",CHF,"28283,84",',
    ].join('\n');

    const report = reconcileBalances(parseDegiroCsv(csv).movements);
    const entry = report.rounding[0];

    expect(report.ok).toBe(true);
    expect(report.unexplained).toHaveLength(0);
    expect(entry).toBeDefined();
    expect(entry!.movementKind).toBe('buy');
    expect(entry!.statedMutation.amount.toString()).toBe('-1528.28');
    expect(entry!.appliedMutation.amount.toString()).toBe('-1528.29');
    expect(entry!.exactAmount?.amount.toString()).toBe('-1528.285');
    expect(entry!.difference.amount.toString()).toBe('-0.01');
  });

  it('leaves a genuine gap unexplained even when it is small', () => {
    const report = reconcileBalances(parseDegiroCsv(fixture).movements, {
      roundingTolerance: 0,
    });
    expect(report.rounding).toHaveLength(0);
  });

  it('carries the whole transition on every discrepancy', () => {
    const corrupted = fixture.replace('"36618,40"', '"99999,99"');
    const report = reconcileBalances(parseDegiroCsv(corrupted).movements);
    const entry = report.unexplained[0];

    expect(entry).toBeDefined();
    expect(entry!.line).toBeGreaterThan(0);
    expect(entry!.previousLine).toBeGreaterThan(0);
    expect(entry!.movementKind).not.toBe('unknown');
    expect(entry!.previousBalance.currency).toBe(entry!.currency);
    // The two readings of the same transition are what makes it diagnosable.
    expect(entry!.appliedMutation.subtract(entry!.statedMutation).amount.toString()).toBe(
      entry!.difference.amount.toString(),
    );
  });

  it('detects an injected balance error', () => {
    // Corrupt one balance cell and confirm it is flagged.
    const corrupted = fixture.replace('"36618,40"', '"99999,99"');
    expect(corrupted).not.toBe(fixture);
    const result = parseDegiroCsv(corrupted);
    const report = reconcileBalances(result.movements);
    expect(report.ok).toBe(false);
    expect(report.exact).toBe(false);
    expect(report.unexplained.length).toBeGreaterThan(0);
    expect(report.discrepancies[0]?.difference.isZero()).toBe(false);
  });
});

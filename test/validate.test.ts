import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDegiroCsv, reconcileBalances } from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

describe('reconcileBalances', () => {
  const { movements } = parseDegiroCsv(fixture);

  it('reconciles the entire sample export exactly', () => {
    const report = reconcileBalances(movements);
    expect(report.ok).toBe(true);
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

  it('detects an injected balance error', () => {
    // Corrupt one balance cell and confirm it is flagged.
    const corrupted = fixture.replace('"36618,40"', '"99999,99"');
    expect(corrupted).not.toBe(fixture);
    const result = parseDegiroCsv(corrupted);
    const report = reconcileBalances(result.movements);
    expect(report.ok).toBe(false);
    expect(report.discrepancies.length).toBeGreaterThan(0);
    expect(report.discrepancies[0]?.difference.isZero()).toBe(false);
  });
});

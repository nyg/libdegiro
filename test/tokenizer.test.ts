import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tokenizeCsv } from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

describe('tokenizeCsv', () => {
  it('parses the header as the first row with 12 columns', () => {
    const rows = tokenizeCsv(fixture);
    expect(rows[0]).toEqual([
      'Date',
      'Heure',
      'Date de',
      'Produit',
      'Code ISIN',
      'Description',
      'FX',
      'Mouvements',
      '',
      'Solde',
      '',
      'ID Ordre',
    ]);
  });

  it('keeps quoted fields with embedded commas and decimals intact', () => {
    const rows = tokenizeCsv('a,b\n"Achat 42 ETF USD (Acc)","-2145,60"\n');
    expect(rows[1]).toEqual(['Achat 42 ETF USD (Acc)', '-2145,60']);
  });

  it('skips the trailing empty line and parses every data row', () => {
    const rows = tokenizeCsv(fixture);
    // 1 header + 236 data rows in the sample export.
    expect(rows.length).toBe(237);
    expect(rows.every((r) => r.length === 12)).toBe(true);
  });

  it('preserves double spaces inside product names', () => {
    const rows = tokenizeCsv(fixture);
    const withDoubleSpace = rows.find((r) => r[3] === 'ISHARES SMI  MID ETF CHF DIS');
    expect(withDoubleSpace).toBeDefined();
  });
});

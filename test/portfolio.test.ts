import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseDegiroCsv,
  summarizePortfolio,
  computeRealizedPnl,
  computePositions,
  sumByCurrency,
  Money,
} from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

const HEADER = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre';

const synthetic = [
  HEADER,
  '01-01-2025,10:00,01-01-2025,TEST,TEST00000001,"Achat 10 TEST@100 EUR (TEST00000001)",,EUR,"-1000,00",EUR,"0,00",o1',
  '02-01-2025,10:00,02-01-2025,TEST,TEST00000001,"Achat 10 TEST@110 EUR (TEST00000001)",,EUR,"-1100,00",EUR,"0,00",o2',
  '03-01-2025,10:00,03-01-2025,TEST,TEST00000001,"Vente 15 TEST@120 EUR (TEST00000001)",,EUR,"1800,00",EUR,"0,00",o3',
  '',
].join('\n');

describe('sumByCurrency', () => {
  it('groups and sums amounts by currency', () => {
    const totals = sumByCurrency([
      Money.of('10', 'EUR'),
      Money.of('5', 'EUR'),
      Money.of('3', 'CHF'),
      null,
    ]);
    expect(totals.map((m) => m.toString())).toEqual(['3 CHF', '15 EUR']);
  });
});

describe('FIFO realized P/L (single currency)', () => {
  const { movements } = parseDegiroCsv(synthetic);

  it('matches sells against the oldest buys', () => {
    const pnl = computeRealizedPnl(movements);
    expect(pnl).toHaveLength(1);
    // 10 * (120-100) + 5 * (120-110) = 250
    expect(pnl[0]?.amount?.toString()).toBe('250 EUR');
    expect(pnl[0]?.matchedQuantity).toBe(15);
  });

  it('computes the remaining net position', () => {
    const positions = computePositions(movements);
    expect(positions[0]?.quantity).toBe(5);
    expect(positions[0]?.bought).toBe(20);
    expect(positions[0]?.sold).toBe(15);
  });
});

describe('summarizePortfolio on the sample export', () => {
  const { movements } = parseDegiroCsv(fixture);
  const summary = summarizePortfolio(movements);

  it('lists net positions per ISIN', () => {
    expect(summary.positions.length).toBeGreaterThan(0);
    expect(summary.positions.every((p) => typeof p.isin === 'string')).toBe(true);
  });

  it('reports the latest trading balance per currency', () => {
    expect(summary.cashByCurrency.map((m) => m.currency).sort()).toEqual(['CHF', 'EUR', 'USD']);
  });

  it('totals dividends, fees, deposits and interest', () => {
    expect(summary.dividends.some((m) => m.currency === 'USD' && m.isPositive())).toBe(true);
    expect(summary.fees.some((m) => m.isNegative())).toBe(true);
    expect(summary.deposits.some((m) => m.currency === 'CHF' && m.isPositive())).toBe(true);
    expect(summary.interest.length).toBeGreaterThan(0);
  });

  it('returns null realized P/L for a multi-currency instrument (best-effort)', () => {
    // SPDR MSCI ACWI was traded in both CHF and EUR.
    const acwi = summary.realizedPnl.find((p) => p.isin === 'IE00B44Z5B48');
    expect(acwi).toBeDefined();
    expect(acwi?.amount).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseDegiroCsv,
  summarizePortfolio,
  computeRealizedPnl,
  computePositions,
  cashByCurrency,
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

const sweepPair = (mirrorFirst: boolean) => {
  const sweep =
    '01-02-2025,12:20,01-02-2025,,,Degiro Cash Sweep Transfer,,CHF,"3601,90",CHF,"32581,78",';
  const mirror =
    '01-02-2025,12:20,01-02-2025,,,"Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 3 601,9 CHF",,,,CHF,"28979,88",';
  return [
    HEADER,
    ...(mirrorFirst ? [mirror, sweep] : [sweep, mirror]),
    '01-02-2025,12:10,01-02-2025,TEST,TEST00000001,"Achat 10 TEST@100 CHF (TEST00000001)",,CHF,"-1000,00",CHF,"28979,88",o1',
    '',
  ].join('\n');
};

describe('cashByCurrency across a cash-sweep pair', () => {
  // A sweep and its `Virement` mirror are two entries in one running balance and
  // they cancel out. DEGIRO emits them in either order under a shared timestamp,
  // so the balance that actually stood is whichever of the two is newest.
  it('takes the mirror when the mirror is the newest row', () => {
    const { movements } = parseDegiroCsv(sweepPair(true));
    expect(cashByCurrency(movements).map((m) => m.amount.toFixed(2))).toEqual(['28979.88']);
  });

  it('takes the sweep when the sweep is the newest row', () => {
    const { movements } = parseDegiroCsv(sweepPair(false));
    expect(cashByCurrency(movements).map((m) => m.amount.toFixed(2))).toEqual(['32581.78']);
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

  it('costs the shares still held, and only those', () => {
    const csv = [
      'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre',
      '03-03-2025,10:00,03-03-2025,X,IE0000000001,"Vente 4 X@30 CHF (IE0000000001)",,CHF,"120,00",CHF,"120,00",o3',
      '02-03-2025,10:00,02-03-2025,X,IE0000000001,"Achat 6 X@20 CHF (IE0000000001)",,CHF,"-120,00",CHF,"0,00",o2',
      '01-03-2025,10:00,01-03-2025,X,IE0000000001,"Achat 4 X@10 CHF (IE0000000001)",,CHF,"-40,00",CHF,"120,00",o1',
    ].join('\n');
    const open = summarizePortfolio(parseDegiroCsv(csv).movements);

    // FIFO: the sale of 4 consumes the 10-CHF lot, leaving 6 bought at 20.
    expect(open.openCost.map((entry) => entry.quantity)).toEqual([6]);
    expect(open.invested.map(String)).toEqual(['120 CHF']);
    expect(open.realizedPnl[0]?.amount?.toString()).toBe('80 CHF');
  });

  it('refuses to cost a multi-currency history rather than guessing', () => {
    const acwi = summary.openCost.find((entry) => entry.isin === 'IE00B44Z5B48');
    expect(acwi).toBeDefined();
    expect(acwi?.cost).toBeNull();
  });

  it('leaves nothing invested once a position is sold down', () => {
    for (const entry of summary.openCost) {
      const position = summary.positions.find((p) => p.isin === entry.isin)!;
      if (position.quantity === 0 && entry.cost !== null) {
        expect(entry.cost.isZero()).toBe(true);
      }
    }
  });

  it('splits external cash flow into deposits and withdrawals by sign', () => {
    const csv = [
      'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre',
      '03-03-2025,10:00,03-03-2025,,,Retrait de fonds,,CHF,"-400,00",CHF,"600,00",',
      '02-03-2025,10:00,02-03-2025,,,Versement de fonds,,CHF,"-100,00",CHF,"1000,00",',
      '01-03-2025,10:00,01-03-2025,,,Versement de fonds,,CHF,"1100,00",CHF,"1100,00",',
    ].join('\n');
    const withdrawn = summarizePortfolio(parseDegiroCsv(csv).movements);

    expect(withdrawn.deposits.map(String)).toEqual(['1100 CHF']);
    expect(withdrawn.withdrawals.map(String)).toEqual(['-500 CHF']);
    expect(withdrawn.netExternalFlow.map(String)).toEqual(['600 CHF']);
  });

  it('returns null realized P/L for a multi-currency instrument (best-effort)', () => {
    // SPDR MSCI ACWI was traded in both CHF and EUR.
    const acwi = summary.realizedPnl.find((p) => p.isin === 'IE00B44Z5B48');
    expect(acwi).toBeDefined();
    expect(acwi?.amount).toBeNull();
  });
});

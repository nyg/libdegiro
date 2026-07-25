import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Money, parseDegiroCsv } from 'libdegiro';
import { explainFees, feeRatio, feesOf } from '@/lib/analytics/explain';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const result = parseDegiroCsv(csv);
const contexts = explainFees(result);

describe('explainFees', () => {
  it('explains every fee in the statement', () => {
    expect(contexts).toHaveLength(46);
  });

  it('traces each brokerage fee back to the order that caused it', () => {
    const brokerage = contexts.filter((c) => c.fee.category === 'brokerage');
    expect(brokerage).toHaveLength(44);
    expect(brokerage.every((c) => c.transaction !== null)).toBe(true);

    // Two of the fees settle a currency-pair order rather than a security trade,
    // so both reason shapes have to be handled — a UI that assumed `trade`
    // would render those two blank.
    const kinds = brokerage.reduce<Record<string, number>>((tally, context) => {
      tally[context.reason.kind] = (tally[context.reason.kind] ?? 0) + 1;
      return tally;
    }, {});
    expect(kinds).toEqual({ trade: 42, fxTrade: 2 });
  });

  it('describes the currency pair behind an FX-order fee', () => {
    const context = contexts.find((c) => c.reason.kind === 'fxTrade');
    expect(context).toBeDefined();
    if (context!.reason.kind !== 'fxTrade') throw new Error('narrowing failed');
    expect(context!.reason.pair).not.toBeNull();
    expect(context!.reason.quantity).toBeGreaterThan(0);
  });

  it('carries the trade detail a user needs to recognise the order', () => {
    const context = contexts.find((c) => c.reason.kind === 'trade');
    expect(context).toBeDefined();
    const reason = context!.reason;
    if (reason.kind !== 'trade') throw new Error('expected a trade reason');

    expect(['buy', 'sell']).toContain(reason.side);
    expect(reason.quantity).toBeGreaterThan(0);
    expect(reason.product).not.toBeNull();
    expect(reason.consideration.length).toBeGreaterThan(0);
  });

  it('treats connectivity fees as their own reason, not orphans', () => {
    const connectivity = contexts.filter((c) => c.reason.kind === 'connectivity');
    expect(connectivity).toHaveLength(2);
    for (const context of connectivity) {
      if (context.reason.kind !== 'connectivity') throw new Error('narrowing failed');
      expect(context.reason.year).not.toBeNull();
    }
  });

  it('leaves no fee unexplained', () => {
    expect(contexts.filter((c) => c.reason.kind === 'orphan')).toEqual([]);
  });
});

describe('explainFees with an order that has no trade legs', () => {
  // The fixture cannot reach this branch: all 44 of its brokerage fees sit in
  // order buckets that also contain a trade. A fee whose trade fell outside the
  // exported date window groups as a CompositeTransaction, which has no `fees`
  // field at all -- the case most likely to throw in a naive implementation.
  const header = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre';
  const feeOnly =
    '01-02-2025,11:42,01-02-2025,ISHARES CORE MSCI WORLD UCITS ETF,IE00B4L5Y983,' +
    'Frais DEGIRO de courtage et/ou de parties tierces,,EUR,"-1,12",EUR,"12680,99",orphan-order-id';

  const orphanResult = parseDegiroCsv(`${header}\n${feeOnly}\n`);
  const orphanContexts = explainFees(orphanResult);

  it('reports it as a fee-only order rather than throwing', () => {
    expect(orphanContexts).toHaveLength(1);
    const reason = orphanContexts[0]!.reason;
    if (reason.kind !== 'orphan') throw new Error('expected an orphan reason');
    expect(reason.note).toBe('fee-only-order');
    expect(reason.orderId).toBe('orphan-order-id');
    expect(reason.siblings).toEqual([]);
  });

  it('still finds the fee through feesOf, despite the missing `fees` field', () => {
    const tx = orphanResult.transactions[0]!;
    // A composite is exactly the shape with no `fees` field: `tx.fees` here is
    // a compile error, so every call site has to go through feesOf.
    expect(tx.type).toBe('composite');
    expect(feesOf(tx)).toHaveLength(1);
  });
});

describe('feesOf', () => {
  it('returns the fees of every transaction shape without special-casing at the call site', () => {
    const total = result.transactions.reduce((sum, tx) => sum + feesOf(tx).length, 0);
    expect(total).toBe(44);
  });
});

describe('feeRatio', () => {
  it('computes a percentage when the fee and the trade share a currency', () => {
    const ratio = feeRatio(Money.of('-1.00', 'EUR'), [Money.of('-100.00', 'EUR')]);
    expect(ratio).toEqual({ kind: 'pct', value: 0.01, currency: 'EUR' });
  });

  it('refuses to bridge currencies rather than inventing a rate', () => {
    const ratio = feeRatio(Money.of('-1.12', 'EUR'), [Money.of('-4036.62', 'CHF')]);
    expect(ratio).toEqual({ kind: 'unavailable', why: 'currency-mismatch' });
  });

  it('declines when the trade spans several currencies', () => {
    const ratio = feeRatio(Money.of('-1.00', 'EUR'), [
      Money.of('-100.00', 'EUR'),
      Money.of('-50.00', 'CHF'),
    ]);
    expect(ratio).toEqual({ kind: 'unavailable', why: 'multi-currency' });
  });

  it('declines when there is nothing to compare against', () => {
    expect(feeRatio(Money.of('-1.00', 'EUR'), [])).toEqual({
      kind: 'unavailable',
      why: 'no-consideration',
    });
    expect(feeRatio(Money.of('-1.00', 'EUR'), [Money.zero('EUR')])).toEqual({
      kind: 'unavailable',
      why: 'no-consideration',
    });
  });

  it('is unavailable for real cross-currency fees in the fixture', () => {
    const mismatches = contexts.filter((context) => {
      if (context.reason.kind !== 'trade') return false;
      return feeRatio(context.fee.amount, context.reason.consideration).kind === 'unavailable';
    });
    // EUR fees on CHF-settled trades are the norm in this statement.
    expect(mismatches.length).toBeGreaterThan(0);
  });
});

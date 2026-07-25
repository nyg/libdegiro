import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  tokenizeCsv,
  mapRow,
  frenchDialect,
  defaultClassifier,
  groupMovements,
  type Movement,
  type Transaction,
} from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

function allMovements(): Movement[] {
  return tokenizeCsv(fixture)
    .slice(1)
    .map((row) => mapRow(row, frenchDialect).record)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((record) => defaultClassifier.classify(record, frenchDialect));
}

const movements = allMovements();
const transactions: Transaction[] = groupMovements(movements);

describe('groupMovements', () => {
  it('preserves every movement exactly once', () => {
    const grouped = transactions.flatMap((t) => t.movements);
    expect(grouped).toHaveLength(movements.length);
    expect(new Set(grouped).size).toBe(movements.length);
  });

  it('is sorted by booking date, newest first', () => {
    for (let i = 1; i < transactions.length; i++) {
      expect(transactions[i - 1]!.date.getTime()).toBeGreaterThanOrEqual(
        transactions[i]!.date.getTime(),
      );
    }
  });

  it('groups a security buy with its brokerage fee', () => {
    const tx = transactions.find(
      (t) => t.type === 'trade' && t.orderId === '6d3f0c1b-d6e3-4626-a943-88e4d5fbe1f5',
    );
    expect(tx?.type).toBe('trade');
    if (tx?.type === 'trade') {
      expect(tx.side).toBe('buy');
      expect(tx.quantity).toBe(42);
      expect(tx.trades).toHaveLength(1);
      expect(tx.fees).toHaveLength(1);
      expect(tx.isin).toBe('IE00B4L5Y983');
    }
  });

  it('groups an FX-pair order with its trades, fees and conversion legs', () => {
    const tx = transactions.find(
      (t) => t.type === 'fxTrade' && t.orderId === '4bfe7ac9-f152-48be-ad0f-c469eb1cc9ee',
    );
    expect(tx?.type).toBe('fxTrade');
    if (tx?.type === 'fxTrade') {
      expect(tx.pair).toBe('EUR/CHF');
      expect(tx.fxTrades.length).toBe(2);
      expect(tx.fees.length).toBe(2);
      expect(tx.fxConversions.length).toBe(2);
    }
  });

  it('groups a security sell that settled via an FX conversion', () => {
    const tx = transactions.find(
      (t) => t.type === 'trade' && t.orderId === '1d73c9ea-1d6a-4157-aa67-6e7c34c2553d',
    );
    expect(tx?.type).toBe('trade');
    if (tx?.type === 'trade') {
      expect(tx.side).toBe('sell');
      expect(tx.fees).toHaveLength(1);
      expect(tx.fxConversions).toHaveLength(2);
    }
  });

  it('pairs a cash sweep with its transfer mirror', () => {
    const swept = transactions.filter(
      (t): t is Extract<Transaction, { type: 'cashSweep' }> => t.type === 'cashSweep',
    );
    expect(swept.length).toBeGreaterThan(0);
    const paired = swept.find((t) => t.transfer !== null);
    expect(paired).toBeDefined();
    if (paired) {
      expect(paired.sweep.amount?.currency).toBe(paired.transfer?.statedAmount?.currency);
      expect(paired.movements).toHaveLength(2);
    }
  });

  it('pairs order-less FX conversion legs by value date', () => {
    const conversions = transactions.filter(
      (t): t is Extract<Transaction, { type: 'fxConversion' }> => t.type === 'fxConversion',
    );
    expect(conversions.length).toBeGreaterThan(0);
    const full = conversions.find((t) => t.credit !== null && t.debit !== null);
    expect(full).toBeDefined();
  });

  it('supports a custom strategy pipeline', () => {
    // Only the singleton catch-all: nothing is grouped, one tx per movement.
    const ungrouped = groupMovements(movements, []);
    expect(ungrouped).toHaveLength(movements.length);
    expect(ungrouped.every((t) => t.type === 'single')).toBe(true);
  });
});

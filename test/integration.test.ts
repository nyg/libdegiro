import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseDegiroCsv,
  reconcileBalances,
  summarizePortfolio,
  frenchDialect,
  parseFrenchDateTime,
  ClassifierRegistry,
  Money,
  type Dialect,
  type Matcher,
} from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

describe('end-to-end on the real sample export', () => {
  const result = parseDegiroCsv(fixture);

  it('parses, classifies, groups and reconciles consistently', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(236);
    expect(result.movements.every((m) => m.kind !== 'unknown')).toBe(true);

    const grouped = result.transactions.flatMap((t) => t.movements);
    expect(grouped).toHaveLength(result.movements.length);

    expect(reconcileBalances(result.movements).ok).toBe(true);

    const summary = summarizePortfolio(result.movements);
    expect(summary.positions.length).toBeGreaterThan(0);
    expect(summary.cashByCurrency.length).toBe(3);
  });
});

describe('extensibility: a custom dialect and custom matchers', () => {
  // A different locale: English headers, US number format (comma thousands, dot decimal).
  const englishDialect: Dialect = {
    id: 'en',
    label: 'DEGIRO English (custom)',
    columns: frenchDialect.columns,
    matches: (header) =>
      ['Date', 'Time', 'Product', 'ISIN', 'Change', 'Balance'].every((t) =>
        header.map((c) => c.trim()).includes(t),
      ),
    parseDecimal: (raw) => {
      const normalized = raw.trim().replace(/,/g, '');
      if (normalized === '') return null;
      return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
    },
    parseDateTime: parseFrenchDateTime,
    parseDate: (date) => parseFrenchDateTime(date),
  };

  const TRADE = /^(Buy|Sell)\s+(\d+)\s+.*@([\d.]+)\s+([A-Z]{3})\s+\(([^)]*)\)$/;
  const englishTradeMatcher: Matcher = {
    name: 'en-trade',
    match({ record }) {
      const m = TRADE.exec(record.description.trim());
      if (!m) return null;
      const side = m[1] === 'Buy' ? 'buy' : 'sell';
      return {
        kind: side,
        side,
        quantity: Number(m[2]),
        unitPrice: new Money(m[3]!, m[4]!),
        product: record.product,
        isin: record.isin ?? (m[5] || null),
        orderId: record.orderId,
        amount: record.mutation,
        record,
      };
    },
  };
  const englishDepositMatcher: Matcher = {
    name: 'en-deposit',
    match({ record }) {
      if (record.description.trim() !== 'Deposit') return null;
      return { kind: 'deposit', amount: record.mutation, record };
    },
  };

  const englishCsv = [
    'Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id',
    '20-11-2024,09:01,20-11-2024,SMI,CH0019852802,"Buy 10 SMI@106.02 CHF (CH0019852802)",,CHF,"-1,060.20",CHF,"7,939.80",o1',
    '14-11-2024,08:37,13-11-2024,,,Deposit,,CHF,"9,000.00",CHF,"9,000.00",',
    '',
  ].join('\n');

  it('parses a foreign-format export via injected dialect + classifier', () => {
    const classifier = new ClassifierRegistry([englishTradeMatcher, englishDepositMatcher]);
    const result = parseDegiroCsv(englishCsv, {
      dialects: [englishDialect],
      classifier,
    });

    expect(result.dialect.id).toBe('en');
    expect(result.movements).toHaveLength(2);

    const buy = result.movements.find((m) => m.kind === 'buy');
    expect(buy?.kind).toBe('buy');
    if (buy?.kind === 'buy') {
      expect(buy.quantity).toBe(10);
      expect(buy.unitPrice?.toString()).toBe('106.02 CHF');
      expect(buy.isin).toBe('CH0019852802');
    }

    expect(result.movements.some((m) => m.kind === 'deposit')).toBe(true);

    // The custom output flows through grouping and reconciliation unchanged.
    expect(result.transactions.length).toBeGreaterThan(0);
    expect(reconcileBalances(result.movements).ok).toBe(true);
  });
});

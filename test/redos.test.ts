import { describe, it, expect } from 'vitest';
import { defaultClassifier, frenchDialect, type RawRecord } from '../src/index';

const REPEAT = 50_000;
const BUDGET_MS = 1000;

function record(description: string): RawRecord {
  return {
    bookingDate: new Date('2026-01-01T00:00:00Z'),
    valueDate: new Date('2026-01-01T00:00:00Z'),
    product: null,
    isin: null,
    description,
    fxRate: null,
    mutation: null,
    balance: null,
    orderId: null,
    raw: [],
  };
}

const cases: readonly (readonly [string, string])[] = [
  ['a quantity trailed by spaces', `Achat 0 ${' '.repeat(REPEAT)}`],
  ['a verb trailed by double spaces', `Achat ${'  '.repeat(REPEAT)}`],
  ['repeated price separators', `Achat a@${'a@a'.repeat(REPEAT)}`],
  ['repeated price separators with no verb', `0@${'@a'.repeat(REPEAT)}`],
  ['a price tail of nothing but spaces', `Achat 1 X@${' '.repeat(REPEAT)}`],
  ['a cash transfer of nothing but spaces', `Virement vers ${' '.repeat(REPEAT)}`],
  ['a cash transfer amount of nothing but spaces', `Virement vers x:${' '.repeat(REPEAT)}1 EUR`],
  ['an FX conversion trailed by spaces', `FX${' '.repeat(REPEAT)}`],
];

describe('hostile descriptions are classified in linear time', () => {
  for (const [name, description] of cases) {
    it(`survives ${name}`, () => {
      const started = performance.now();
      const movement = defaultClassifier.classify(record(description), frenchDialect);
      expect(performance.now() - started).toBeLessThan(BUDGET_MS);
      expect(movement.kind).toBeTypeOf('string');
    });
  }
});

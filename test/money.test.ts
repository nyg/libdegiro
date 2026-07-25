import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { Money, CurrencyMismatchError } from '../src/index';

describe('Money', () => {
  it('preserves exact decimals (no float drift)', () => {
    const a = Money.of('0.1', 'EUR');
    const b = Money.of('0.2', 'EUR');
    expect(a.add(b).amount.toString()).toBe('0.3');
    expect(a.add(b).toNumber()).toBeCloseTo(0.3);
  });

  it('adds and subtracts within a currency', () => {
    const a = Money.of('7754.78', 'EUR');
    const b = Money.of('18.00', 'EUR');
    expect(a.subtract(b).toString()).toBe('7736.78 EUR');
    expect(b.add(a).amount.eq(new Big('7772.78'))).toBe(true);
  });

  it('supports negate, abs and sign checks', () => {
    const m = Money.of('-3613.80', 'CHF');
    expect(m.isNegative()).toBe(true);
    expect(m.negate().isPositive()).toBe(true);
    expect(m.abs().toString()).toBe('3613.8 CHF');
    expect(Money.zero('USD').isZero()).toBe(true);
  });

  it('throws on cross-currency arithmetic', () => {
    const eur = Money.of('1', 'EUR');
    const chf = Money.of('1', 'CHF');
    expect(() => eur.add(chf)).toThrow(CurrencyMismatchError);
  });

  it('serialises to a stable JSON shape', () => {
    expect(Money.of('11.44', 'USD').toJSON()).toEqual({ amount: '11.44', currency: 'USD' });
  });

  it('compares amounts of the same currency', () => {
    expect(Money.of('2', 'EUR').greaterThan(Money.of('1', 'EUR'))).toBe(true);
    expect(Money.of('1', 'EUR').lessThan(Money.of('2', 'EUR'))).toBe(true);
    expect(Money.of('1.50', 'EUR').equals(Money.of('1.5', 'EUR'))).toBe(true);
  });
});

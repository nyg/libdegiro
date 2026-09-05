import { describe, it, expect } from 'vitest';
import { ecbRateTable, convert, utcDay, Money } from '../src/index';

const RATES = {
  '2026-08-27': { CHF: 0.9376, USD: 1.1645 },
  '2026-08-28': { CHF: 0.9364, USD: 1.1643 },
  '2026-08-31': { CHF: 0.9376, USD: 1.1596 },
};

const table = ecbRateTable(RATES);
const on = (day: string) => new Date(`${day}T12:00:00Z`);

describe('ecbRateTable', () => {
  it('carries the last published rate forward across a weekend', () => {
    expect(table.rateOn('EUR', 'CHF', on('2026-08-29'))?.toString()).toBe('0.9364');
    expect(table.rateOn('EUR', 'CHF', on('2026-08-30'))?.toString()).toBe('0.9364');
  });

  it('refuses a date before anything was published rather than back-filling', () => {
    expect(table.rateOn('EUR', 'CHF', on('2026-08-26'))).toBeNull();
  });

  it('crosses two quoted currencies through the pivot', () => {
    const rate = table.rateOn('CHF', 'USD', on('2026-08-28'));
    expect(rate?.toFixed(8)).toBe('1.24337890');
  });

  it('is exactly one between a currency and itself, quoted or not', () => {
    expect(table.rateOn('CHF', 'CHF', on('2026-08-28'))?.toString()).toBe('1');
    expect(table.rateOn('GBP', 'GBP', on('2026-08-28'))?.toString()).toBe('1');
  });

  it('returns null for a currency the payload never quoted', () => {
    expect(table.rateOn('EUR', 'GBP', on('2026-08-28'))).toBeNull();
  });

  it('reads the day in UTC, not the runner’s timezone', () => {
    expect(utcDay(new Date('2026-08-28T23:30:00Z'))).toBe('2026-08-28');
    expect(table.rateOn('EUR', 'CHF', new Date('2026-08-31T00:30:00Z'))?.toString()).toBe('0.9376');
  });
});

describe('convert', () => {
  it('converts at the rate published for that day', () => {
    const converted = convert(new Money('100', 'EUR'), 'CHF', on('2026-08-28'), table);
    expect(converted).toEqual(new Money('93.64', 'CHF'));
  });

  it('returns the same value untouched when the currency already matches', () => {
    const money = new Money('100', 'CHF');
    expect(convert(money, 'CHF', on('2026-08-28'), table)).toBe(money);
  });

  it('keeps enough precision to round-trip', () => {
    const there = convert(new Money('100', 'EUR'), 'USD', on('2026-08-28'), table)!;
    const back = convert(there, 'EUR', on('2026-08-28'), table)!;
    expect(back.amount.toFixed(10)).toBe('100.0000000000');
  });

  it('returns null rather than a guess when no rate covers the date', () => {
    expect(convert(new Money('100', 'EUR'), 'CHF', on('2026-08-26'), table)).toBeNull();
  });
});

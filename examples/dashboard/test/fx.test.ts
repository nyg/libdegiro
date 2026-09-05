import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDegiroCsv } from 'libdegiro';
import {
  cacheCovers,
  dominantCurrency,
  ratesRequest,
  readRates,
  requestUrl,
  statementCurrencies,
} from '@/lib/fx';
import { statementRange } from '@/lib/analytics/timeseries';

const csv = readFileSync(new URL('../../../test/fixtures/Account.csv', import.meta.url), 'utf8');
const { movements } = parseDegiroCsv(csv);

const request = { from: '2024-01-01', to: '2024-06-30', symbols: ['CHF', 'USD'] };
const at = (day: string) => new Date(`${day}T09:00:00Z`).getTime();

describe('ratesRequest', () => {
  it('asks for every currency in the statement except the pivot', () => {
    const built = ratesRequest(statementRange(movements), statementCurrencies(movements));
    expect(built?.symbols).toEqual(['CHF', 'USD']);
    expect(built?.from).toBe('2023-10-31');
    expect(built?.to).toBe('2025-02-01');
  });

  it('asks for nothing when the statement is denominated in the pivot alone', () => {
    expect(ratesRequest(statementRange(movements), ['EUR'])).toBeNull();
  });

  it('asks for nothing when there is no statement to date', () => {
    expect(ratesRequest(null, ['CHF'])).toBeNull();
  });

  it('sees currencies a balance never carries, such as a trade priced abroad', () => {
    expect(statementCurrencies(movements)).toContain('USD');
  });
});

describe('requestUrl', () => {
  it('sends a date range and currency codes, and nothing else', () => {
    const url = new URL(requestUrl(request));
    expect(url.origin).toBe('https://api.frankfurter.dev');
    expect(url.pathname).toBe('/v1/2024-01-01..2024-06-30');
    expect([...url.searchParams]).toEqual([
      ['base', 'EUR'],
      ['symbols', 'CHF,USD'],
    ]);
  });
});

describe('cacheCovers', () => {
  const cached = { ...request, fetchedAt: at('2024-07-01') };

  it('keeps a cache that outlives the range it covers, however old', () => {
    expect(cacheCovers(cached, request, at('2030-01-01'))).toBe(true);
  });

  it('refetches when the statement now reaches past what was cached', () => {
    expect(cacheCovers(cached, { ...request, to: '2024-08-01' }, at('2024-07-01'))).toBe(false);
    expect(cacheCovers(cached, { ...request, from: '2023-01-01' }, at('2024-07-01'))).toBe(false);
  });

  it('refetches when a currency was never requested before', () => {
    expect(cacheCovers(cached, { ...request, symbols: ['CHF', 'GBP'] }, at('2024-07-01'))).toBe(
      false,
    );
  });

  it('expires within a day when the range runs up to the fetch itself', () => {
    const live = { ...request, to: '2024-07-01' };
    const fresh = { ...live, fetchedAt: at('2024-07-01') };
    expect(cacheCovers(fresh, live, at('2024-07-01') + 60_000)).toBe(true);
    expect(cacheCovers(fresh, live, at('2024-07-03'))).toBe(false);
  });

  it('has nothing to say about a cache that does not exist', () => {
    expect(cacheCovers(undefined, request, at('2024-07-01'))).toBe(false);
  });
});

describe('readRates', () => {
  it('reads the shape Frankfurter actually returns', () => {
    const rates = readRates({
      amount: 1,
      base: 'EUR',
      start_date: '2026-08-27',
      end_date: '2026-08-28',
      rates: {
        '2026-08-27': { CHF: 0.9376, USD: 1.1645 },
        '2026-08-28': { CHF: 0.9364, USD: 1.1643 },
      },
    });
    expect(rates).toEqual({
      '2026-08-27': { CHF: 0.9376, USD: 1.1645 },
      '2026-08-28': { CHF: 0.9364, USD: 1.1643 },
    });
  });

  it('drops quotes that are not usable positive numbers', () => {
    const rates = readRates({
      rates: { '2026-08-27': { CHF: 0.9376, USD: 'x', GBP: 0, JPY: null } },
    });
    expect(rates).toEqual({ '2026-08-27': { CHF: 0.9376 } });
  });

  it('returns null for anything it does not recognise', () => {
    expect(readRates(null)).toBeNull();
    expect(readRates({ error: 'not found' })).toBeNull();
    expect(readRates({ rates: { nonsense: { CHF: 1 } } })).toBeNull();
    expect(readRates({ rates: {} })).toBeNull();
  });
});

describe('dominantCurrency', () => {
  it('picks the currency the account is actually kept in', () => {
    expect(dominantCurrency(movements)).toBe('CHF');
  });

  it('has no answer for a statement with no amounts', () => {
    expect(dominantCurrency([])).toBeNull();
  });
});

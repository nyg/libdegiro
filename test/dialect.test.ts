import { describe, it, expect } from 'vitest';
import {
  frenchDialect,
  parseFrenchDecimal,
  parseFrenchDateTime,
  DialectRegistry,
  createDefaultDialectRegistry,
  UnknownDialectError,
  type Dialect,
} from '../src/index';

const frenchHeader = [
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
];

describe('parseFrenchDecimal', () => {
  it('handles comma decimals and space thousands separators', () => {
    expect(parseFrenchDecimal('12 480,50')).toBe('12480.50');
    expect(parseFrenchDecimal('-2145,60')).toBe('-2145.60');
    expect(parseFrenchDecimal('24,00')).toBe('24.00');
    expect(parseFrenchDecimal('0,00')).toBe('0.00');
  });

  it('handles narrow / non-breaking spaces', () => {
    expect(parseFrenchDecimal('2\u00a0480,15')).toBe('2480.15');
    expect(parseFrenchDecimal('4\u202f800')).toBe('4800');
  });

  it('returns null for empty or invalid input', () => {
    expect(parseFrenchDecimal('')).toBeNull();
    expect(parseFrenchDecimal('   ')).toBeNull();
    expect(parseFrenchDecimal('n/a')).toBeNull();
  });
});

describe('parseFrenchDateTime', () => {
  it('parses DD-MM-YYYY with HH:MM as UTC', () => {
    const d = parseFrenchDateTime('01-02-2025', '12:21');
    expect(d?.toISOString()).toBe('2025-02-01T12:21:00.000Z');
  });

  it('parses a date with no time at UTC midnight', () => {
    expect(parseFrenchDateTime('31-12-2024')?.toISOString()).toBe('2024-12-31T00:00:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(parseFrenchDateTime('32-13-2026', '00:00')).toBeNull();
    expect(parseFrenchDateTime('not-a-date')).toBeNull();
  });
});

describe('frenchDialect', () => {
  it('matches the French header', () => {
    expect(frenchDialect.matches(frenchHeader)).toBe(true);
  });

  it('does not match an English header', () => {
    expect(frenchDialect.matches(['Date', 'Time', 'Product', 'ISIN', 'Description'])).toBe(false);
  });
});

describe('DialectRegistry', () => {
  it('detects the French dialect from the default registry', () => {
    const registry = createDefaultDialectRegistry();
    expect(registry.detect(frenchHeader).id).toBe('fr');
  });

  it('throws UnknownDialectError when nothing matches', () => {
    const registry = new DialectRegistry();
    expect(() => registry.detect(frenchHeader)).toThrow(UnknownDialectError);
  });

  it('supports registering a custom dialect with precedence', () => {
    const custom: Dialect = {
      ...frenchDialect,
      id: 'custom',
      label: 'Custom',
      matches: () => true,
    };
    const registry = createDefaultDialectRegistry().register(custom, { prepend: true });
    expect(registry.detect(frenchHeader).id).toBe('custom');
    expect(registry.all().map((d) => d.id)).toEqual(['custom', 'fr']);
  });
});

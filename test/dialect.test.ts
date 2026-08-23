import { describe, it, expect } from 'vitest';
import {
  frenchDialect,
  englishDialect,
  genericDialect,
  matchesDegiroLayout,
  parseFlexibleDateTime,
  parseFrenchDecimal,
  parseFlexibleDecimal,
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

const englishHeader = [
  'Date',
  'Time',
  'Value date',
  'Product',
  'ISIN',
  'Description',
  'FX',
  'Change',
  '',
  'Balance',
  '',
  'Order Id',
];

describe('parseFlexibleDecimal', () => {
  it('reads US thousands separators with a dot decimal mark', () => {
    expect(parseFlexibleDecimal('-1,060.20')).toBe('-1060.20');
    expect(parseFlexibleDecimal('9,000.00')).toBe('9000.00');
    expect(parseFlexibleDecimal('0.9412')).toBe('0.9412');
  });

  it('reads the European format DEGIRO keeps in English exports', () => {
    expect(parseFlexibleDecimal('14\u202f980,01')).toBe('14980.01');
    expect(parseFlexibleDecimal('-2145,60')).toBe('-2145.60');
    expect(parseFlexibleDecimal('1.060,20')).toBe('1060.20');
  });

  it('treats a repeated separator as grouping', () => {
    expect(parseFlexibleDecimal('1,060,200')).toBe('1060200');
  });

  it('returns null for empty or invalid input', () => {
    expect(parseFlexibleDecimal('')).toBeNull();
    expect(parseFlexibleDecimal('n/a')).toBeNull();
    expect(parseFlexibleDecimal('1.060.20')).toBeNull();
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

describe('englishDialect', () => {
  it('matches the English header', () => {
    expect(englishDialect.matches(englishHeader)).toBe(true);
  });

  it('does not match a French header', () => {
    expect(englishDialect.matches(frenchHeader)).toBe(false);
  });

  it('shares the positional layout with the French dialect', () => {
    expect(englishDialect.columns).toEqual(frenchDialect.columns);
  });

  it('reads DD-MM-YYYY dates as UTC', () => {
    expect(englishDialect.parseDateTime('01-02-2025', '12:21')?.toISOString()).toBe(
      '2025-02-01T12:21:00.000Z',
    );
  });
});

describe('parseFlexibleDateTime', () => {
  it('reads the DEGIRO DD-MM-YYYY format', () => {
    expect(parseFlexibleDateTime('01-02-2025', '12:21')?.toISOString()).toBe(
      '2025-02-01T12:21:00.000Z',
    );
  });

  it('reads slashed and ISO dates', () => {
    expect(parseFlexibleDateTime('01/02/2025')?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    expect(parseFlexibleDateTime('2025-02-01')?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(parseFlexibleDateTime('32-13-2026')).toBeNull();
    expect(parseFlexibleDateTime('2025-02-30')).toBeNull();
  });
});

describe('genericDialect', () => {
  const dutchHeader = [
    'Datum',
    'Tijd',
    'Valutadatum',
    'Product',
    'ISIN',
    'Omschrijving',
    'FX',
    'Mutatie',
    '',
    'Saldo',
    '',
    'Order Id',
  ];

  it('recognises a header in a language it has never seen', () => {
    expect(genericDialect.matches(dutchHeader)).toBe(true);
    expect(matchesDegiroLayout(dutchHeader)).toBe(true);
  });

  it('recognises the French and English headers too, being a superset', () => {
    expect(genericDialect.matches(frenchHeader)).toBe(true);
    expect(genericDialect.matches(englishHeader)).toBe(true);
  });

  it('declares itself heuristic, so parsing can warn about it', () => {
    expect(genericDialect.heuristic).toBe(true);
    expect(frenchDialect.heuristic).toBeUndefined();
    expect(englishDialect.heuristic).toBeUndefined();
  });

  it('rejects anything that is not the DEGIRO column layout', () => {
    expect(genericDialect.matches(['Date', 'Amount', 'Balance'])).toBe(false);
    expect(genericDialect.matches([...dutchHeader, 'Extra'])).toBe(false);
    expect(genericDialect.matches(dutchHeader.map((c, i) => (i === 3 ? '' : c)))).toBe(false);
    expect(genericDialect.matches(dutchHeader.map((c, i) => (i === 8 ? 'Filled' : c)))).toBe(false);
  });

  it('is matched only after the language-aware dialects', () => {
    const registry = createDefaultDialectRegistry();
    expect(registry.detect(frenchHeader).id).toBe('fr');
    expect(registry.detect(englishHeader).id).toBe('en');
    expect(registry.detect(dutchHeader).id).toBe('generic');
  });
});

describe('DialectRegistry', () => {
  it('detects the French dialect from the default registry', () => {
    const registry = createDefaultDialectRegistry();
    expect(registry.detect(frenchHeader).id).toBe('fr');
  });

  it('detects the English dialect from the default registry', () => {
    const registry = createDefaultDialectRegistry();
    expect(registry.detect(englishHeader).id).toBe('en');
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
    expect(registry.all().map((d) => d.id)).toEqual(['custom', 'fr', 'en', 'generic']);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  tokenizeCsv,
  mapRow,
  frenchDialect,
  defaultClassifier,
  createDefaultClassifierRegistry,
  type Matcher,
  type Movement,
  type RawRecord,
} from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

function classifyAll(): Movement[] {
  const rows = tokenizeCsv(fixture).slice(1); // drop header
  const movements: Movement[] = [];
  for (const row of rows) {
    const { record } = mapRow(row, frenchDialect);
    if (record) movements.push(defaultClassifier.classify(record, frenchDialect));
  }
  return movements;
}

function record(description: string, overrides: Partial<RawRecord> = {}): RawRecord {
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
    ...overrides,
  };
}

describe('classification of the full sample export', () => {
  it('classifies every row (no unknown movements)', () => {
    const movements = classifyAll();
    const unknown = movements.filter((m) => m.kind === 'unknown');
    expect(unknown).toHaveLength(0);
  });

  it('produces a sensible distribution of movement kinds', () => {
    const counts = new Map<string, number>();
    for (const m of classifyAll()) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    expect(counts.get('buy')).toBeGreaterThan(0);
    expect(counts.get('sell')).toBeGreaterThan(0);
    expect(counts.get('dividend')).toBeGreaterThan(0);
    expect(counts.get('brokerageFee')).toBeGreaterThan(0);
    expect(counts.get('cashSweep')).toBeGreaterThan(0);
    expect(counts.get('cashTransfer')).toBeGreaterThan(0);
    expect(counts.get('deposit')).toBeGreaterThan(0);
    expect(counts.get('interest')).toBeGreaterThan(0);
    expect(counts.get('fxTrade')).toBeGreaterThan(0);
    expect(counts.get('fxCredit')).toBeGreaterThan(0);
    expect(counts.get('fxDebit')).toBeGreaterThan(0);
  });
});

describe('individual matchers', () => {
  const classify = (rec: RawRecord) => defaultClassifier.classify(rec, frenchDialect);

  it('parses a security buy', () => {
    const m = classify(
      record('Achat 42 iShares Core MSCI World UCITS ETF USD (Acc)@96,11 CHF (IE00B4L5Y983)', {
        product: 'ISHARES CORE MSCI WORLD UCITS ETF',
        isin: 'IE00B4L5Y983',
        mutation: undefined,
      }),
    );
    expect(m.kind).toBe('buy');
    if (m.kind === 'buy') {
      expect(m.quantity).toBe(42);
      expect(m.unitPrice?.toString()).toBe('96.11 CHF');
      expect(m.isin).toBe('IE00B4L5Y983');
    }
  });

  it('parses a sell with a price that has no decimals', () => {
    const m = classify(record('Vente 35 SPDR MSCI ACWI UCITS ETF USD Dis@120 CHF (IE00B44Z5B48)'));
    expect(m.kind).toBe('sell');
    if (m.kind === 'sell') {
      expect(m.quantity).toBe(35);
      expect(m.unitPrice?.toString()).toBe('120 CHF');
    }
  });

  it('parses an FX pair trade with a thousands-separated quantity', () => {
    const m = classify(record('Achat 4 800 EUR/CHF@0,9412 CHF ()', { product: 'EUR/CHF' }));
    expect(m.kind).toBe('fxTrade');
    if (m.kind === 'fxTrade') {
      expect(m.pair).toBe('EUR/CHF');
      expect(m.quantity).toBe(4800);
      expect(m.rate?.toString()).toBe('0.9412 CHF');
      expect(m.settlement).toBe(false);
    }
  });

  it('flags the FX settlement leg', () => {
    const m = classify(record('Règlement transaction devise: Vente 4 800 EUR/CHF@0,9412 CHF ()'));
    expect(m.kind).toBe('fxTrade');
    if (m.kind === 'fxTrade') expect(m.settlement).toBe(true);
  });

  it('distinguishes FX credit and debit legs despite accent differences', () => {
    expect(classify(record('Operation de change - Crédit')).kind).toBe('fxCredit');
    expect(classify(record('Opération de change - Débit')).kind).toBe('fxDebit');
  });

  it('classifies dividend, dividend tax and capital return', () => {
    expect(classify(record('Dividende')).kind).toBe('dividend');
    expect(classify(record('Impôts sur dividende')).kind).toBe('dividendTax');
    expect(classify(record('Remboursement de capital')).kind).toBe('capitalReturn');
  });

  it('classifies fees and extracts the connectivity year', () => {
    expect(classify(record('Frais DEGIRO de courtage et/ou de parties tierces')).kind).toBe(
      'brokerageFee',
    );
    const conn = classify(record('Frais de connexion aux places boursières 2025 (- - FX)'));
    expect(conn.kind).toBe('connectivityFee');
    if (conn.kind === 'connectivityFee') expect(conn.year).toBe(2025);
  });

  it('classifies cash transfers with direction and stated amount', () => {
    const out = classify(
      record('Virement vers votre Compte Espèces à la flatexDEGIRO Bank: 6 770,1 CHF'),
    );
    expect(out.kind).toBe('cashTransfer');
    if (out.kind === 'cashTransfer') {
      expect(out.direction).toBe('toCashAccount');
      expect(out.statedAmount?.toString()).toBe('6770.1 CHF');
    }
    const incoming = classify(
      record('Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 213,25 EUR'),
    );
    if (incoming.kind === 'cashTransfer') expect(incoming.direction).toBe('fromCashAccount');
  });

  it('classifies cash sweep, deposit and interest', () => {
    expect(classify(record('Degiro Cash Sweep Transfer')).kind).toBe('cashSweep');
    expect(classify(record('Versement de fonds')).kind).toBe('deposit');
    expect(classify(record('Flatex Interest Income')).kind).toBe('interest');
  });

  it('falls back to unknown for unrecognised descriptions', () => {
    expect(classify(record('Some brand new DEGIRO movement')).kind).toBe('unknown');
  });
});

describe('classifier extensibility', () => {
  it('classifies an otherwise-unknown description via a custom matcher', () => {
    // A referral bonus is not understood by the built-ins...
    expect(defaultClassifier.classify(record('Récompense de parrainage'), frenchDialect).kind).toBe(
      'unknown',
    );

    // ...until we register a higher-priority matcher that treats it as a deposit.
    const referralMatcher: Matcher = {
      name: 'referral-bonus',
      priority: 100,
      match({ record: rec }) {
        if (!/^Récompense de parrainage/i.test(rec.description)) return null;
        return { kind: 'deposit', amount: rec.mutation, record: rec };
      },
    };
    const registry = createDefaultClassifierRegistry().register(referralMatcher);
    expect(registry.all()[0]?.name).toBe('referral-bonus');
    expect(registry.classify(record('Récompense de parrainage'), frenchDialect).kind).toBe(
      'deposit',
    );
  });
});

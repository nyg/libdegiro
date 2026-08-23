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
  UnknownDialectError,
  type Dialect,
  type Matcher,
} from '../src/index';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
  'utf8',
);

const englishFixture = readFileSync(
  fileURLToPath(new URL('./fixtures/Account-en.csv', import.meta.url)),
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

describe('end-to-end on an English-header export', () => {
  const result = parseDegiroCsv(englishFixture);

  it('detects the English dialect and parses it cleanly', () => {
    expect(result.dialect.id).toBe('en');
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(236);
    expect(result.movements.every((m) => m.kind !== 'unknown')).toBe(true);
    expect(reconcileBalances(result.movements).ok).toBe(true);
  });

  it('yields the same movements as the French export of the same account', () => {
    const french = parseDegiroCsv(fixture);
    const shape = (r: typeof result) =>
      r.movements.map((m) => ({
        kind: m.kind,
        amount: m.amount?.toString() ?? null,
        description: m.record.description,
        bookingDate: m.record.bookingDate.toISOString(),
      }));
    expect(shape(result)).toEqual(shape(french));
  });

  it('summarizes to the same portfolio as the French export', () => {
    const english = summarizePortfolio(result.movements);
    const french = summarizePortfolio(parseDegiroCsv(fixture).movements);
    expect(english.cashByCurrency.map((m) => m.toString())).toEqual(
      french.cashByCurrency.map((m) => m.toString()),
    );
    expect(english.positions.map((p) => p.isin)).toEqual(french.positions.map((p) => p.isin));
  });
});

describe('an English export written in English, with US number formatting', () => {
  const csv = [
    'Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id',
    '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,"Buy 1,060 SMI ETF@106.02 CHF (CH0019852802)",,CHF,"-112381.20",CHF,"7,939.80",o1',
    '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,DEGIRO Transaction and/or Third Party Fees,,CHF,"-2.79",CHF,"7,937.01",o1',
    '19-11-2024,09:01,19-11-2024,VWCE,IE00BK5BQT80,"Sell 10 VWCE@120.36 EUR (IE00BK5BQT80)",,EUR,"1,203.60",EUR,"1,203.60",o2',
    '18-11-2024,00:00,18-11-2024,VWCE,IE00BK5BQT80,Dividend,,EUR,"12.34",EUR,"12.34",',
    '18-11-2024,00:00,18-11-2024,VWCE,IE00BK5BQT80,Dividend Tax,,EUR,"-1.85",EUR,"10.49",',
    '17-11-2024,00:00,17-11-2024,,,Currency Exchange - Credit,1.0888,CHF,"500.00",CHF,"500.00",o3',
    '17-11-2024,00:00,17-11-2024,,,FX Debit,1.0888,EUR,"-459.22",EUR,"0.00",o3',
    '16-11-2024,00:00,16-11-2024,,,Degiro Cash Sweep Transfer,,CHF,"9,000.00",CHF,"9,000.00",',
    '16-11-2024,00:00,16-11-2024,,,"Transfer from your Cash Account at flatex Bank: 9,000.00 CHF",,,,CHF,"0.00",',
    '15-11-2024,00:00,15-11-2024,,,Deposit,,CHF,"9,000.00",CHF,"9,000.00",',
    '14-11-2024,00:00,14-11-2024,,,Processed Flatex Withdrawal,,CHF,"-100.00",CHF,"8,900.00",',
    '13-11-2024,00:00,13-11-2024,,,DEGIRO Exchange Connection Fee 2024 (Euronext Amsterdam - EAM),,EUR,"-2.50",EUR,"-2.50",',
    '12-11-2024,00:00,12-11-2024,,,Flatex Interest Income,,EUR,"0.42",EUR,"0.42",',
    '11-11-2024,00:00,11-11-2024,,,Return of Capital,,EUR,"5.00",EUR,"5.00",',
    '10-11-2024,00:00,10-11-2024,,,"Currency transaction settlement: Sell 1,900 EUR/CHF@0.9412 CHF ()",,EUR,"-1,900.00",EUR,"0.00",o4',
    '',
  ].join('\n');

  const result = parseDegiroCsv(csv);

  it('classifies every English description with the built-in matchers', () => {
    expect(result.dialect.id).toBe('en');
    expect(result.issues).toHaveLength(0);
    expect(result.movements.map((m) => m.kind)).toEqual([
      'buy',
      'brokerageFee',
      'sell',
      'dividend',
      'dividendTax',
      'fxCredit',
      'fxDebit',
      'cashSweep',
      'cashTransfer',
      'deposit',
      'withdrawal',
      'connectivityFee',
      'interest',
      'capitalReturn',
      'fxTrade',
    ]);
  });

  it('reads US-grouped quantities and prices', () => {
    const buy = result.movements.find((m) => m.kind === 'buy');
    expect(buy?.kind).toBe('buy');
    if (buy?.kind === 'buy') {
      expect(buy.quantity).toBe(1060);
      expect(buy.unitPrice?.toString()).toBe('106.02 CHF');
      expect(buy.amount?.toString()).toBe('-112381.2 CHF');
    }
  });

  it('reads the direction and stated amount of an English cash transfer', () => {
    const transfer = result.movements.find((m) => m.kind === 'cashTransfer');
    expect(transfer?.kind).toBe('cashTransfer');
    if (transfer?.kind === 'cashTransfer') {
      expect(transfer.direction).toBe('fromCashAccount');
      expect(transfer.statedAmount?.toString()).toBe('9000 CHF');
    }
  });

  it('reads the settlement leg of an English FX trade', () => {
    const fx = result.movements.find((m) => m.kind === 'fxTrade');
    expect(fx?.kind).toBe('fxTrade');
    if (fx?.kind === 'fxTrade') {
      expect(fx.settlement).toBe(true);
      expect(fx.pair).toBe('EUR/CHF');
      expect(fx.quantity).toBe(1900);
      expect(fx.rate?.toString()).toBe('0.9412 CHF');
    }
  });
});

describe('an export in a language no dialect knows', () => {
  const dutchCsv = [
    'Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id',
    '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,"Koop 1.060 SMI ETF@106,02 CHF (CH0019852802)",,CHF,"-112.381,20",CHF,"7.939,80",o1',
    '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,"Verkoop 10 SMI ETF@106,02 CHF (CH0019852802)",,CHF,"1.060,20",CHF,"9.000,00",o2',
    '19-11-2024,00:00,19-11-2024,,,"Valuta Creditering","1,0888",CHF,"500,00",CHF,"500,00",o3',
    '18-11-2024,00:00,18-11-2024,,,Storting,,CHF,"9.000,00",CHF,"9.000,00",',
    '17-11-2024,00:00,17-11-2024,,,"Valutatransactie afwikkeling: Verkoop 1.900 EUR/CHF@0,9412 CHF ()",,EUR,"-1.900,00",EUR,"0,00",o4',
    '',
  ].join('\n');

  const result = parseDegiroCsv(dutchCsv);

  it('falls back to the positional layout and reads every row', () => {
    expect(result.dialect.id).toBe('generic');
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(5);
    expect(result.records[0]?.bookingDate.toISOString()).toBe('2024-11-20T09:01:00.000Z');
    expect(result.records[0]?.mutation?.toString()).toBe('-112381.2 CHF');
    expect(result.records[3]?.balance?.toString()).toBe('9000 CHF');
  });

  it('warns that the file was read by layout rather than by language', () => {
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toMatch(/column layout/);
    expect(result.warnings[0]?.line).toBe(1);
  });

  it('recovers trades from the shape of the description alone', () => {
    const buy = result.movements[0];
    expect(buy?.kind).toBe('buy');
    if (buy?.kind === 'buy') {
      expect(buy.quantity).toBe(1060);
      expect(buy.unitPrice?.toString()).toBe('106.02 CHF');
      expect(buy.isin).toBe('CH0019852802');
    }

    // Same Dutch verb shape, opposite mutation sign.
    expect(result.movements[1]?.kind).toBe('sell');
  });

  it('recovers an FX pair trade and its settlement leg', () => {
    const fx = result.movements[4];
    expect(fx?.kind).toBe('fxTrade');
    if (fx?.kind === 'fxTrade') {
      expect(fx.pair).toBe('EUR/CHF');
      expect(fx.quantity).toBe(1900);
      expect(fx.rate?.toString()).toBe('0.9412 CHF');
      expect(fx.settlement).toBe(true);
    }
  });

  it('leaves descriptions it cannot read as unknown, never dropping the row', () => {
    expect(result.movements[3]?.kind).toBe('unknown');
    expect(result.movements[3]?.amount?.toString()).toBe('9000 CHF');
  });
});

describe('a semicolon-delimited export', () => {
  const csv = [
    'Datum;Tijd;Valutadatum;Product;ISIN;Omschrijving;FX;Mutatie;;Saldo;;Order Id',
    '18-11-2024;00:00;18-11-2024;;;Storting;;CHF;"9.000,00";CHF;"9.000,00";',
    '',
  ].join('\n');

  it('retries the delimiter when the header tokenizes to one cell', () => {
    const result = parseDegiroCsv(csv);
    expect(result.dialect.id).toBe('generic');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.balance?.toString()).toBe('9000 CHF');
  });

  it('does not second-guess an explicit delimiter', () => {
    expect(() => parseDegiroCsv(csv, { delimiter: ',' })).toThrow(UnknownDialectError);
  });
});

describe('extensibility: a custom dialect and custom matchers', () => {
  // A locale libdegiro does not ship: Dutch headers, dot thousands, comma decimals.
  const dutchDialect: Dialect = {
    id: 'nl',
    label: 'DEGIRO Dutch (custom)',
    columns: frenchDialect.columns,
    matches: (header) =>
      ['Datum', 'Tijd', 'Product', 'ISIN', 'Omschrijving', 'Mutatie', 'Saldo'].every((t) =>
        header.map((c) => c.trim()).includes(t),
      ),
    parseDecimal: (raw) => {
      const normalized = raw.trim().replace(/\./g, '').replace(',', '.');
      if (normalized === '') return null;
      return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
    },
    parseDateTime: parseFrenchDateTime,
    parseDate: (date) => parseFrenchDateTime(date),
  };

  const TRADE = /^(Koop|Verkoop)\s+(\d+)\s+.*@([\d,]+)\s+([A-Z]{3})\s+\(([^)]*)\)$/;
  const dutchTradeMatcher: Matcher = {
    name: 'nl-trade',
    match({ record }) {
      const m = TRADE.exec(record.description.trim());
      if (!m) return null;
      const side = m[1] === 'Koop' ? 'buy' : 'sell';
      return {
        kind: side,
        side,
        quantity: Number(m[2]),
        unitPrice: new Money(m[3]!.replace(',', '.'), m[4]!),
        product: record.product,
        isin: record.isin ?? (m[5] || null),
        orderId: record.orderId,
        amount: record.mutation,
        record,
      };
    },
  };
  const dutchDepositMatcher: Matcher = {
    name: 'nl-deposit',
    match({ record }) {
      if (record.description.trim() !== 'Storting') return null;
      return { kind: 'deposit', amount: record.mutation, record };
    },
  };

  const dutchCsv = [
    'Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id',
    '20-11-2024,09:01,20-11-2024,SMI,CH0019852802,"Koop 10 SMI@106,02 CHF (CH0019852802)",,CHF,"-1.060,20",CHF,"7.939,80",o1',
    '14-11-2024,08:37,13-11-2024,,,Storting,,CHF,"9.000,00",CHF,"9.000,00",',
    '',
  ].join('\n');

  it('parses a foreign-format export via injected dialect + classifier', () => {
    const classifier = new ClassifierRegistry([dutchTradeMatcher, dutchDepositMatcher]);
    const result = parseDegiroCsv(dutchCsv, {
      dialects: [dutchDialect],
      classifier,
    });

    expect(result.dialect.id).toBe('nl');
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

import { describe, it, expect } from 'vitest';
import { mapRow, frenchDialect } from '../src/index';

// Columns: Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mut.ccy,Mut.amt,Bal.ccy,Bal.amt,OrderId
const buyRow = [
  '01-02-2025',
  '11:42',
  '01-02-2025',
  'ISHARES CORE MSCI WORLD UCITS ETF',
  'IE00B4L5Y983',
  'Achat 42 iShares Core MSCI World UCITS ETF USD (Acc)@96,11 CHF (IE00B4L5Y983)',
  '',
  'CHF',
  '-4036,62',
  'CHF',
  '32581,78',
  '6d3f0c1b-d6e3-4626-a943-88e4d5fbe1f5',
];

const transferRow = [
  '01-02-2025',
  '12:21',
  '01-02-2025',
  '',
  '',
  'Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 213,25 EUR',
  '',
  '',
  '',
  'EUR',
  '12467,74',
  '',
];

const fxRow = [
  '19-11-2024',
  '07:32',
  '18-11-2024',
  '',
  '',
  'Opération de change - Débit',
  '1,0701',
  'USD',
  '-14,32',
  'USD',
  '0,00',
  '',
];

describe('mapRow', () => {
  it('maps a buy row into typed fields', () => {
    const { record, issues } = mapRow(buyRow, frenchDialect, 9);
    expect(issues).toHaveLength(0);
    expect(record).not.toBeNull();
    expect(record?.line).toBe(9);
    expect(record?.bookingDate.toISOString()).toBe('2025-02-01T11:42:00.000Z');
    expect(record?.valueDate.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    expect(record?.product).toBe('ISHARES CORE MSCI WORLD UCITS ETF');
    expect(record?.isin).toBe('IE00B4L5Y983');
    expect(record?.mutation?.toString()).toBe('-4036.62 CHF');
    expect(record?.balance?.toString()).toBe('32581.78 CHF');
    expect(record?.orderId).toBe('6d3f0c1b-d6e3-4626-a943-88e4d5fbe1f5');
    expect(record?.fxRate).toBeNull();
  });

  it('maps a transfer row with no mutation amount', () => {
    const { record, issues } = mapRow(transferRow, frenchDialect);
    expect(issues).toHaveLength(0);
    expect(record?.product).toBeNull();
    expect(record?.isin).toBeNull();
    expect(record?.mutation).toBeNull();
    expect(record?.balance?.toString()).toBe('12467.74 EUR');
    expect(record?.orderId).toBeNull();
    expect(record?.line).toBeUndefined();
  });

  it('captures the FX rate from the FX column', () => {
    const { record } = mapRow(fxRow, frenchDialect);
    expect(record?.fxRate).toBe('1.0701');
    expect(record?.mutation?.toString()).toBe('-14.32 USD');
  });

  it('drops a row with an invalid date and reports an error', () => {
    const bad = [...buyRow];
    bad[0] = 'not-a-date';
    const { record, issues } = mapRow(bad, frenchDialect, 42);
    expect(record).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.line).toBe(42);
  });
});

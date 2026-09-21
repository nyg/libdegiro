import { describe, it, expect } from 'vitest';
import { readFileSync, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { parseDegiroCsv, frenchDialect, UnknownDialectError, DegiroError } from '../src/index';
import type { Movement, TradeMovement } from '../src/index';
import { parseDegiroFile, parseDegiroFileSync, parseDegiroStream } from '../src/node';

const fixturePath = fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url));
const fixture = readFileSync(fixturePath, 'utf8');

describe('parseDegiroCsv', () => {
  const result = parseDegiroCsv(fixture);

  it('detects the French dialect and parses every data row', () => {
    expect(result.dialect.id).toBe('fr');
    expect(result.records).toHaveLength(236);
    expect(result.movements).toHaveLength(236);
  });

  it('reports no errors or warnings for the clean sample', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('groups movements into transactions without losing any', () => {
    const grouped = result.transactions.flatMap((t) => t.movements);
    expect(grouped).toHaveLength(result.movements.length);
    expect(result.transactions.length).toBeLessThan(result.movements.length);
  });

  it('throws on empty input', () => {
    expect(() => parseDegiroCsv('')).toThrow(DegiroError);
  });

  it('throws UnknownDialectError on an unrecognised header', () => {
    expect(() => parseDegiroCsv('a,b,c\n1,2,3\n')).toThrow(UnknownDialectError);
  });

  it('accepts a forced dialect, skipping detection', () => {
    const forced = parseDegiroCsv(fixture, { dialect: frenchDialect });
    expect(forced.records).toHaveLength(236);
  });
});

describe('file helpers', () => {
  it('parses from a path asynchronously', async () => {
    const result = await parseDegiroFile(fixturePath);
    expect(result.records).toHaveLength(236);
  });

  it('parses from a path synchronously', () => {
    const result = parseDegiroFileSync(fixturePath);
    expect(result.records).toHaveLength(236);
  });
});

describe('streaming', () => {
  it('produces the same result as the synchronous parser', async () => {
    const streamed = await parseDegiroStream(createReadStream(fixturePath));
    const sync = parseDegiroCsv(fixture);
    expect(streamed.records).toHaveLength(sync.records.length);
    expect(streamed.movements).toHaveLength(sync.movements.length);
    expect(streamed.transactions).toHaveLength(sync.transactions.length);
    expect(streamed.dialect.id).toBe('fr');
  });

  it('detects the dialect through a UTF-8 BOM', async () => {
    const streamed = await parseDegiroStream(Readable.from([`\uFEFF${fixture}`]));
    expect(streamed.dialect.id).toBe('fr');
    expect(streamed.records).toHaveLength(236);
  });
});

describe('descriptions DEGIRO wrapped onto a continuation row', () => {
  const wrapped = [
    'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre',
    '18-03-2025,09:23,18-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,Achat 10 Vanguard FTSE All-World UCITS ETF USD,,CHF,"-1105,00",CHF,"5000,00",0f5e1c2a-0000-4000-8000-000000000001',
    ',,,,,"Dis@110,5 CHF (IE00B3RBWM25)",,,,,,',
    '17-03-2025,10:36,17-03-2025,UBS SPI  MID ETF CHF DIS,CH0130595124,"Achat 10 UBS SPI  Mid ETF CHF dis@100,2 CHF",,CHF,"-1002,00",CHF,"6105,00",0f5e1c2a-0000-4000-8000-000000000002',
    ',,,,,(CH0130595124),,,,,,',
    '17-03-2025,10:35,17-03-2025,,,Degiro Cash Sweep Transfer,,CHF,"100,00",CHF,"7107,00",',
    '',
  ].join('\n');

  const result = parseDegiroCsv(wrapped);

  it('joins each continuation row onto the row above instead of dropping it', () => {
    expect(result.errors).toHaveLength(0);
    expect(result.records.map((record) => [record.line, record.description])).toEqual([
      [2, 'Achat 10 Vanguard FTSE All-World UCITS ETF USD Dis@110,5 CHF (IE00B3RBWM25)'],
      [4, 'Achat 10 UBS SPI  Mid ETF CHF dis@100,2 CHF (CH0130595124)'],
      [6, 'Degiro Cash Sweep Transfer'],
    ]);
  });

  it('classifies the joined description as the trade it describes', () => {
    const trades = result.movements.filter(
      (movement: Movement): movement is TradeMovement => movement.kind === 'buy',
    );
    expect(trades.map((trade) => [trade.isin, trade.quantity])).toEqual([
      ['IE00B3RBWM25', 10],
      ['CH0130595124', 10],
    ]);
  });

  it('joins the same rows when streaming', async () => {
    const streamed = await parseDegiroStream(Readable.from([wrapped]));
    expect(streamed.errors).toHaveLength(0);
    expect(streamed.records.map((record) => record.description)).toEqual(
      result.records.map((record) => record.description),
    );
  });

  it('still reports a continuation row that has no row above it', () => {
    const orphan = parseDegiroCsv(
      [
        'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre',
        ',,,,,(CH0130595124),,,,,,',
        '',
      ].join('\n'),
    );
    expect(orphan.records).toHaveLength(0);
    expect(orphan.errors.map((issue) => issue.line)).toEqual([2]);
  });
});

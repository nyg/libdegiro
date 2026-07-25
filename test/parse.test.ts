import { describe, it, expect } from 'vitest';
import { readFileSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseDegiroCsv,
  parseDegiroFile,
  parseDegiroFileSync,
  parseDegiroStream,
  frenchDialect,
  UnknownDialectError,
  DegiroError,
} from '../src/index';

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
});

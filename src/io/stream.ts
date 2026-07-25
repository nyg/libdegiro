import type { Readable } from 'node:stream';
import { createCsvRowStream } from '../csv/rowStream';
import { mapRow, type RawRecord } from '../records/rawRecord';
import { DegiroError, type ParseIssue } from '../errors';
import type { Dialect } from '../dialects/types';
import {
  assembleResult,
  resolveDialectRegistry,
  type ParseOptions,
  type ParseResult,
} from '../internal';

/**
 * Parse a DEGIRO export from a Node {@link Readable} stream.
 *
 * Rows are tokenized incrementally (so the raw text is never fully buffered),
 * then classified and grouped once the stream ends. Ideal for very large files.
 *
 * @throws {DegiroError} when the stream yields no rows.
 * @throws {UnknownDialectError} when no dialect recognises the header.
 */
export async function parseDegiroStream(
  source: Readable,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const parser = source.pipe(createCsvRowStream({ delimiter: options.delimiter }));
  const registry = resolveDialectRegistry(options.dialects);

  let dialect: Dialect | null = options.dialect ?? null;
  let header: string[] | null = null;
  const records: RawRecord[] = [];
  const issues: ParseIssue[] = [];
  let line = 0;

  for await (const row of parser as AsyncIterable<string[]>) {
    line += 1;
    if (header === null) {
      header = row;
      if (dialect === null) dialect = registry.detect(header);
      continue;
    }
    const result = mapRow(row, dialect!, line);
    issues.push(...result.issues);
    if (result.record) records.push(result.record);
  }

  if (dialect === null) {
    throw new DegiroError('Cannot parse an empty CSV stream');
  }

  return assembleResult({
    dialect,
    records,
    issues,
    classifier: options.classifier,
    strategies: options.groupingStrategies,
  });
}

import { tokenizeCsv, type CsvRow } from './csv/tokenizer';
import { mapRow, type RawRecord } from './records/rawRecord';
import { DegiroError, type ParseIssue } from './errors';
import {
  assembleResult,
  dialectIssues,
  resolveDialectRegistry,
  type ParseOptions,
  type ParseResult,
} from './internal';

export type { ParseOptions, ParseResult } from './internal';

const FALLBACK_DELIMITERS = [';', '\t'] as const;

function tokenizeRows(input: string, options: ParseOptions): CsvRow[] {
  const rows = tokenizeCsv(input, { delimiter: options.delimiter });
  if (options.delimiter !== undefined || (rows[0]?.length ?? 0) > 1) return rows;

  for (const delimiter of FALLBACK_DELIMITERS) {
    const retried = tokenizeCsv(input, { delimiter });
    if ((retried[0]?.length ?? 0) > 1) return retried;
  }
  return rows;
}

/**
 * Parse the text of a DEGIRO `Account.csv` export into a typed result.
 *
 * Parsing is lenient: per-row problems are collected on {@link ParseResult.errors}
 * and `warnings` rather than thrown. The only fatal conditions are an empty input
 * and a header that matches no known dialect.
 *
 * @throws {DegiroError} when the input contains no rows.
 * @throws {UnknownDialectError} when no dialect recognises the header.
 */
export function parseDegiroCsv(input: string, options: ParseOptions = {}): ParseResult {
  const rows = tokenizeRows(input, options);
  if (rows.length === 0) {
    throw new DegiroError('Cannot parse an empty CSV input');
  }

  const header = rows[0]!;
  const dialect = options.dialect ?? resolveDialectRegistry(options.dialects).detect(header);

  const records: RawRecord[] = [];
  const issues: ParseIssue[] = [...dialectIssues(dialect, header)];
  for (let i = 1; i < rows.length; i++) {
    const result = mapRow(rows[i]!, dialect, i + 1);
    issues.push(...result.issues);
    if (result.record) records.push(result.record);
  }

  return assembleResult({
    dialect,
    records,
    issues,
    classifier: options.classifier,
    strategies: options.groupingStrategies,
  });
}

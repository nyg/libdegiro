import { parse as parseSync } from 'csv-parse/sync';
import { parse as parseStream, type Parser } from 'csv-parse';

/** A single CSV row as an array of raw, untrimmed string cells. */
export type CsvRow = string[];

/** Options controlling how raw CSV text is split into rows and cells. */
export interface TokenizeOptions {
  /** Field delimiter. Defaults to `,`. */
  readonly delimiter?: string;
}

const baseOptions = (options: TokenizeOptions) =>
  ({
    delimiter: options.delimiter ?? ',',
    // DEGIRO rows occasionally vary in trailing-column count.
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    // Preserve values exactly (double spaces in product names, etc.).
    trim: false,
    bom: true,
  }) as const;

/**
 * Tokenize CSV text into rows of raw string cells (RFC 4180 compliant, including
 * quoted fields with embedded commas). The header row is returned as the first row.
 */
export function tokenizeCsv(input: string, options: TokenizeOptions = {}): CsvRow[] {
  return parseSync(input, baseOptions(options)) as CsvRow[];
}

/**
 * Create a streaming CSV tokenizer. The returned {@link Parser} is a Node
 * Transform stream that emits one {@link CsvRow} per data row (header included).
 *
 * Use this to process very large exports without materialising the whole file.
 */
export function createCsvRowStream(options: TokenizeOptions = {}): Parser {
  return parseStream(baseOptions(options));
}

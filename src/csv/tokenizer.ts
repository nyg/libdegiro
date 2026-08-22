import Papa from 'papaparse';
import { papaParseOptions, type TokenizeOptions } from './options';

export type { TokenizeOptions } from './options';

/** A single CSV row as an array of raw, untrimmed string cells. */
export type CsvRow = string[];

/**
 * Tokenize CSV text into rows of raw string cells (RFC 4180 compliant, including
 * quoted fields with embedded commas). The header row is returned as the first row.
 */
export function tokenizeCsv(input: string, options: TokenizeOptions = {}): CsvRow[] {
  return Papa.parse<CsvRow>(input, papaParseOptions(options)).data;
}

import type { Duplex } from 'node:stream';
import Papa from 'papaparse';
import { papaParseOptions, type TokenizeOptions } from './options';

/**
 * Create a streaming CSV tokenizer. The returned {@link Duplex} is a Node
 * Transform stream that emits one {@link CsvRow} per data row (header included).
 *
 * Use this to process very large exports without materialising the whole file.
 *
 * Node only — exported from `libdegiro/node`.
 */
export function createCsvRowStream(options: TokenizeOptions = {}): Duplex {
  return Papa.parse(Papa.NODE_STREAM_INPUT, papaParseOptions(options));
}

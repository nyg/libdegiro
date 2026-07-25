import { parse as parseStream, type Parser } from 'csv-parse';
import { csvParseOptions, type TokenizeOptions } from './options';

/**
 * Create a streaming CSV tokenizer. The returned {@link Parser} is a Node
 * Transform stream that emits one {@link CsvRow} per data row (header included).
 *
 * Use this to process very large exports without materialising the whole file.
 *
 * Node only — exported from `libdegiro/node`.
 */
export function createCsvRowStream(options: TokenizeOptions = {}): Parser {
  return parseStream(csvParseOptions(options));
}

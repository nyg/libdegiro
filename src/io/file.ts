import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parseDegiroCsv } from '../parse';
import type { ParseOptions, ParseResult } from '../internal';

/** Read and parse a DEGIRO export from a file path (async). */
export async function parseDegiroFile(
  path: string | URL,
  options?: ParseOptions,
): Promise<ParseResult> {
  const content = await readFile(path, 'utf8');
  return parseDegiroCsv(content, options);
}

/** Read and parse a DEGIRO export from a file path (synchronous). */
export function parseDegiroFileSync(path: string | URL, options?: ParseOptions): ParseResult {
  return parseDegiroCsv(readFileSync(path, 'utf8'), options);
}

import type { CsvRow } from '../csv/tokenizer';
import type { Dialect } from './types';
import { DEGIRO_COLUMNS, SPACE_SEPARATORS, hasHeaderTokens, parseDegiroDateTime } from './common';

const ENGLISH_HEADER_TOKENS = [
  'Date',
  'Time',
  'Product',
  'ISIN',
  'Description',
  'Change',
  'Balance',
] as const;

export function parseEnglishDecimal(raw: string): string | null {
  const trimmed = raw.trim().replace(SPACE_SEPARATORS, '');
  if (trimmed === '') return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const commaIsDecimal = lastComma > lastDot;
    const grouping = commaIsDecimal ? '.' : ',';
    normalized = trimmed.split(grouping).join('').replace(',', '.');
  } else {
    const parts = trimmed.split(lastComma >= 0 ? ',' : '.');
    const grouped = parts.length > 2 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
    normalized = grouped ? parts.join('') : parts.join('.');
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

export const englishDialect: Dialect = {
  id: 'en',
  label: 'DEGIRO English (Account.csv)',
  columns: DEGIRO_COLUMNS,
  matches(header: CsvRow): boolean {
    return hasHeaderTokens(header, ENGLISH_HEADER_TOKENS);
  },
  parseDecimal: parseEnglishDecimal,
  parseDateTime: parseDegiroDateTime,
  parseDate(date: string): Date | null {
    return parseDegiroDateTime(date);
  },
};

import type { CsvRow } from '../csv/tokenizer';
import type { Dialect } from './types';
import {
  DEGIRO_COLUMNS,
  hasHeaderTokens,
  parseDegiroDateTime,
  parseFlexibleDecimal,
} from './common';

const ENGLISH_HEADER_TOKENS = [
  'Date',
  'Time',
  'Product',
  'ISIN',
  'Description',
  'Change',
  'Balance',
] as const;

export const englishDialect: Dialect = {
  id: 'en',
  label: 'DEGIRO English (Account.csv)',
  columns: DEGIRO_COLUMNS,
  matches(header: CsvRow): boolean {
    return hasHeaderTokens(header, ENGLISH_HEADER_TOKENS);
  },
  parseDecimal: parseFlexibleDecimal,
  parseDateTime: parseDegiroDateTime,
  parseDate(date: string): Date | null {
    return parseDegiroDateTime(date);
  },
};

import type { CsvRow } from '../csv/tokenizer';
import type { Dialect } from './types';
import { DEGIRO_COLUMNS, parseFlexibleDateTime, parseFlexibleDecimal } from './common';

const COLUMN_COUNT = 12;
const UNLABELLED_COLUMNS = [8, 10] as const;
const LABELLED_COLUMNS = [0, 1, 2, 3, 4, 5, 6, 7, 9, 11] as const;

export function matchesDegiroLayout(header: CsvRow): boolean {
  if (header.length !== COLUMN_COUNT) return false;
  const cells = header.map((cell) => cell.trim());
  return (
    UNLABELLED_COLUMNS.every((index) => cells[index] === '') &&
    LABELLED_COLUMNS.every((index) => (cells[index] ?? '') !== '')
  );
}

export const genericDialect: Dialect = {
  id: 'generic',
  label: 'DEGIRO (layout detected, language unknown)',
  heuristic: true,
  columns: DEGIRO_COLUMNS,
  matches: matchesDegiroLayout,
  parseDecimal: parseFlexibleDecimal,
  parseDateTime: parseFlexibleDateTime,
  parseDate(date: string): Date | null {
    return parseFlexibleDateTime(date);
  },
};

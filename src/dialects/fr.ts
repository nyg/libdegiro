import type { CsvRow } from '../csv/tokenizer';
import type { Dialect } from './types';
import { DEGIRO_COLUMNS, SPACE_SEPARATORS, hasHeaderTokens, parseDegiroDateTime } from './common';

/** Header tokens that uniquely identify a French export. */
const FRENCH_HEADER_TOKENS = [
  'Date',
  'Heure',
  'Produit',
  'Code ISIN',
  'Description',
  'Mouvements',
  'Solde',
] as const;

/**
 * Parse a French/European decimal string into a plain decimal string.
 *
 * Handles space (and non-breaking space) thousands separators and a comma
 * decimal mark, e.g. `"12 480,5"` -> `"12480.5"`, `"-2145,60"` -> `"-2145.60"`.
 */
export function parseFrenchDecimal(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(SPACE_SEPARATORS, '').replace(/,/g, '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/** Parse a `DD-MM-YYYY` date (optionally with `HH:MM` time) into a UTC `Date`. */
export const parseFrenchDateTime = parseDegiroDateTime;

/**
 * Built-in dialect for the French DEGIRO `Account.csv` export.
 *
 * Dates are `DD-MM-YYYY`; the file carries no timezone, so times are interpreted
 * as UTC wall-clock for deterministic, machine-independent results.
 */
export const frenchDialect: Dialect = {
  id: 'fr',
  label: 'DEGIRO French (Account.csv)',
  columns: DEGIRO_COLUMNS,
  matches(header: CsvRow): boolean {
    return hasHeaderTokens(header, FRENCH_HEADER_TOKENS);
  },
  parseDecimal: parseFrenchDecimal,
  parseDateTime: parseDegiroDateTime,
  parseDate(date: string): Date | null {
    return parseDegiroDateTime(date);
  },
};

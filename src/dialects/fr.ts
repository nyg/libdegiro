import type { CsvRow } from '../csv/tokenizer';
import type { ColumnMap, Dialect } from './types';

/** Positional column layout of the French DEGIRO `Account.csv` export. */
const FRENCH_COLUMNS: ColumnMap = {
  date: 0,
  time: 1,
  valueDate: 2,
  product: 3,
  isin: 4,
  description: 5,
  fx: 6,
  mutationCurrency: 7,
  mutationAmount: 8,
  balanceCurrency: 9,
  balanceAmount: 10,
  orderId: 11,
};

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

const DMY = /^(\d{2})-(\d{2})-(\d{4})$/;
const HM = /^(\d{1,2}):(\d{2})$/;
/** Spaces used as thousands separators, including NBSP / narrow NBSP. */
const THOUSANDS_SEPARATORS = /[\s\u00a0\u202f]/g;

/**
 * Parse a French/European decimal string into a plain decimal string.
 *
 * Handles space (and non-breaking space) thousands separators and a comma
 * decimal mark, e.g. `"12 480,5"` -> `"12480.5"`, `"-2145,60"` -> `"-2145.60"`.
 */
export function parseFrenchDecimal(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(THOUSANDS_SEPARATORS, '').replace(/,/g, '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/** Parse a `DD-MM-YYYY` date (optionally with `HH:MM` time) into a UTC `Date`. */
export function parseFrenchDateTime(date: string, time = '00:00'): Date | null {
  const dateMatch = DMY.exec(date.trim());
  if (!dateMatch) return null;
  const timeMatch = HM.exec(time.trim());
  if (!timeMatch) return null;

  const [, dd, mm, yyyy] = dateMatch;
  const [, hh, min] = timeMatch;
  const ms = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  const result = new Date(ms);
  // Guard against overflow (e.g. 32-13-2026 silently rolling over).
  if (
    result.getUTCDate() !== Number(dd) ||
    result.getUTCMonth() !== Number(mm) - 1 ||
    result.getUTCFullYear() !== Number(yyyy)
  ) {
    return null;
  }
  return result;
}

/**
 * Built-in dialect for the French DEGIRO `Account.csv` export.
 *
 * Dates are `DD-MM-YYYY`; the file carries no timezone, so times are interpreted
 * as UTC wall-clock for deterministic, machine-independent results.
 */
export const frenchDialect: Dialect = {
  id: 'fr',
  label: 'DEGIRO French (Account.csv)',
  columns: FRENCH_COLUMNS,
  matches(header: CsvRow): boolean {
    const cells = header.map((c) => c.trim());
    return FRENCH_HEADER_TOKENS.every((token) => cells.includes(token));
  },
  parseDecimal: parseFrenchDecimal,
  parseDateTime: parseFrenchDateTime,
  parseDate(date: string): Date | null {
    return parseFrenchDateTime(date);
  },
};

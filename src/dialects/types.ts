import type { CsvRow } from '../csv/tokenizer';

/**
 * Maps logical fields to their column index within a DEGIRO export row.
 *
 * The DEGIRO statement pairs a currency cell with an amount cell for both the
 * mutation (`Mouvements`) and the running balance (`Solde`), which is why these
 * are mapped positionally rather than by header name.
 */
export interface ColumnMap {
  /** Booking date column. */
  readonly date: number;
  /** Time-of-day column. */
  readonly time: number;
  /** Value date column. */
  readonly valueDate: number;
  /** Product / instrument name column. */
  readonly product: number;
  /** ISIN code column. */
  readonly isin: number;
  /** Free-text description column. */
  readonly description: number;
  /** FX conversion rate column. */
  readonly fx: number;
  /** Mutation currency column. */
  readonly mutationCurrency: number;
  /** Mutation amount column. */
  readonly mutationAmount: number;
  /** Balance currency column. */
  readonly balanceCurrency: number;
  /** Balance amount column. */
  readonly balanceAmount: number;
  /** Order id column. */
  readonly orderId: number;
}

/**
 * A locale/format adapter for a particular flavour of DEGIRO export.
 *
 * Implement this interface (and register it) to support other languages or
 * column layouts. The built-in {@link frenchDialect} handles the French export.
 */
export interface Dialect {
  /** Stable identifier, e.g. `fr`. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Column index mapping for rows of this dialect. */
  readonly columns: ColumnMap;
  /** Returns `true` if this dialect recognises the given header row. */
  matches(header: CsvRow): boolean;
  /**
   * Parse a localized numeric string into a plain, `big.js`-compatible decimal
   * string (e.g. `"-3 613,80"` -> `"-3613.80"`). Returns `null` when empty or
   * unparseable.
   */
  parseDecimal(raw: string): string | null;
  /** Parse a localized date + time into a `Date`. Returns `null` when invalid. */
  parseDateTime(date: string, time: string): Date | null;
  /** Parse a localized date (no time) into a `Date`. Returns `null` when invalid. */
  parseDate(date: string): Date | null;
}

import type { CsvRow } from '../csv/tokenizer';
import type { Dialect } from '../dialects/types';
import { Money } from '../money/money';
import { createIssue, type ParseIssue } from '../errors';

/**
 * A single statement line, normalised into typed fields. This is the neutral
 * representation every classifier and grouper operates on.
 */
export interface RawRecord {
  /** 1-based source line number (including the header), if known. */
  readonly line?: number;
  /** Booking date and time (`Date` + `Heure`). */
  readonly bookingDate: Date;
  /** Value date (no time component). */
  readonly valueDate: Date;
  /** Product / instrument name, or `null`. */
  readonly product: string | null;
  /** ISIN code, or `null`. */
  readonly isin: string | null;
  /** Raw description text. */
  readonly description: string;
  /** FX conversion rate as a decimal string, or `null`. */
  readonly fxRate: string | null;
  /** Signed mutation (money in/out), or `null` when the row has no movement. */
  readonly mutation: Money | null;
  /** Running account balance after this line, or `null` when absent. */
  readonly balance: Money | null;
  /** DEGIRO order id linking related legs, or `null`. */
  readonly orderId: string | null;
  /** Original raw cells, preserved verbatim. */
  readonly raw: readonly string[];
}

/** Result of mapping a single row. */
export interface MapRowResult {
  /** The mapped record, or `null` when the row could not be mapped. */
  readonly record: RawRecord | null;
  /** Issues collected while mapping (errors and/or warnings). */
  readonly issues: readonly ParseIssue[];
}

function nullIfEmpty(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function readMoney(
  dialect: Dialect,
  currencyCell: string | undefined,
  amountCell: string | undefined,
): { money: Money | null; amountWasPresent: boolean; parseFailed: boolean } {
  const currency = nullIfEmpty(currencyCell);
  const rawAmount = (amountCell ?? '').trim();
  if (currency === null && rawAmount === '') {
    return { money: null, amountWasPresent: false, parseFailed: false };
  }
  const amount = dialect.parseDecimal(rawAmount);
  if (currency === null || amount === null) {
    return { money: null, amountWasPresent: rawAmount !== '', parseFailed: true };
  }
  return { money: new Money(amount, currency), amountWasPresent: true, parseFailed: false };
}

/**
 * Map a tokenized CSV row into a {@link RawRecord} using the given dialect.
 *
 * Lenient: rows with an unparseable booking/value date are dropped with an error
 * issue; partially-parseable money cells yield a warning and a `null` amount.
 */
export function mapRow(row: CsvRow, dialect: Dialect, line?: number): MapRowResult {
  const issues: ParseIssue[] = [];
  const cols = dialect.columns;

  const bookingDate = dialect.parseDateTime(row[cols.date] ?? '', row[cols.time] ?? '');
  const valueDate = dialect.parseDate(row[cols.valueDate] ?? '');

  if (bookingDate === null || valueDate === null) {
    issues.push(
      createIssue('error', 'map', 'Row has an unparseable date and was skipped', {
        line,
        raw: row,
      }),
    );
    return { record: null, issues };
  }

  const mutation = readMoney(dialect, row[cols.mutationCurrency], row[cols.mutationAmount]);
  if (mutation.parseFailed) {
    issues.push(
      createIssue('warning', 'map', 'Mutation amount could not be parsed', {
        line,
        raw: row,
      }),
    );
  }

  const balance = readMoney(dialect, row[cols.balanceCurrency], row[cols.balanceAmount]);
  if (balance.parseFailed) {
    issues.push(
      createIssue('warning', 'map', 'Balance amount could not be parsed', {
        line,
        raw: row,
      }),
    );
  }

  const record: RawRecord = {
    ...(line !== undefined ? { line } : {}),
    bookingDate,
    valueDate,
    product: nullIfEmpty(row[cols.product]),
    isin: nullIfEmpty(row[cols.isin]),
    description: (row[cols.description] ?? '').trim(),
    fxRate: dialect.parseDecimal((row[cols.fx] ?? '').trim()),
    mutation: mutation.money,
    balance: balance.money,
    orderId: nullIfEmpty(row[cols.orderId]),
    raw: row,
  };

  return { record, issues };
}

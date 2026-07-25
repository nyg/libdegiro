import type { Money } from 'libdegiro';

/**
 * Every date in a DEGIRO statement is a wall-clock time with no timezone, and
 * libdegiro builds them with `Date.UTC`. So every read and every format here is
 * UTC-locked. Using `getMonth()` or a bare `toLocaleDateString()` anywhere in
 * this app would shift rows across day and month boundaries for anyone west of
 * UTC -- a fee booked `01-02-2025 10:02` would land in January.
 */
const UTC = 'UTC';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: UTC,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: UTC,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const monthLabelFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: UTC,
  month: 'short',
  year: 'numeric',
});

const shortMonthFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: UTC,
  month: 'short',
  year: '2-digit',
});

export const formatDate = (date: Date): string => dateFormat.format(date);
export const formatDateTime = (date: Date): string => dateTimeFormat.format(date);
export const formatMonth = (date: Date): string => monthLabelFormat.format(date);
export const formatMonthShort = (date: Date): string => shortMonthFormat.format(date);

/** `YYYY-MM` bucket key, from UTC parts. */
export const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/** First instant of the UTC month containing `date`. */
export const monthStart = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

/** The UTC month `count` months after `date`'s month start. */
export const addMonths = (date: Date, count: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));

export const utcYear = (date: Date): number => date.getUTCFullYear();

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

/**
 * `Money.toNumber()` is lossy, so format from the exact decimal string instead.
 * Statement amounts are far inside double precision, but this keeps the exact
 * value as the single source of truth for anything a user might reconcile.
 */
export function formatMoney(money: Money): string {
  return currencyFormatter(money.currency).format(Number(money.amount.toFixed(2)));
}

/** Absolute value, for contexts where the sign is carried by a label instead. */
export function formatMoneyAbs(money: Money): string {
  return currencyFormatter(money.currency).format(Math.abs(Number(money.amount.toFixed(2))));
}

export function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 }).format(quantity);
}

export function formatPercent(fraction: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fraction);
}

/** Chart axes need a plain number; only ever call this at the chart boundary. */
export const toChartNumber = (money: Money): number => Number(money.amount.toFixed(2));

/** `noUncheckedIndexedAccess` makes `xs[0]` awkward; this reads better. */
export const first = <T>(xs: readonly T[]): T | undefined => xs[0];

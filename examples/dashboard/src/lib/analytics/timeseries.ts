import type { Money, Movement } from 'libdegiro';

export interface BalancePoint {
  readonly date: Date;
  readonly balance: Money;
  readonly line: number | null;
}

/**
 * The running cash balance for one currency, oldest first.
 *
 * Three things this has to get right:
 *
 *  - `result.movements` is newest-first and several library functions depend on
 *    that (`cashByCurrency` takes the *first* balance it sees per currency;
 *    `reconcileBalances` defaults to `newestFirst: true`). So copy before
 *    reversing — never sort the caller's array in place.
 *  - `cashTransfer` rows mirror the separate flatexDEGIRO cash account, not the
 *    trading account, and carry that account's balance. Including them would
 *    interleave two different series. `cashByCurrency` excludes them for the
 *    same reason.
 *  - Each row carries a balance for one currency only, so a CHF-settled day
 *    simply produces no EUR point. That is a real gap, not missing data to fill.
 */
export function balanceSeries(movements: readonly Movement[], currency: string): BalancePoint[] {
  const points: BalancePoint[] = [];

  for (const movement of [...movements].reverse()) {
    if (movement.kind === 'cashTransfer') continue;
    const { balance, bookingDate, line } = movement.record;
    if (balance === null || balance.currency !== currency) continue;

    // Several rows can share a timestamp; the last one chronologically is the
    // balance that stood at the end of that instant.
    const previous = points[points.length - 1];
    if (previous && previous.date.getTime() === bookingDate.getTime()) {
      points[points.length - 1] = { date: bookingDate, balance, line: line ?? null };
      continue;
    }
    points.push({ date: bookingDate, balance, line: line ?? null });
  }

  return points;
}

/** Currencies that have at least one balance point, sorted. */
export function balanceCurrencies(movements: readonly Movement[]): string[] {
  const currencies = new Set<string>();
  for (const movement of movements) {
    if (movement.kind === 'cashTransfer') continue;
    if (movement.record.balance) currencies.add(movement.record.balance.currency);
  }
  return [...currencies].sort();
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

/** The span the statement itself covers, by booking date. */
export function statementRange(movements: readonly Movement[]): DateRange | null {
  if (movements.length === 0) return null;
  let from = movements[0]!.record.bookingDate;
  let to = movements[0]!.record.bookingDate;
  for (const movement of movements) {
    const date = movement.record.bookingDate;
    if (date < from) from = date;
    if (date > to) to = date;
  }
  return { from, to };
}

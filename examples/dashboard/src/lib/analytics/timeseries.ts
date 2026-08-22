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
 *  - `Solde` is one running balance, not one per account. A sweep and its
 *    `Virement` mirror are two entries in that stream that cancel out, and they
 *    always share a timestamp, so the collapse below leaves the pair's closing
 *    balance and hides the intermediate spike. Dropping either kind instead
 *    would strand the series on a balance that never stood.
 *  - Each row carries a balance for one currency only, so a CHF-settled day
 *    simply produces no EUR point. That is a real gap, not missing data to fill.
 */
export function balanceSeries(movements: readonly Movement[], currency: string): BalancePoint[] {
  const points: BalancePoint[] = [];

  for (const movement of [...movements].reverse()) {
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

/**
 * One point per calendar day: the balance that stood at the end of that day's
 * activity, oldest first.
 *
 * A trading session books a dozen rows inside an hour. On an axis spanning
 * years that whole session lands inside a pixel or two, so the raw series ends
 * in a stack of points that cannot be told apart or hovered individually — and
 * every one of them carries the same date label, which is how you end up
 * reading a mid-session balance as the current one. Collapsing to the day makes
 * the label true: one date, one value.
 *
 * The point keeps the closing row's real timestamp rather than snapping to
 * midnight, so it still sits where the activity happened.
 */
export function dailyBalanceSeries(
  movements: readonly Movement[],
  currency: string,
): BalancePoint[] {
  const days: BalancePoint[] = [];

  for (const point of balanceSeries(movements, currency)) {
    const previous = days[days.length - 1];
    if (previous && isSameUtcDay(previous.date, point.date)) {
      days[days.length - 1] = point;
      continue;
    }
    days.push(point);
  }

  return days;
}

const isSameUtcDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/** Currencies that have at least one balance point, sorted. */
export function balanceCurrencies(movements: readonly Movement[]): string[] {
  const currencies = new Set<string>();
  for (const movement of movements) {
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

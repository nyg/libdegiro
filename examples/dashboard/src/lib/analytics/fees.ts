import {
  Money,
  sumByCurrency,
  type BrokerageFeeMovement,
  type ConnectivityFeeMovement,
  type Movement,
} from 'libdegiro';
import { monthKey, monthStart, addMonths } from '@/lib/format';
import { parseExchange, type ExchangeRef } from './exchange';

/**
 * Two invariants hold throughout this module, and the signatures enforce them:
 *
 *  1. Nothing is ever netted across currencies. Aggregates either return
 *     `Money[]` (one per currency, via `sumByCurrency`) or take an explicit
 *     `currency` and filter to it. DEGIRO books fees in EUR against trades that
 *     settle in CHF, and this dashboard has no FX rate to bridge them.
 *  2. Amounts stay signed as booked, i.e. negative. Flipping to positive is a
 *     presentation choice and belongs in the chart adapter, not here.
 */

export type FeeCategory = 'brokerage' | 'connectivity';

/** A fee movement flattened into what a UI actually needs. */
export interface FeeEntry {
  readonly category: FeeCategory;
  /** Signed as booked (negative). */
  readonly amount: Money;
  readonly currency: string;
  /** `record.bookingDate` — when it hit the account. */
  readonly date: Date;
  readonly valueDate: Date;
  readonly line: number | null;
  readonly description: string;
  readonly product: string | null;
  readonly isin: string | null;
  readonly orderId: string | null;
  /** Connectivity only: the year the fee is *for*, which may differ from `date`. */
  readonly year: number | null;
  /** Connectivity only, and null when the description could not be parsed. */
  readonly exchange: ExchangeRef | null;
}

export interface FeeCollection {
  readonly entries: readonly FeeEntry[];
  /**
   * Fee rows with no parseable amount. Never silently dropped — the health
   * panel reports them.
   */
  readonly skipped: readonly Movement[];
}

const isBrokerage = (m: Movement): m is BrokerageFeeMovement => m.kind === 'brokerageFee';
const isConnectivity = (m: Movement): m is ConnectivityFeeMovement => m.kind === 'connectivityFee';

/** Flatten every fee movement in a statement into {@link FeeEntry} records. */
export function collectFees(movements: readonly Movement[]): FeeCollection {
  const entries: FeeEntry[] = [];
  const skipped: Movement[] = [];

  for (const movement of movements) {
    const brokerage = isBrokerage(movement);
    if (!brokerage && !isConnectivity(movement)) continue;

    if (movement.amount === null) {
      skipped.push(movement);
      continue;
    }

    const { record } = movement;
    entries.push({
      category: brokerage ? 'brokerage' : 'connectivity',
      amount: movement.amount,
      currency: movement.amount.currency,
      date: record.bookingDate,
      valueDate: record.valueDate,
      line: record.line ?? null,
      description: record.description,
      product: brokerage ? movement.product : null,
      isin: brokerage ? movement.isin : null,
      orderId: brokerage ? movement.orderId : null,
      year: brokerage ? null : movement.year,
      exchange: brokerage ? null : parseExchange(record.description),
    });
  }

  return { entries, skipped };
}

export const inCurrency = (entries: readonly FeeEntry[], currency: string): readonly FeeEntry[] =>
  entries.filter((entry) => entry.currency === currency);

export const ofCategory = (
  entries: readonly FeeEntry[],
  category: FeeCategory,
): readonly FeeEntry[] => entries.filter((entry) => entry.category === category);

export interface FeeTotals {
  readonly brokerage: readonly Money[];
  readonly connectivity: readonly Money[];
  readonly all: readonly Money[];
  /** Union of every currency any fee was booked in, sorted. */
  readonly currencies: readonly string[];
  readonly count: { readonly brokerage: number; readonly connectivity: number };
  /** Distinct orders that carried at least one brokerage fee. */
  readonly orderCount: number;
}

/**
 * Per-currency totals split by category.
 *
 * `summarizePortfolio().fees` folds brokerage and connectivity into a single
 * `Money[]`, which is exactly the distinction a fee dashboard exists to draw.
 */
export function totalFees(entries: readonly FeeEntry[]): FeeTotals {
  const brokerage = ofCategory(entries, 'brokerage');
  const connectivity = ofCategory(entries, 'connectivity');
  const orderIds = new Set(
    brokerage.map((entry) => entry.orderId).filter((id): id is string => id !== null),
  );

  return {
    brokerage: sumByCurrency(brokerage.map((entry) => entry.amount)),
    connectivity: sumByCurrency(connectivity.map((entry) => entry.amount)),
    all: sumByCurrency(entries.map((entry) => entry.amount)),
    currencies: [...new Set(entries.map((entry) => entry.currency))].sort(),
    count: { brokerage: brokerage.length, connectivity: connectivity.length },
    orderCount: orderIds.size,
  };
}

/**
 * Mean brokerage fee per order, in one currency.
 *
 * Both sides are filtered to `currency` first: dividing a EUR total by an order
 * count that includes CHF-only orders would quietly understate the average.
 */
export function averageFeePerOrder(entries: readonly FeeEntry[], currency: string): Money | null {
  const scoped = ofCategory(inCurrency(entries, currency), 'brokerage');
  const orders = new Set(
    scoped.map((entry) => entry.orderId).filter((id): id is string => id !== null),
  );
  if (orders.size === 0) return null;

  const total = scoped.reduce((sum, entry) => sum.add(entry.amount), Money.zero(currency));
  // Divide the underlying Big rather than `times(1 / n)`, which would round-trip
  // through a float. `Money` accepts a Big directly, so big.js stays out of the app.
  return new Money(total.amount.div(orders.size), currency);
}

export interface FeeMonthBucket {
  /** `YYYY-MM`. */
  readonly month: string;
  readonly start: Date;
  readonly brokerage: Money;
  readonly connectivity: Money;
  readonly total: Money;
  readonly count: number;
}

export interface FeesByMonthOptions {
  /**
   * Emit empty months between the first and last bucket. Without this a bar
   * chart silently implies fees were charged every month.
   */
  readonly fill?: boolean;
  /** Force the span, e.g. to match the statement's own date range. */
  readonly range?: readonly [Date, Date];
}

/** Bucket fees into UTC calendar months, for a single currency. */
export function feesByMonth(
  entries: readonly FeeEntry[],
  currency: string,
  options: FeesByMonthOptions = {},
): FeeMonthBucket[] {
  const scoped = inCurrency(entries, currency);
  const zero = Money.zero(currency);

  const buckets = new Map<
    string,
    { start: Date; brokerage: Money; connectivity: Money; count: number }
  >();
  const emptyBucket = (start: Date) => ({
    start,
    brokerage: zero,
    connectivity: zero,
    count: 0,
  });

  for (const entry of scoped) {
    const key = monthKey(entry.date);
    const bucket = buckets.get(key) ?? emptyBucket(monthStart(entry.date));
    buckets.set(key, {
      start: bucket.start,
      brokerage:
        entry.category === 'brokerage' ? bucket.brokerage.add(entry.amount) : bucket.brokerage,
      connectivity:
        entry.category === 'connectivity'
          ? bucket.connectivity.add(entry.amount)
          : bucket.connectivity,
      count: bucket.count + 1,
    });
  }

  if (options.fill !== false) {
    const span = options.range ?? spanOf(scoped);
    if (span) {
      for (let cursor = monthStart(span[0]); cursor <= span[1]; cursor = addMonths(cursor, 1)) {
        const key = monthKey(cursor);
        if (!buckets.has(key)) buckets.set(key, emptyBucket(cursor));
      }
    }
  }

  return [...buckets.entries()]
    .map(([month, bucket]) => ({
      month,
      start: bucket.start,
      brokerage: bucket.brokerage,
      connectivity: bucket.connectivity,
      total: bucket.brokerage.add(bucket.connectivity),
      count: bucket.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function spanOf(entries: readonly FeeEntry[]): readonly [Date, Date] | null {
  if (entries.length === 0) return null;
  let min = entries[0]!.date;
  let max = entries[0]!.date;
  for (const entry of entries) {
    if (entry.date < min) min = entry.date;
    if (entry.date > max) max = entry.date;
  }
  return [min, max];
}

export interface CumulativeFeePoint {
  readonly month: string;
  readonly date: Date;
  readonly brokerage: Money;
  readonly connectivity: Money;
  /** Running total of every fee up to and including this month. */
  readonly cumulative: Money;
}

/** Running fee total by month. Monotonically decreasing, since fees are negative. */
export function cumulativeFees(
  entries: readonly FeeEntry[],
  currency: string,
  options: FeesByMonthOptions = {},
): CumulativeFeePoint[] {
  const zero = Money.zero(currency);
  let brokerage = zero;
  let connectivity = zero;

  return feesByMonth(entries, currency, options).map((bucket) => {
    brokerage = brokerage.add(bucket.brokerage);
    connectivity = connectivity.add(bucket.connectivity);
    return {
      month: bucket.month,
      date: bucket.start,
      brokerage,
      connectivity,
      cumulative: brokerage.add(connectivity),
    };
  });
}

export interface FeeGroup {
  /** ISIN when known, else the product name. */
  readonly key: string;
  readonly label: string;
  readonly isin: string | null;
  readonly total: Money;
  readonly count: number;
  readonly firstDate: Date;
  readonly lastDate: Date;
}

/**
 * Brokerage fees grouped by instrument, heaviest first. Connectivity fees are
 * excluded: they carry no product, so they would form one meaningless bucket.
 */
export function feesByProduct(entries: readonly FeeEntry[], currency: string): FeeGroup[] {
  const scoped = ofCategory(inCurrency(entries, currency), 'brokerage');
  const groups = new Map<
    string,
    {
      label: string;
      isin: string | null;
      total: Money;
      count: number;
      firstDate: Date;
      lastDate: Date;
    }
  >();

  for (const entry of scoped) {
    const key = entry.isin ?? entry.product ?? 'Unattributed';
    const existing = groups.get(key);
    if (existing) {
      groups.set(key, {
        ...existing,
        label:
          existing.label === 'Unattributed' ? (entry.product ?? existing.label) : existing.label,
        total: existing.total.add(entry.amount),
        count: existing.count + 1,
        firstDate: entry.date < existing.firstDate ? entry.date : existing.firstDate,
        lastDate: entry.date > existing.lastDate ? entry.date : existing.lastDate,
      });
    } else {
      groups.set(key, {
        label: entry.product ?? entry.isin ?? 'Unattributed',
        isin: entry.isin,
        total: entry.amount,
        count: 1,
        firstDate: entry.date,
        lastDate: entry.date,
      });
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...group }))
    .sort((a, b) => Number(b.total.abs().amount.minus(a.total.abs().amount)));
}

export interface ConnectivityFeeGroup {
  /** The year the fee is *for*, which is often not the year it was booked. */
  readonly year: number | null;
  readonly exchange: ExchangeRef | null;
  readonly total: Money;
  readonly count: number;
  readonly entries: readonly FeeEntry[];
}

/**
 * Connectivity fees grouped by fee year and venue.
 *
 * `year` comes from the description, not the booking date, and the two really do
 * diverge — the sample statement's 2025 fee was booked in October 2024. The UI
 * shows both columns because that divergence is the answer to "why now?".
 */
export function connectivityFeesByYearAndExchange(
  entries: readonly FeeEntry[],
  currency: string,
): ConnectivityFeeGroup[] {
  const scoped = ofCategory(inCurrency(entries, currency), 'connectivity');
  const groups = new Map<string, ConnectivityFeeGroup>();

  for (const entry of scoped) {
    const key = `${entry.year ?? '?'}|${entry.exchange?.label ?? '?'}`;
    const existing = groups.get(key);
    groups.set(
      key,
      existing
        ? {
            ...existing,
            total: existing.total.add(entry.amount),
            count: existing.count + 1,
            entries: [...existing.entries, entry],
          }
        : {
            year: entry.year,
            exchange: entry.exchange,
            total: entry.amount,
            count: 1,
            entries: [entry],
          },
    );
  }

  return [...groups.values()].sort(
    (a, b) =>
      (b.year ?? 0) - (a.year ?? 0) ||
      (a.exchange?.label ?? '').localeCompare(b.exchange?.label ?? ''),
  );
}

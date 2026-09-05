import { sumByCurrency, type Money, type Movement, type PortfolioOptions } from 'libdegiro';
import { utcYear } from '@/lib/format';
import { totalIn, type ConvertedTotal, type DatedAmount } from './convert';

/** Dividends and the tax withheld on them, for one instrument. */
export interface DividendGroup {
  readonly key: string;
  readonly label: string;
  readonly isin: string | null;
  readonly gross: readonly Money[];
  readonly tax: readonly Money[];
  readonly net: readonly Money[];
  readonly count: number;
  readonly lastDate: Date;
  /**
   * Effective withholding rate, or null when gross and tax were booked in
   * different currencies (or nothing was withheld).
   */
  readonly withholdingRate: number | null;
}

type DividendKind = 'dividend' | 'dividendTax';

const isDividendish = (m: Movement): m is Movement & { kind: DividendKind } =>
  m.kind === 'dividend' || m.kind === 'dividendTax';

/** Group dividends and withholding tax by instrument, largest gross first. */
export function dividendsByInstrument(movements: readonly Movement[]): DividendGroup[] {
  const buckets = new Map<
    string,
    {
      label: string;
      isin: string | null;
      gross: Money[];
      tax: Money[];
      count: number;
      lastDate: Date;
    }
  >();

  for (const movement of movements) {
    if (!isDividendish(movement) || movement.amount === null) continue;

    const isin = movement.isin;
    const key = isin ?? movement.product ?? 'Unattributed';
    const date = movement.record.bookingDate;
    const bucket = buckets.get(key) ?? {
      label: movement.product ?? isin ?? 'Unattributed',
      isin,
      gross: [],
      tax: [],
      count: 0,
      lastDate: date,
    };

    if (movement.kind === 'dividend') bucket.gross.push(movement.amount);
    else bucket.tax.push(movement.amount);

    buckets.set(key, {
      ...bucket,
      count: bucket.count + 1,
      lastDate: date > bucket.lastDate ? date : bucket.lastDate,
    });
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const gross = sumByCurrency(bucket.gross);
      const tax = sumByCurrency(bucket.tax);
      return {
        key,
        label: bucket.label,
        isin: bucket.isin,
        gross,
        tax,
        net: sumByCurrency([...bucket.gross, ...bucket.tax]),
        count: bucket.count,
        lastDate: bucket.lastDate,
        withholdingRate: withholdingRate(gross, tax),
      };
    })
    .sort((a, b) => totalMagnitude(b.gross) - totalMagnitude(a.gross));
}

/**
 * Only meaningful when gross and tax share a single currency — the same
 * discipline the fee ratio uses. A cross-currency division would be invented.
 */
function withholdingRate(gross: readonly Money[], tax: readonly Money[]): number | null {
  if (gross.length !== 1 || tax.length !== 1) return null;
  const grossAmount = gross[0]!;
  const taxAmount = tax[0]!;
  if (grossAmount.currency !== taxAmount.currency || grossAmount.isZero()) return null;
  return Number(taxAmount.abs().amount.div(grossAmount.abs().amount).toFixed(6));
}

const totalMagnitude = (amounts: readonly Money[]): number =>
  amounts.reduce((sum, money) => sum + Math.abs(Number(money.amount.toFixed(2))), 0);

export interface YearlyIncome {
  readonly year: number;
  readonly dividends: readonly Money[];
  readonly dividendTax: readonly Money[];
  readonly interest: readonly Money[];
  readonly fees: readonly Money[];
  readonly total: ConvertedTotal;
}

export interface IncomeTotals {
  readonly dividends: ConvertedTotal;
  readonly dividendTax: ConvertedTotal;
  readonly interest: ConvertedTotal;
  readonly fees: ConvertedTotal;
  readonly total: ConvertedTotal;
}

const KINDS_BY_BUCKET = {
  dividends: new Set(['dividend']),
  dividendTax: new Set(['dividendTax']),
  interest: new Set(['interest']),
  fees: new Set(['brokerageFee', 'connectivityFee']),
} as const;

const EVERY_KIND: ReadonlySet<string> = new Set(
  Object.values(KINDS_BY_BUCKET).flatMap((kinds) => [...kinds]),
);

const amountsOf = (rows: readonly Movement[], kinds: ReadonlySet<string>): Money[] =>
  sumByCurrency(rows.filter((m) => kinds.has(m.kind)).map((m) => m.amount));

const datedOf = (rows: readonly Movement[], kinds: ReadonlySet<string>): DatedAmount[] =>
  rows
    .filter((m) => kinds.has(m.kind))
    .flatMap((m) => (m.amount === null ? [] : [{ amount: m.amount, date: m.record.bookingDate }]));

/** Income and cost lines rolled up per UTC calendar year, oldest first. */
export function incomeByYear(
  movements: readonly Movement[],
  fx?: PortfolioOptions | null,
): YearlyIncome[] {
  const years = new Map<number, Movement[]>();
  for (const movement of movements) {
    const year = utcYear(movement.record.bookingDate);
    years.set(year, [...(years.get(year) ?? []), movement]);
  }

  return [...years.entries()]
    .map(([year, rows]) => ({
      year,
      dividends: amountsOf(rows, KINDS_BY_BUCKET.dividends),
      dividendTax: amountsOf(rows, KINDS_BY_BUCKET.dividendTax),
      interest: amountsOf(rows, KINDS_BY_BUCKET.interest),
      fees: amountsOf(rows, KINDS_BY_BUCKET.fees),
      total: totalIn(datedOf(rows, EVERY_KIND), fx),
    }))
    .sort((a, b) => a.year - b.year);
}

export function totalIncome(
  movements: readonly Movement[],
  fx?: PortfolioOptions | null,
): IncomeTotals {
  return {
    dividends: totalIn(datedOf(movements, KINDS_BY_BUCKET.dividends), fx),
    dividendTax: totalIn(datedOf(movements, KINDS_BY_BUCKET.dividendTax), fx),
    interest: totalIn(datedOf(movements, KINDS_BY_BUCKET.interest), fx),
    fees: totalIn(datedOf(movements, KINDS_BY_BUCKET.fees), fx),
    total: totalIn(datedOf(movements, EVERY_KIND), fx),
  };
}

import { Money, convert, type PortfolioOptions } from 'libdegiro';

export interface ConvertedTotal {
  readonly amount: Money | null;
  readonly converted: boolean;
}

export interface DatedAmount {
  readonly amount: Money;
  readonly date: Date;
}

export const UNAVAILABLE: ConvertedTotal = { amount: null, converted: false };

export function referenceCurrency(fx: PortfolioOptions | null | undefined): string | null {
  return fx?.rates && fx.base ? fx.base : null;
}

export function totalIn(
  entries: Iterable<DatedAmount>,
  fx: PortfolioOptions | null | undefined,
): ConvertedTotal {
  const dated = [...entries];
  const rates = fx?.rates ?? null;
  const base = referenceCurrency(fx);
  const currencies = new Set(dated.map((entry) => entry.amount.currency));

  if (currencies.size === 0) {
    return base === null ? UNAVAILABLE : { amount: Money.zero(base), converted: false };
  }

  const only = currencies.size === 1 ? ([...currencies][0] ?? null) : null;
  if (only !== null && (base === null || base === only)) {
    return {
      amount: sum(
        dated.map((entry) => entry.amount),
        only,
      ),
      converted: false,
    };
  }

  if (base === null || rates === null) return UNAVAILABLE;

  const converted: Money[] = [];
  for (const entry of dated) {
    const inBase = convert(entry.amount, base, entry.date, rates);
    if (inBase === null) return UNAVAILABLE;
    converted.push(inBase);
  }

  return { amount: sum(converted, base), converted: true };
}

export function totalAsOf(
  amounts: Iterable<Money>,
  on: Date | null,
  fx: PortfolioOptions | null | undefined,
): ConvertedTotal {
  const dated = [...amounts];
  if (on === null && new Set(dated.map((amount) => amount.currency)).size > 1) return UNAVAILABLE;
  return totalIn(
    dated.map((amount) => ({ amount, date: on ?? EPOCH })),
    fx,
  );
}

const EPOCH = new Date(0);

function sum(amounts: readonly Money[], currency: string): Money {
  return amounts.reduce((total, amount) => total.add(amount), Money.zero(currency));
}

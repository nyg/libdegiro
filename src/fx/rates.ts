import Big from 'big.js';
import { Money } from '../money/money';

const FxBig = Big();
FxBig.DP = 20;

export interface RateTable {
  rateOn(from: string, to: string, date: Date): Big | null;
}

export interface DailyRates {
  readonly [day: string]: { readonly [currency: string]: number | string };
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function convert(money: Money, to: string, on: Date, rates: RateTable): Money | null {
  if (money.currency === to) return money;
  const rate = rates.rateOn(money.currency, to, on);
  return rate === null ? null : new Money(money.amount.times(rate), to);
}

export function ecbRateTable(rates: DailyRates, pivot = 'EUR'): RateTable {
  const days = Object.keys(rates).sort();

  const publishedOnOrBefore = (day: string): string | null => {
    let low = 0;
    let high = days.length - 1;
    let found: string | null = null;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const candidate = days[mid]!;
      if (candidate <= day) {
        found = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found;
  };

  const fromPivot = (day: string, currency: string): Big | null => {
    if (currency === pivot) return new FxBig(1);
    const quoted = rates[day]?.[currency];
    return quoted === undefined ? null : new FxBig(quoted);
  };

  return {
    rateOn(from, to, date) {
      if (from === to) return new FxBig(1);
      const day = publishedOnOrBefore(utcDay(date));
      if (day === null) return null;
      const base = fromPivot(day, from);
      const quote = fromPivot(day, to);
      if (base === null || quote === null || base.eq(0)) return null;
      return quote.div(base);
    },
  };
}

import { utcDay, type Movement } from 'libdegiro';
import type { DateRange } from '@/lib/analytics/timeseries';

export const PIVOT = 'EUR';

export interface RatesRequest {
  readonly from: string;
  readonly to: string;
  readonly symbols: readonly string[];
}

export function statementCurrencies(movements: readonly Movement[]): string[] {
  const seen = new Set<string>();
  for (const movement of movements) {
    if (movement.amount) seen.add(movement.amount.currency);
    if (movement.record.balance) seen.add(movement.record.balance.currency);
    if ((movement.kind === 'buy' || movement.kind === 'sell') && movement.unitPrice) {
      seen.add(movement.unitPrice.currency);
    }
  }
  return [...seen].sort();
}

export function ratesRequest(
  range: DateRange | null,
  currencies: readonly string[],
): RatesRequest | null {
  if (!range) return null;
  const symbols = [...new Set(currencies)].filter((currency) => currency !== PIVOT).sort();
  if (symbols.length === 0) return null;
  return { from: utcDay(range.from), to: utcDay(range.to), symbols };
}

export interface CachedRates {
  readonly from: string;
  readonly to: string;
  readonly symbols: readonly string[];
  readonly fetchedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function cacheCovers(
  cached: CachedRates | undefined,
  request: RatesRequest,
  now: number,
): boolean {
  if (!cached) return false;
  if (cached.from > request.from || cached.to < request.to) return false;
  if (request.symbols.some((symbol) => !cached.symbols.includes(symbol))) return false;
  if (utcDay(new Date(cached.fetchedAt)) > request.to) return true;
  return now - cached.fetchedAt < DAY_MS;
}

export function dominantCurrency(movements: readonly Movement[]): string | null {
  const counts = new Map<string, number>();
  for (const movement of movements) {
    if (!movement.amount) continue;
    counts.set(movement.amount.currency, (counts.get(movement.amount.currency) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [currency, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  }
  return best;
}

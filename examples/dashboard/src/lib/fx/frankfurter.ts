import type { DailyRates } from 'libdegiro';
import { PIVOT, type RatesRequest } from './request';

export const FRANKFURTER_ORIGIN = 'https://api.frankfurter.dev';

export function requestUrl(request: RatesRequest): string {
  const symbols = encodeURIComponent(request.symbols.join(','));
  return `${FRANKFURTER_ORIGIN}/v1/${request.from}..${request.to}?base=${PIVOT}&symbols=${symbols}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function readRates(payload: unknown): DailyRates | null {
  if (!isRecord(payload) || !isRecord(payload.rates)) return null;
  const days: Record<string, Record<string, number>> = {};
  for (const [day, quotes] of Object.entries(payload.rates)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(quotes)) continue;
    const parsed: Record<string, number> = {};
    for (const [currency, rate] of Object.entries(quotes)) {
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) parsed[currency] = rate;
    }
    if (Object.keys(parsed).length > 0) days[day] = parsed;
  }
  return Object.keys(days).length > 0 ? days : null;
}

export async function fetchRates(request: RatesRequest, signal?: AbortSignal): Promise<DailyRates> {
  const response = await fetch(requestUrl(request), {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Frankfurter responded ${response.status}`);
  const rates = readRates(await response.json());
  if (!rates) throw new Error('Frankfurter returned no usable rates');
  return rates;
}

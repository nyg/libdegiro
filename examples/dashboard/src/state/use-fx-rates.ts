import { useEffect, useMemo, useState } from 'react';
import { ecbRateTable, type ParseResult, type RateTable } from 'libdegiro';
import { statementRange } from '@/lib/analytics/timeseries';
import {
  cacheCovers,
  dominantCurrency,
  fetchRates,
  ratesRequest,
  statementCurrencies,
  type RatesRequest,
} from '@/lib/fx';
import { loadRates, saveRates, type StoredRates } from '@/lib/storage';

export type FxStatus = 'off' | 'unnecessary' | 'loading' | 'ready' | 'stale' | 'failed';

export interface FxState {
  readonly status: FxStatus;
  readonly rates: RateTable | null;
  readonly base: string | null;
  readonly currencies: readonly string[];
  /** Exactly the currency codes a rate request carries, and nothing more. */
  readonly symbols: readonly string[];
  readonly asOf: string | null;
}

type Load = {
  readonly request: RatesRequest;
  readonly failed: boolean;
  readonly entry: StoredRates | null;
};

const EMPTY = { rates: null, asOf: null } as const;

export function useFxRates(
  result: ParseResult | null,
  enabled: boolean,
  preferredBase: string | null,
  persist: boolean,
): FxState {
  const [load, setLoad] = useState<Load | null>(null);

  const currencies = useMemo(() => (result ? statementCurrencies(result.movements) : []), [result]);

  const request = useMemo(
    () => (result ? ratesRequest(statementRange(result.movements), currencies) : null),
    [result, currencies],
  );

  useEffect(() => {
    if (!enabled || !request) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      const cached = await loadRates();
      if (cancelled) return;
      if (cached && cacheCovers(cached, request, Date.now())) {
        setLoad({ request, failed: false, entry: cached });
        return;
      }
      try {
        const rates = await fetchRates(request, controller.signal);
        if (cancelled) return;
        setLoad({
          request,
          failed: false,
          entry: { ...request, fetchedAt: Date.now(), rates },
        });
      } catch {
        if (!cancelled) setLoad({ request, failed: true, entry: cached ?? null });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, request]);

  const current = load && load.request === request ? load : null;
  const entry = current?.entry ?? null;

  useEffect(() => {
    if (persist && entry) void saveRates(entry);
  }, [persist, entry]);

  const base = preferredBase ?? (result ? dominantCurrency(result.movements) : null);

  return useMemo(() => {
    const shared = { base, currencies, symbols: request?.symbols ?? [] };
    if (!result) return { ...EMPTY, ...shared, status: 'off' };
    if (!enabled) return { ...EMPTY, ...shared, status: 'off' };
    if (!request) return { ...EMPTY, ...shared, status: 'unnecessary' };
    if (!entry) return { ...EMPTY, ...shared, status: current ? 'failed' : 'loading' };
    const days = Object.keys(entry.rates).sort();
    return {
      ...shared,
      status: current?.failed ? 'stale' : 'ready',
      rates: ecbRateTable(entry.rates),
      asOf: days[days.length - 1] ?? null,
    };
  }, [result, enabled, request, entry, current, currencies, base]);
}

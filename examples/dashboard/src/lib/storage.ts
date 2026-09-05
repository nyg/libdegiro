import { clear, del, get, set } from 'idb-keyval';
import type { DailyRates } from 'libdegiro';
import type { CachedRates } from '@/lib/fx';

/**
 * Persistence stores the **raw CSV text** and re-parses on load, never the
 * derived ParseResult. That is not a preference: IndexedDB serialises with
 * structured clone, which drops class prototypes, so a stored ParseResult would
 * come back as `{s, e, c}` objects with no `.add()`, `.currency` or `.toString()`.
 * Re-parsing the sample takes a few milliseconds.
 *
 * Nothing is written unless the user opts in — see the "Remember" switch.
 */

const STATEMENT_KEY = 'libdegiro:statement';
const REMEMBER_KEY = 'libdegiro:remember';
const FX_KEY = 'libdegiro:fx';
const RATES_KEY = 'libdegiro:fxrates';

export interface StoredStatement {
  readonly name: string;
  readonly size: number;
  readonly savedAt: number;
  readonly csv: string;
}

export interface FxPreference {
  readonly enabled: boolean;
  readonly base: string | null;
}

export interface StoredRates extends CachedRates {
  readonly rates: DailyRates;
}

export const DEFAULT_FX: FxPreference = { enabled: true, base: null };

export async function loadStatement(): Promise<StoredStatement | undefined> {
  try {
    return await get<StoredStatement>(STATEMENT_KEY);
  } catch {
    // A blocked or unavailable IndexedDB (private browsing, storage policy) is
    // not an error worth surfacing — the app works fine without persistence.
    return undefined;
  }
}

export async function saveStatement(statement: StoredStatement): Promise<void> {
  try {
    await set(STATEMENT_KEY, statement);
  } catch {
    /* ignore: persistence is a convenience, never a requirement */
  }
}

export async function loadRemember(): Promise<boolean> {
  try {
    return (await get<boolean>(REMEMBER_KEY)) ?? false;
  } catch {
    return false;
  }
}

export async function saveRemember(remember: boolean): Promise<void> {
  try {
    await set(REMEMBER_KEY, remember);
  } catch {
    /* ignore */
  }
}

export async function loadFx(): Promise<FxPreference> {
  try {
    return (await get<FxPreference>(FX_KEY)) ?? DEFAULT_FX;
  } catch {
    return DEFAULT_FX;
  }
}

export async function saveFx(preference: FxPreference): Promise<void> {
  try {
    await set(FX_KEY, preference);
  } catch {
    /* ignore */
  }
}

export async function loadRates(): Promise<StoredRates | undefined> {
  try {
    return await get<StoredRates>(RATES_KEY);
  } catch {
    return undefined;
  }
}

export async function saveRates(rates: StoredRates): Promise<void> {
  try {
    await set(RATES_KEY, rates);
  } catch {
    /* ignore */
  }
}

export async function forgetRates(): Promise<void> {
  try {
    await del(RATES_KEY);
  } catch {
    /* ignore */
  }
}

/** Remove the stored statement but keep the preference. */
export async function forgetStatement(): Promise<void> {
  try {
    await del(STATEMENT_KEY);
    await del(RATES_KEY);
  } catch {
    /* ignore */
  }
}

/** Wipe everything this app has ever written. */
export async function forgetEverything(): Promise<void> {
  try {
    await clear();
  } catch {
    /* ignore */
  }
}

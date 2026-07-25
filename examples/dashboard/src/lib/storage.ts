import { clear, del, get, set } from 'idb-keyval';

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

export interface StoredStatement {
  readonly name: string;
  readonly size: number;
  readonly savedAt: number;
  readonly csv: string;
}

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

/** Remove the stored statement but keep the preference. */
export async function forgetStatement(): Promise<void> {
  try {
    await del(STATEMENT_KEY);
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

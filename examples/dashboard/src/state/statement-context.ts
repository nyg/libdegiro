import { createContext, use } from 'react';
import type { ParseResult } from 'libdegiro';
import type { Analytics } from '@/lib/analytics';

/**
 * Context and hooks live apart from the provider component so that fast refresh
 * keeps working — a module that exports both a component and other values gets
 * fully reloaded on every edit.
 */

export type StatementState =
  | { readonly status: 'empty' }
  | { readonly status: 'parsing'; readonly fileName: string }
  | {
      readonly status: 'ready';
      readonly fileName: string;
      readonly csv: string;
      readonly result: ParseResult;
    }
  | { readonly status: 'error'; readonly fileName: string; readonly message: string };

export interface StatementContextValue {
  readonly state: StatementState;
  readonly analytics: Analytics | null;
  readonly remember: boolean;
  readonly restoring: boolean;
  readonly load: (csv: string, fileName: string) => void;
  readonly clear: () => void;
  readonly setRemember: (remember: boolean) => void;
  readonly forgetAll: () => void;
}

export const StatementContext = createContext<StatementContextValue | null>(null);

export function useStatement(): StatementContextValue {
  const value = use(StatementContext);
  if (!value) throw new Error('useStatement must be used inside a StatementProvider');
  return value;
}

/** Narrowed accessor for the many components that only render once ready. */
export function useAnalytics(): Analytics {
  const { analytics } = useStatement();
  if (!analytics) throw new Error('useAnalytics requires a loaded statement');
  return analytics;
}

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { parseDegiroCsv, type ParseResult } from 'libdegiro';
import { buildAnalytics } from '@/lib/analytics';
import {
  forgetEverything,
  forgetStatement,
  loadRemember,
  loadStatement,
  saveRemember,
  saveStatement,
} from '@/lib/storage';
import { StatementContext, type StatementState } from '@/state/statement-context';

type Action =
  | { type: 'parsing'; fileName: string }
  | { type: 'ready'; fileName: string; csv: string; result: ParseResult }
  | { type: 'error'; fileName: string; message: string }
  | { type: 'clear' };

function reducer(_state: StatementState, action: Action): StatementState {
  switch (action.type) {
    case 'parsing':
      return { status: 'parsing', fileName: action.fileName };
    case 'ready':
      return { status: 'ready', fileName: action.fileName, csv: action.csv, result: action.result };
    case 'error':
      return { status: 'error', fileName: action.fileName, message: action.message };
    case 'clear':
      return { status: 'empty' };
  }
}

export function StatementProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { status: 'empty' });
  const [remember, setRememberState] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const load = useCallback((csv: string, fileName: string) => {
    dispatch({ type: 'parsing', fileName });
    try {
      dispatch({ type: 'ready', fileName, csv, result: parseDegiroCsv(csv) });
    } catch (error) {
      dispatch({
        type: 'error',
        fileName,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  // Restore only what the user previously agreed to keep.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, storedRemember] = await Promise.all([loadStatement(), loadRemember()]);
      if (cancelled) return;
      setRememberState(storedRemember);
      if (storedRemember && stored) load(stored.csv, stored.name);
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Persist only when there is both consent and something to persist.
  useEffect(() => {
    if (restoring) return;
    if (remember && state.status === 'ready') {
      void saveStatement({
        name: state.fileName,
        size: state.csv.length,
        savedAt: Date.now(),
        csv: state.csv,
      });
    }
  }, [remember, state, restoring]);

  const setRemember = useCallback((next: boolean) => {
    setRememberState(next);
    void saveRemember(next);
    // Withdrawing consent deletes now, not at the next reload.
    if (!next) void forgetStatement();
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: 'clear' });
    void forgetStatement();
  }, []);

  const forgetAll = useCallback(() => {
    dispatch({ type: 'clear' });
    setRememberState(false);
    void forgetEverything();
  }, []);

  // Keyed on the ParseResult identity, so filtering or switching tabs never
  // recomputes the aggregates.
  const analytics = useMemo(
    () => (state.status === 'ready' ? buildAnalytics(state.result) : null),
    [state],
  );

  const value = useMemo(
    () => ({ state, analytics, remember, restoring, load, clear, setRemember, forgetAll }),
    [state, analytics, remember, restoring, load, clear, setRemember, forgetAll],
  );

  return <StatementContext value={value}>{children}</StatementContext>;
}

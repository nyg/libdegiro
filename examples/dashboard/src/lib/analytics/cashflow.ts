import { Money, type Movement } from 'libdegiro';

export type CashFlowDirection = 'in' | 'out';

export interface CashFlowEvent {
  readonly key: string;
  readonly date: Date;
  readonly line: number | null;
  readonly direction: CashFlowDirection;
  readonly description: string;
  /** Signed: positive into the account, negative out of it. */
  readonly amount: Money;
  /** Net funding in this currency after this event. */
  readonly cumulative: Money;
}

export interface CurrencyCashFlow {
  readonly currency: string;
  readonly deposits: Money;
  readonly withdrawals: Money;
  readonly net: Money;
  readonly depositCount: number;
  readonly withdrawalCount: number;
  readonly firstDate: Date;
  readonly lastDate: Date;
  /** Oldest first, each carrying the running net funding. */
  readonly events: readonly CashFlowEvent[];
}

export interface CashFlowReport {
  readonly byCurrency: readonly CurrencyCashFlow[];
  /** Every event across every currency, newest first. */
  readonly events: readonly CashFlowEvent[];
  readonly currencies: readonly string[];
}

const EXTERNAL: ReadonlySet<Movement['kind']> = new Set(['deposit', 'withdrawal']);

/**
 * Money crossing the account boundary, per currency.
 *
 * Direction is read from the sign rather than the movement kind: DEGIRO books a
 * withdrawal as a negative `Versement de fonds` at least as often as it names
 * it `Retrait de fonds`, so trusting the description alone would file half of
 * them as deposits.
 *
 * Sweeps to and from the flatexDEGIRO cash account are deliberately absent.
 * They move money between two accounts you own and net to nothing; counting
 * them here would drown nine real deposits in fifty internal transfers.
 */
export function buildCashFlow(movements: readonly Movement[]): CashFlowReport {
  const byCurrency = new Map<string, CashFlowEvent[]>();

  for (const movement of [...movements].reverse()) {
    if (!EXTERNAL.has(movement.kind)) continue;
    const amount = movement.amount;
    if (amount === null || amount.isZero()) continue;

    const events = byCurrency.get(amount.currency) ?? [];
    const previous = events[events.length - 1]?.cumulative ?? Money.zero(amount.currency);
    const line = movement.record.line ?? null;
    events.push({
      key: `${amount.currency}-${line ?? events.length}`,
      date: movement.record.bookingDate,
      line,
      direction: amount.isPositive() ? 'in' : 'out',
      description: movement.record.description,
      amount,
      cumulative: previous.add(amount),
    });
    byCurrency.set(amount.currency, events);
  }

  const summaries = [...byCurrency.entries()]
    .map(([currency, events]): CurrencyCashFlow => {
      const inflow = events.filter((event) => event.direction === 'in');
      const outflow = events.filter((event) => event.direction === 'out');
      const total = (subset: readonly CashFlowEvent[]): Money =>
        subset.reduce((sum, event) => sum.add(event.amount), Money.zero(currency));

      return {
        currency,
        deposits: total(inflow),
        withdrawals: total(outflow),
        net: events[events.length - 1]?.cumulative ?? Money.zero(currency),
        depositCount: inflow.length,
        withdrawalCount: outflow.length,
        firstDate: events[0]!.date,
        lastDate: events[events.length - 1]!.date,
        events,
      };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const events = summaries
    .flatMap((summary) => summary.events)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    byCurrency: summaries,
    events,
    currencies: summaries.map((summary) => summary.currency),
  };
}

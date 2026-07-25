import Big from 'big.js';
import { Money } from '../money/money';
import type { Movement } from '../classify/types';

/** A single point where the reported running balance did not reconcile. */
export interface BalanceDiscrepancy {
  readonly currency: string;
  /** Source line of the offending row, if known. */
  readonly line?: number;
  readonly description: string;
  /** Balance we expected from `previous + effective mutation`. */
  readonly expected: Money;
  /** Balance actually reported in the `Solde` column. */
  readonly actual: Money;
  /** `actual - expected`. */
  readonly difference: Money;
}

/** Per-currency reconciliation outcome. */
export interface CurrencyReconciliation {
  readonly currency: string;
  /** Number of balance transitions checked. */
  readonly checked: number;
  readonly discrepancies: readonly BalanceDiscrepancy[];
  /** Oldest balance observed for this currency. */
  readonly openingBalance: Money;
  /** Newest balance observed for this currency. */
  readonly closingBalance: Money;
}

/** Full result of {@link reconcileBalances}. */
export interface ReconciliationReport {
  /** `true` when there are no discrepancies in any currency. */
  readonly ok: boolean;
  readonly byCurrency: readonly CurrencyReconciliation[];
  /** All discrepancies, flattened across currencies. */
  readonly discrepancies: readonly BalanceDiscrepancy[];
}

/** Options for {@link reconcileBalances}. */
export interface ReconcileOptions {
  /**
   * Whether `movements` are ordered newest-first (the DEGIRO export order, and
   * the order of {@link ParseResult.movements}). Defaults to `true`.
   */
  readonly newestFirst?: boolean;
  /** Absolute tolerance when comparing balances. Defaults to `0` (exact). */
  readonly tolerance?: number;
}

/**
 * The signed amount that moved a row's balance in the given currency.
 *
 * Cash-transfer mirrors carry no mutation; their balance moves by the stated
 * amount (`vers` adds, `depuis` subtracts). Every other row uses its mutation.
 */
function effectiveMutation(movement: Movement, currency: string): Big {
  if (movement.kind === 'cashTransfer') {
    const stated = movement.statedAmount;
    if (stated && stated.currency === currency) {
      return movement.direction === 'toCashAccount' ? stated.amount : stated.amount.times(-1);
    }
    return new Big(0);
  }
  const mutation = movement.record.mutation;
  if (mutation && mutation.currency === currency) {
    return mutation.amount;
  }
  return new Big(0);
}

/**
 * Verify that each per-currency running balance (`Solde`) is internally
 * consistent: `balance == previousBalance + effectiveMutation`.
 *
 * This never throws; it returns a report of any discrepancies, making it safe to
 * run on partial statements.
 */
export function reconcileBalances(
  movements: readonly Movement[],
  options: ReconcileOptions = {},
): ReconciliationReport {
  const newestFirst = options.newestFirst ?? true;
  const tolerance = new Big(options.tolerance ?? 0);
  const ordered = newestFirst ? [...movements].reverse() : [...movements];

  const byCurrencyMovements = new Map<string, Movement[]>();
  for (const movement of ordered) {
    const balance = movement.record.balance;
    if (!balance) continue;
    const bucket = byCurrencyMovements.get(balance.currency);
    if (bucket) bucket.push(movement);
    else byCurrencyMovements.set(balance.currency, [movement]);
  }

  const byCurrency: CurrencyReconciliation[] = [];
  const all: BalanceDiscrepancy[] = [];

  for (const [currency, ms] of byCurrencyMovements) {
    const discrepancies: BalanceDiscrepancy[] = [];
    for (let i = 1; i < ms.length; i++) {
      const prev = ms[i - 1]!;
      const cur = ms[i]!;
      const expected = prev.record.balance!.amount.plus(effectiveMutation(cur, currency));
      const actual = cur.record.balance!.amount;
      const difference = actual.minus(expected);
      if (difference.abs().gt(tolerance)) {
        discrepancies.push({
          currency,
          line: cur.record.line,
          description: cur.record.description,
          expected: new Money(expected, currency),
          actual: new Money(actual, currency),
          difference: new Money(difference, currency),
        });
      }
    }
    const first = ms[0]!;
    const last = ms[ms.length - 1]!;
    byCurrency.push({
      currency,
      checked: Math.max(0, ms.length - 1),
      discrepancies,
      openingBalance: new Money(first.record.balance!.amount, currency),
      closingBalance: new Money(last.record.balance!.amount, currency),
    });
    all.push(...discrepancies);
  }

  return { ok: all.length === 0, byCurrency, discrepancies: all };
}

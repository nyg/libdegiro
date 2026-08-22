import Big from 'big.js';
import { Money } from '../money/money';
import type { Movement, MovementKind } from '../classify/types';

/**
 * How badly a balance transition failed.
 *
 * `rounding` is the statement disagreeing with itself by a fraction of a minor
 * unit — DEGIRO rounds a half-centime down in the amount column and up in the
 * balance column, so the two columns describe the same trade differently.
 * `unexplained` is anything wider, and is the only kind worth acting on.
 */
export type DiscrepancyKind = 'rounding' | 'unexplained';

/** A single point where the reported running balance did not reconcile. */
export interface BalanceDiscrepancy {
  readonly currency: string;
  readonly kind: DiscrepancyKind;
  /** Source line of the offending row, if known. */
  readonly line?: number;
  /** Source line of the row that set {@link previousBalance}, if known. */
  readonly previousLine?: number;
  readonly description: string;
  /** How the offending row was classified. */
  readonly movementKind: MovementKind;
  /** Balance the previous row in this currency reported. */
  readonly previousBalance: Money;
  /** What this row's own amount column claims moved. */
  readonly statedMutation: Money;
  /** What the balance column actually moved by (`actual - previousBalance`). */
  readonly appliedMutation: Money;
  /**
   * The unrounded amount the row's own description implies — quantity × unit
   * price, signed — when it is a trade carrying both. A value landing exactly
   * on a half minor unit is what proves a `rounding` verdict.
   */
  readonly exactAmount: Money | null;
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
  /** `true` when nothing beyond sub-unit rounding failed to reconcile. */
  readonly ok: boolean;
  /** `true` when every transition matched to the last decimal. */
  readonly exact: boolean;
  readonly byCurrency: readonly CurrencyReconciliation[];
  /** All discrepancies, flattened across currencies. */
  readonly discrepancies: readonly BalanceDiscrepancy[];
  /** The subset attributable to the statement's own rounding. */
  readonly rounding: readonly BalanceDiscrepancy[];
  /** The subset that rounding does not explain. */
  readonly unexplained: readonly BalanceDiscrepancy[];
}

/** Options for {@link reconcileBalances}. */
export interface ReconcileOptions {
  /**
   * Whether `movements` are ordered newest-first (the DEGIRO export order, and
   * the order of {@link ParseResult.movements}). Defaults to `true`.
   */
  readonly newestFirst?: boolean;
  /** Absolute tolerance below which a gap is not reported at all. Defaults to `0`. */
  readonly tolerance?: number;
  /**
   * Absolute tolerance below which a reported gap counts as `rounding` rather
   * than `unexplained`. Defaults to `0.01`, one minor unit.
   */
  readonly roundingTolerance?: number;
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

/** Quantity × unit price, signed by side, for a trade row priced in `currency`. */
function exactTradeAmount(movement: Movement, currency: string): Money | null {
  if (movement.kind !== 'buy' && movement.kind !== 'sell') return null;
  const { unitPrice, quantity } = movement;
  if (unitPrice === null || unitPrice.currency !== currency) return null;
  const gross = unitPrice.amount.times(quantity);
  return new Money(movement.kind === 'buy' ? gross.times(-1) : gross, currency);
}

/**
 * Verify that each per-currency running balance (`Solde`) is internally
 * consistent: `balance == previousBalance + effectiveMutation`.
 *
 * This never throws; it returns a report of any discrepancies, making it safe to
 * run on partial statements. Every discrepancy carries the whole transition —
 * both lines, both balances, both readings of the mutation — because a bare
 * difference is not enough to tell a parser bug from a statement quirk.
 */
export function reconcileBalances(
  movements: readonly Movement[],
  options: ReconcileOptions = {},
): ReconciliationReport {
  const newestFirst = options.newestFirst ?? true;
  const tolerance = new Big(options.tolerance ?? 0);
  const roundingTolerance = new Big(options.roundingTolerance ?? 0.01);
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
      const previousBalance = prev.record.balance!.amount;
      const stated = effectiveMutation(cur, currency);
      const expected = previousBalance.plus(stated);
      const actual = cur.record.balance!.amount;
      const difference = actual.minus(expected);
      if (difference.abs().lte(tolerance)) continue;

      discrepancies.push({
        currency,
        kind: difference.abs().lte(roundingTolerance) ? 'rounding' : 'unexplained',
        line: cur.record.line,
        previousLine: prev.record.line,
        description: cur.record.description,
        movementKind: cur.kind,
        previousBalance: new Money(previousBalance, currency),
        statedMutation: new Money(stated, currency),
        appliedMutation: new Money(actual.minus(previousBalance), currency),
        exactAmount: exactTradeAmount(cur, currency),
        expected: new Money(expected, currency),
        actual: new Money(actual, currency),
        difference: new Money(difference, currency),
      });
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

  const rounding = all.filter((entry) => entry.kind === 'rounding');
  const unexplained = all.filter((entry) => entry.kind === 'unexplained');

  return {
    ok: unexplained.length === 0,
    exact: all.length === 0,
    byCurrency,
    discrepancies: all,
    rounding,
    unexplained,
  };
}

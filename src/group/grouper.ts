import type {
  Movement,
  TradeMovement,
  FxTradeMovement,
  FxConversionMovement,
  BrokerageFeeMovement,
  CashSweepMovement,
  CashTransferMovement,
} from '../classify/types';
import type {
  Transaction,
  SingleTransaction,
  FxConversionTransaction,
  CashSweepTransaction,
} from './transaction';

/** Result of applying a {@link GroupingStrategy} to a set of movements. */
export interface GroupingResult {
  /** Transactions formed by this strategy. */
  readonly transactions: Transaction[];
  /** Movements this strategy did not consume, passed to the next strategy. */
  readonly remaining: Movement[];
}

/**
 * A pluggable grouping pass. Strategies run in sequence; each receives the
 * movements left over by the previous one. Register custom strategies to change
 * how related rows are combined.
 */
export interface GroupingStrategy {
  readonly name: string;
  group(movements: readonly Movement[]): GroupingResult;
}

const byDate = (a: Movement, b: Movement): number =>
  a.record.bookingDate.getTime() - b.record.bookingDate.getTime();

const isTrade = (m: Movement): m is TradeMovement => m.kind === 'buy' || m.kind === 'sell';
const isFxTrade = (m: Movement): m is FxTradeMovement => m.kind === 'fxTrade';
const isBrokerageFee = (m: Movement): m is BrokerageFeeMovement => m.kind === 'brokerageFee';
const isFxConversion = (m: Movement): m is FxConversionMovement =>
  m.kind === 'fxCredit' || m.kind === 'fxDebit';

function buildOrderTransaction(orderId: string, group: readonly Movement[]): Transaction {
  const movements = [...group].sort(byDate);
  const date = movements[0]?.record.bookingDate ?? new Date(0);
  const trades = movements.filter(isTrade);
  const fxTrades = movements.filter(isFxTrade);
  const fees = movements.filter(isBrokerageFee);
  const fxConversions = movements.filter(isFxConversion);

  if (fxTrades.length > 0) {
    return {
      type: 'fxTrade',
      movements,
      orderId,
      date,
      side: fxTrades[0]!.side,
      pair: fxTrades[0]!.pair,
      fxTrades,
      fees,
      fxConversions,
    };
  }

  if (trades.length > 0) {
    return {
      type: 'trade',
      movements,
      orderId,
      date,
      side: trades[0]!.side,
      product: trades[0]!.product,
      isin: trades[0]!.isin,
      quantity: trades.reduce((sum, t) => sum + t.quantity, 0),
      trades,
      fees,
      fxConversions,
    };
  }

  return { type: 'composite', movements, orderId, date };
}

function buildSingle(movement: Movement): SingleTransaction {
  return {
    type: 'single',
    movements: [movement],
    orderId: movement.record.orderId,
    date: movement.record.bookingDate,
    movement,
  };
}

/** Groups movements that share a DEGIRO order id (trade + fees + FX legs). */
export const orderIdStrategy: GroupingStrategy = {
  name: 'orderId',
  group(movements) {
    const groups = new Map<string, Movement[]>();
    const remaining: Movement[] = [];
    for (const movement of movements) {
      const id = movement.record.orderId;
      if (id === null) {
        remaining.push(movement);
        continue;
      }
      const bucket = groups.get(id);
      if (bucket) bucket.push(movement);
      else groups.set(id, [movement]);
    }
    const transactions: Transaction[] = [];
    for (const [orderId, group] of groups) {
      transactions.push(buildOrderTransaction(orderId, group));
    }
    return { transactions, remaining };
  },
};

/**
 * Pairs order-less currency-conversion legs (credit + debit) that share a value
 * date into a single {@link FxConversionTransaction}.
 */
export const fxConversionPairStrategy: GroupingStrategy = {
  name: 'fxConversionPair',
  group(movements) {
    const buckets = new Map<string, FxConversionMovement[]>();
    const remaining: Movement[] = [];
    for (const movement of movements) {
      if (isFxConversion(movement)) {
        const key = movement.record.valueDate.toISOString();
        const bucket = buckets.get(key);
        if (bucket) bucket.push(movement);
        else buckets.set(key, [movement]);
      } else {
        remaining.push(movement);
      }
    }
    const transactions: Transaction[] = [];
    for (const legs of buckets.values()) {
      const sorted = [...legs].sort(byDate);
      const tx: FxConversionTransaction = {
        type: 'fxConversion',
        movements: sorted,
        orderId: null,
        date: sorted[0]!.record.bookingDate,
        credit: sorted.find((l) => l.kind === 'fxCredit') ?? null,
        debit: sorted.find((l) => l.kind === 'fxDebit') ?? null,
      };
      transactions.push(tx);
    }
    return { transactions, remaining };
  },
};

/**
 * Pairs each cash sweep with its informational transfer mirror sharing the same
 * timestamp and currency into a {@link CashSweepTransaction}.
 */
export const cashSweepPairStrategy: GroupingStrategy = {
  name: 'cashSweepPair',
  group(movements) {
    const sweeps: CashSweepMovement[] = [];
    const transfers: CashTransferMovement[] = [];
    const remaining: Movement[] = [];
    for (const movement of movements) {
      if (movement.kind === 'cashSweep') sweeps.push(movement);
      else if (movement.kind === 'cashTransfer') transfers.push(movement);
      else remaining.push(movement);
    }

    const pool = [...transfers];
    const transactions: Transaction[] = [];
    for (const sweep of sweeps) {
      const currency = sweep.amount?.currency ?? null;
      const time = sweep.record.bookingDate.getTime();
      const index = pool.findIndex(
        (t) =>
          t.record.bookingDate.getTime() === time &&
          (t.statedAmount?.currency ?? null) === currency,
      );
      const transfer = index >= 0 ? pool.splice(index, 1)[0]! : null;
      const grouped: Movement[] = transfer ? [sweep, transfer].sort(byDate) : [sweep];
      const tx: CashSweepTransaction = {
        type: 'cashSweep',
        movements: grouped,
        orderId: null,
        date: sweep.record.bookingDate,
        sweep,
        transfer,
      };
      transactions.push(tx);
    }
    remaining.push(...pool);
    return { transactions, remaining };
  },
};

/** Catch-all: wraps each remaining movement as a {@link SingleTransaction}. */
export const singletonStrategy: GroupingStrategy = {
  name: 'singleton',
  group(movements) {
    return { transactions: movements.map(buildSingle), remaining: [] };
  },
};

/** The default grouping pipeline, in order. */
export const defaultGroupingStrategies: readonly GroupingStrategy[] = [
  orderIdStrategy,
  fxConversionPairStrategy,
  cashSweepPairStrategy,
  singletonStrategy,
];

/**
 * Group classified movements into composite {@link Transaction}s using the given
 * strategies. Result is sorted by booking date, newest first.
 */
export function groupMovements(
  movements: readonly Movement[],
  strategies: readonly GroupingStrategy[] = defaultGroupingStrategies,
): Transaction[] {
  let remaining: Movement[] = [...movements];
  const transactions: Transaction[] = [];
  for (const strategy of strategies) {
    const result = strategy.group(remaining);
    transactions.push(...result.transactions);
    remaining = result.remaining;
  }
  // Safety net if a custom strategy set has no catch-all.
  for (const movement of remaining) {
    transactions.push(buildSingle(movement));
  }
  return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
}

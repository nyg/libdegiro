import type {
  Movement,
  TradeMovement,
  FxTradeMovement,
  FxConversionMovement,
  BrokerageFeeMovement,
  CashSweepMovement,
  CashTransferMovement,
  TradeSide,
} from '../classify/types';

/** Discriminant for every {@link Transaction}. */
export type TransactionType =
  'trade' | 'fxTrade' | 'fxConversion' | 'cashSweep' | 'single' | 'composite';

/** Fields shared by every transaction. */
export interface TransactionBase<T extends TransactionType> {
  readonly type: T;
  /** All movements that make up this transaction, in chronological order. */
  readonly movements: readonly Movement[];
  /** The DEGIRO order id, when the grouping is order-based. */
  readonly orderId: string | null;
  /** Booking date/time of the earliest movement in the group. */
  readonly date: Date;
}

/**
 * A security trade order: one or more buy/sell legs together with their
 * brokerage fees and any currency-conversion legs that settled the same order.
 *
 * Amounts are intentionally **not** netted across currencies (fees are often in
 * EUR while the trade settles in CHF); use the legs for currency-aware maths.
 */
export interface TradeTransaction extends TransactionBase<'trade'> {
  readonly side: TradeSide;
  readonly product: string | null;
  readonly isin: string | null;
  /** Sum of the quantities of all trade legs. */
  readonly quantity: number;
  readonly trades: readonly TradeMovement[];
  readonly fees: readonly BrokerageFeeMovement[];
  readonly fxConversions: readonly FxConversionMovement[];
}

/** A currency-pair (FX) trade order with its fees and conversion legs. */
export interface FxTradeTransaction extends TransactionBase<'fxTrade'> {
  readonly side: TradeSide;
  readonly pair: string | null;
  readonly fxTrades: readonly FxTradeMovement[];
  readonly fees: readonly BrokerageFeeMovement[];
  readonly fxConversions: readonly FxConversionMovement[];
}

/** A standalone currency conversion (credit + debit) not tied to an order. */
export interface FxConversionTransaction extends TransactionBase<'fxConversion'> {
  readonly credit: FxConversionMovement | null;
  readonly debit: FxConversionMovement | null;
}

/** A cash sweep paired with its informational transfer mirror. */
export interface CashSweepTransaction extends TransactionBase<'cashSweep'> {
  readonly sweep: CashSweepMovement;
  readonly transfer: CashTransferMovement | null;
}

/** A single, ungrouped movement (dividend, interest, deposit, fee, ...). */
export interface SingleTransaction extends TransactionBase<'single'> {
  readonly movement: Movement;
}

/** An order-grouped set of movements that is neither a trade nor an FX trade. */
export type CompositeTransaction = TransactionBase<'composite'>;

/** The discriminated union of all transaction types. */
export type Transaction =
  | TradeTransaction
  | FxTradeTransaction
  | FxConversionTransaction
  | CashSweepTransaction
  | SingleTransaction
  | CompositeTransaction;

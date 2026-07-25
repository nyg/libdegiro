import type { Money } from '../money/money';
import type { RawRecord } from '../records/rawRecord';
import type { Dialect } from '../dialects/types';

/** Discriminant for every classified {@link Movement}. */
export type MovementKind =
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'dividendTax'
  | 'capitalReturn'
  | 'brokerageFee'
  | 'connectivityFee'
  | 'interest'
  | 'fxCredit'
  | 'fxDebit'
  | 'fxTrade'
  | 'cashSweep'
  | 'cashTransfer'
  | 'deposit'
  | 'unknown';

/** Buy or sell. */
export type TradeSide = 'buy' | 'sell';

/** Fields shared by every movement. */
export interface BaseMovement<K extends string> {
  readonly kind: K;
  /** The underlying normalised record. */
  readonly record: RawRecord;
  /** Signed cash impact on the account (mirrors {@link RawRecord.mutation}). */
  readonly amount: Money | null;
}

/** A security buy/sell (`Achat`/`Vente` of an instrument with an ISIN). */
export interface TradeMovement extends BaseMovement<'buy' | 'sell'> {
  readonly side: TradeSide;
  readonly quantity: number;
  readonly unitPrice: Money | null;
  readonly product: string | null;
  readonly isin: string | null;
  readonly orderId: string | null;
}

/** A dividend payment (`Dividende`). */
export interface DividendMovement extends BaseMovement<'dividend'> {
  readonly product: string | null;
  readonly isin: string | null;
}

/** Tax withheld on a dividend (`Impôts sur dividende`). */
export interface DividendTaxMovement extends BaseMovement<'dividendTax'> {
  readonly product: string | null;
  readonly isin: string | null;
}

/** Return of capital (`Remboursement de capital`). */
export interface CapitalReturnMovement extends BaseMovement<'capitalReturn'> {
  readonly product: string | null;
  readonly isin: string | null;
}

/** Brokerage / third-party transaction fee. */
export interface BrokerageFeeMovement extends BaseMovement<'brokerageFee'> {
  readonly product: string | null;
  readonly isin: string | null;
  readonly orderId: string | null;
}

/** Annual exchange connectivity fee (`Frais de connexion aux places boursières`). */
export interface ConnectivityFeeMovement extends BaseMovement<'connectivityFee'> {
  /** The year the fee relates to, if present in the description. */
  readonly year: number | null;
}

/** Interest income (`Flatex Interest Income`). */
export type InterestMovement = BaseMovement<'interest'>;

/** One leg of a currency conversion (`Opération de change - Crédit/Débit`). */
export interface FxConversionMovement extends BaseMovement<'fxCredit' | 'fxDebit'> {
  readonly direction: 'credit' | 'debit';
  /** Conversion rate from the FX column, if present. */
  readonly rate: string | null;
  readonly orderId: string | null;
}

/** A currency-pair trade (e.g. `Achat 4 800 EUR/CHF@0,9412 CHF`). */
export interface FxTradeMovement extends BaseMovement<'fxTrade'> {
  readonly side: TradeSide;
  /** The currency pair, e.g. `EUR/CHF`. */
  readonly pair: string | null;
  readonly quantity: number;
  /** Price per unit of the base currency. */
  readonly rate: Money | null;
  /** `true` for the `Règlement transaction devise` settlement leg. */
  readonly settlement: boolean;
  readonly orderId: string | null;
}

/** Cash sweep between the DEGIRO account and the flatexDEGIRO Bank cash account. */
export type CashSweepMovement = BaseMovement<'cashSweep'>;

/** Direction of a cash transfer relative to the flatexDEGIRO Bank cash account. */
export type CashTransferDirection = 'toCashAccount' | 'fromCashAccount';

/** Informational mirror of a cash sweep (`Virement vers/depuis ... flatexDEGIRO Bank`). */
export interface CashTransferMovement extends BaseMovement<'cashTransfer'> {
  readonly direction: CashTransferDirection;
  /** Amount stated in the description (the row itself usually has no mutation). */
  readonly statedAmount: Money | null;
}

/** External deposit of funds (`Versement de fonds`). */
export type DepositMovement = BaseMovement<'deposit'>;

/** A row that no matcher could classify; preserved verbatim, never dropped. */
export type UnknownMovement = BaseMovement<'unknown'>;

/** The discriminated union of all built-in movement types. */
export type Movement =
  | TradeMovement
  | DividendMovement
  | DividendTaxMovement
  | CapitalReturnMovement
  | BrokerageFeeMovement
  | ConnectivityFeeMovement
  | InterestMovement
  | FxConversionMovement
  | FxTradeMovement
  | CashSweepMovement
  | CashTransferMovement
  | DepositMovement
  | UnknownMovement;

/** Context passed to every {@link Matcher}. */
export interface MatchContext {
  readonly record: RawRecord;
  readonly dialect: Dialect;
}

/**
 * A classification rule: inspects a record and returns a {@link Movement} if it
 * recognises it, otherwise `null`. Register custom matchers to support new
 * description variants or locales.
 */
export interface Matcher {
  /** Identifier for debugging / introspection. */
  readonly name: string;
  /** Higher priority matchers run first. Defaults to `0`. */
  readonly priority?: number;
  match(ctx: MatchContext): Movement | null;
}

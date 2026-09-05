import Big from 'big.js';
import { Money } from '../money/money';
import type { Movement, TradeMovement } from '../classify/types';
import { convert, type RateTable } from '../fx/rates';

export interface PortfolioOptions {
  readonly rates?: RateTable;
  readonly base?: string;
}

/** Net holding in a single instrument. */
export interface Position {
  readonly isin: string;
  readonly product: string | null;
  /** Net quantity held (`bought - sold`). */
  readonly quantity: number;
  readonly bought: number;
  readonly sold: number;
}

/** FIFO realized profit/loss for a single instrument. */
export interface RealizedPnl {
  readonly isin: string;
  readonly product: string | null;
  /**
   * Realized P/L, or `null` when it cannot be computed unambiguously — a sell
   * lacked cost basis within the statement window, a price was missing, or the
   * instrument was traded in more than one currency and no {@link RateTable}
   * was supplied to bridge them.
   */
  readonly amount: Money | null;
  /** Quantity of shares closed (matched buy↔sell). */
  readonly matchedQuantity: number;
  readonly converted: boolean;
}

/** What the shares still held in one instrument originally cost. */
export interface OpenCost {
  readonly isin: string;
  readonly product: string | null;
  /** Quantity still held after the FIFO walk. */
  readonly quantity: number;
  /**
   * Purchase price of the unsold lots, or `null` when the history is
   * incomplete, or multi-currency with no {@link RateTable} to bridge it — the
   * same discipline {@link RealizedPnl} uses.
   */
  readonly cost: Money | null;
  readonly converted: boolean;
}

/** A currency-keyed roll-up of an account. */
export interface PortfolioSummary {
  /** Net positions per ISIN. */
  readonly positions: readonly Position[];
  /** FIFO realized P/L per ISIN. */
  readonly realizedPnl: readonly RealizedPnl[];
  /** Cost basis of the shares still held, per ISIN. */
  readonly openCost: readonly OpenCost[];
  /** Cost basis of everything still held, per currency. */
  readonly invested: readonly Money[];
  /** Latest DEGIRO (trading) account balance per currency. */
  readonly cashByCurrency: readonly Money[];
  /** Total dividends received per currency. */
  readonly dividends: readonly Money[];
  /** Total dividend tax withheld per currency. */
  readonly dividendTax: readonly Money[];
  /** Total fees paid per currency (brokerage + connectivity). */
  readonly fees: readonly Money[];
  /** Money paid into the account from outside it, per currency. */
  readonly deposits: readonly Money[];
  /** Money paid out of the account to outside it, per currency, kept negative. */
  readonly withdrawals: readonly Money[];
  /** `deposits + withdrawals` — what the account was actually funded with. */
  readonly netExternalFlow: readonly Money[];
  /** Total interest income per currency. */
  readonly interest: readonly Money[];
}

const isTrade = (m: Movement): m is TradeMovement => m.kind === 'buy' || m.kind === 'sell';
const byCurrencyName = (a: Money, b: Money): number => a.currency.localeCompare(b.currency);

/** Sum a collection of amounts grouped by currency. */
export function sumByCurrency(amounts: Iterable<Money | null | undefined>): Money[] {
  const totals = new Map<string, Big>();
  for (const amount of amounts) {
    if (!amount) continue;
    totals.set(amount.currency, (totals.get(amount.currency) ?? new Big(0)).plus(amount.amount));
  }
  return [...totals.entries()]
    .map(([currency, total]) => new Money(total, currency))
    .sort(byCurrencyName);
}

/** Compute net positions per ISIN from trade movements. */
export function computePositions(movements: readonly Movement[]): Position[] {
  const map = new Map<string, { product: string | null; bought: number; sold: number }>();
  for (const movement of movements) {
    if (!isTrade(movement) || movement.isin === null) continue;
    const entry = map.get(movement.isin) ?? { product: movement.product, bought: 0, sold: 0 };
    if (movement.kind === 'buy') entry.bought += movement.quantity;
    else entry.sold += movement.quantity;
    if (entry.product === null && movement.product !== null) entry.product = movement.product;
    map.set(movement.isin, entry);
  }
  return [...map.entries()]
    .map(([isin, e]) => ({
      isin,
      product: e.product,
      quantity: e.bought - e.sold,
      bought: e.bought,
      sold: e.sold,
    }))
    .sort((a, b) => a.isin.localeCompare(b.isin));
}

interface Lot {
  qty: number;
  price: Big;
  currency: string;
  date: Date;
}

interface Conversion {
  readonly rates: RateTable;
  readonly base: string;
}

interface LotWalk {
  readonly realized: Big;
  readonly matched: number;
  /** Purchase lots the sells never consumed — what is still held. */
  readonly lots: readonly Lot[];
  readonly currency: string | null;
  readonly ambiguous: boolean;
  readonly mixedCurrency: boolean;
}

/**
 * Walk one instrument's trades chronologically, matching sells against buys
 * FIFO.
 *
 * Both the realized figure and the cost of what is still held come out of the
 * same walk, and they have to agree about which lots a sell consumed — so this
 * runs once and returns both rather than being repeated with the leftovers
 * re-derived.
 */
function walkLots(trades: readonly TradeMovement[], conversion?: Conversion): LotWalk {
  const chrono = [...trades].sort(
    (a, b) => a.record.bookingDate.getTime() - b.record.bookingDate.getTime(),
  );
  const lots: Lot[] = [];
  let realized = new Big(0);
  let currency: string | null = null;
  let ambiguous = false;
  let mixedCurrency = false;
  let matched = 0;

  for (const trade of chrono) {
    if (!trade.unitPrice) {
      ambiguous = true;
      continue;
    }
    const date = trade.record.bookingDate;
    const price = conversion
      ? convert(trade.unitPrice, conversion.base, date, conversion.rates)
      : trade.unitPrice;
    if (!price) {
      ambiguous = true;
      continue;
    }
    const tradeCurrency = price.currency;
    if (currency === null) currency = tradeCurrency;
    else if (currency !== tradeCurrency) mixedCurrency = true;

    if (trade.side === 'buy') {
      lots.push({ qty: trade.quantity, price: price.amount, currency: tradeCurrency, date });
      continue;
    }

    let remaining = trade.quantity;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0]!;
      const take = Math.min(remaining, lot.qty);
      if (lot.currency !== tradeCurrency) mixedCurrency = true;
      realized = realized.plus(price.amount.minus(lot.price).times(take));
      matched += take;
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 0) lots.shift();
    }
    if (remaining > 0) ambiguous = true; // sold more than the known cost basis
  }

  return { realized, matched, lots, currency, ambiguous, mixedCurrency };
}

function walkFor(
  trades: readonly TradeMovement[],
  options: PortfolioOptions | undefined,
): { readonly walk: LotWalk; readonly converted: boolean } {
  const plain = walkLots(trades);
  const { rates, base } = options ?? {};
  if (!plain.mixedCurrency || plain.ambiguous || !rates || !base) {
    return { walk: plain, converted: false };
  }
  const converted = walkLots(trades, { rates, base });
  if (converted.ambiguous || converted.mixedCurrency) return { walk: plain, converted: false };
  return { walk: converted, converted: true };
}

const unusable = (walk: LotWalk): boolean =>
  walk.ambiguous || walk.mixedCurrency || walk.currency === null;

function byIsin(movements: readonly Movement[]): Map<string, TradeMovement[]> {
  const map = new Map<string, TradeMovement[]>();
  for (const movement of movements) {
    if (!isTrade(movement) || movement.isin === null) continue;
    const bucket = map.get(movement.isin);
    if (bucket) bucket.push(movement);
    else map.set(movement.isin, [movement]);
  }
  return map;
}

/**
 * Compute FIFO realized P/L per ISIN. Best-effort: returns `null` for an
 * instrument whose history is multi-currency or incomplete (see {@link RealizedPnl}).
 */
export function computeRealizedPnl(
  movements: readonly Movement[],
  options?: PortfolioOptions,
): RealizedPnl[] {
  const results: RealizedPnl[] = [];
  for (const [isin, trades] of byIsin(movements)) {
    const { walk, converted } = walkFor(trades, options);
    results.push({
      isin,
      product: trades[0]?.product ?? null,
      amount: unusable(walk) ? null : new Money(walk.realized, walk.currency!),
      matchedQuantity: walk.matched,
      converted,
    });
  }
  return results.sort((a, b) => a.isin.localeCompare(b.isin));
}

/**
 * What the shares still held originally cost, per ISIN.
 *
 * The purchase price of the lots no sale consumed — not a valuation. Nothing in
 * a statement carries a current price, so this is what was paid for what is
 * still owned, and it is the only "invested" figure the data supports.
 */
export function computeOpenCost(
  movements: readonly Movement[],
  options?: PortfolioOptions,
): OpenCost[] {
  const results: OpenCost[] = [];
  for (const [isin, trades] of byIsin(movements)) {
    const { walk, converted } = walkFor(trades, options);
    const quantity = walk.lots.reduce((total, lot) => total + lot.qty, 0);
    const cost = walk.lots.reduce((total, lot) => total.plus(lot.price.times(lot.qty)), new Big(0));
    results.push({
      isin,
      product: trades[0]?.product ?? null,
      quantity,
      cost: unusable(walk) ? null : new Money(cost, walk.currency!),
      converted,
    });
  }
  return results.sort((a, b) => a.isin.localeCompare(b.isin));
}

/**
 * Latest account balance per currency, taken from the newest row that reports
 * one.
 *
 * `Solde` is a single running balance, not one per account: a sweep and its
 * `Virement` mirror are two entries in that one stream and they cancel out.
 * Skipping either kind lands mid-pair on a balance that never stood, off by the
 * swept amount. {@link reconcileBalances} treats the stream the same way.
 *
 * Which kind ends the pair is not fixed — DEGIRO emits them in either order
 * under a shared timestamp — so the newest row wins regardless of kind.
 *
 * Assumes `movements` are newest-first, as produced by the parser.
 */
export function cashByCurrency(movements: readonly Movement[]): Money[] {
  const latest = new Map<string, Money>();
  for (const movement of movements) {
    const balance = movement.record.balance;
    if (!balance || latest.has(balance.currency)) continue;
    latest.set(balance.currency, balance);
  }
  return [...latest.values()].sort(byCurrencyName);
}

const amountsOf = (movements: readonly Movement[], kinds: ReadonlySet<Movement['kind']>): Money[] =>
  movements
    .filter((m) => kinds.has(m.kind))
    .map((m) => m.amount)
    .filter((a): a is Money => a !== null);

const EXTERNAL_FLOW_KINDS: ReadonlySet<Movement['kind']> = new Set(['deposit', 'withdrawal']);

/**
 * Every movement of money across the account boundary, in or out.
 *
 * Direction comes from the sign, not the description: DEGIRO books a withdrawal
 * as a negative `Versement de fonds` at least as often as it names it one, so
 * splitting on the matcher alone would file half of them as deposits.
 */
export function externalFlows(movements: readonly Movement[]): Money[] {
  return amountsOf(movements, EXTERNAL_FLOW_KINDS);
}

/** Roll up a set of movements into a {@link PortfolioSummary}. */
export function summarizePortfolio(
  movements: readonly Movement[],
  options?: PortfolioOptions,
): PortfolioSummary {
  const openCost = computeOpenCost(movements, options);

  return {
    positions: computePositions(movements),
    realizedPnl: computeRealizedPnl(movements, options),
    openCost,
    invested: sumByCurrency(openCost.map((entry) => entry.cost)),
    cashByCurrency: cashByCurrency(movements),
    dividends: sumByCurrency(amountsOf(movements, new Set(['dividend']))),
    dividendTax: sumByCurrency(amountsOf(movements, new Set(['dividendTax']))),
    fees: sumByCurrency(amountsOf(movements, new Set(['brokerageFee', 'connectivityFee']))),
    deposits: sumByCurrency(externalFlows(movements).filter((a) => a.isPositive())),
    withdrawals: sumByCurrency(externalFlows(movements).filter((a) => a.isNegative())),
    netExternalFlow: sumByCurrency(externalFlows(movements)),
    interest: sumByCurrency(amountsOf(movements, new Set(['interest']))),
  };
}

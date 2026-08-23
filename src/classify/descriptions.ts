import type { Dialect } from '../dialects/types';
import { Money } from '../money/money';

/** Leading quantity: digits, then any number of grouped thousands. */
const LEADING_QTY = /^[0-9]+(?:[ .,\u00a0\u202f][0-9]{3})*/;
const QTY_GROUPING = /[ .,\u00a0\u202f]/g;
/** `Achat|Vente|Buy|Sell` and the whitespace that follows it. */
const TRADE_VERB = /^(Achat|Vente|Buy|Sell)\s+/i;
const BUY_SIDE = /^(achat|buy)$/i;
const CURRENCY = /^[A-Za-z]{3}$/;
const DIGIT = /[0-9]/;
const TRAILING_SPACE = /\s$/;
/** Settlement prefix on FX trade rows. */
const FX_SETTLEMENT_PREFIX =
  /^(?:R[èe]glement transaction devise|(?:Currency|FX)\s+(?:transaction\s+)?settlement)\s*:\s*/i;
/** Currency pair such as `EUR/CHF`. */
const FX_PAIR = /^[A-Za-z]{3}\/[A-Za-z]{3}$/;
/** `Virement|Transfer|Deposit|Withdrawal vers|depuis|to|from ...`, up to the colon. */
const CASH_TRANSFER = /^(?:Virement|Transfer|Deposit|Withdrawal)\s+(vers|depuis|to|from)\b/i;
const TO_CASH_ACCOUNT = /^(vers|to)$/i;

/** Parse a localized integer quantity (with space thousands separators). */
export function parseQuantity(raw: string, dialect: Dialect): number | null {
  const decimal = dialect.parseDecimal(raw);
  if (decimal === null) return null;
  const value = Number(decimal);
  return Number.isFinite(value) ? value : null;
}

/** Structured result of parsing a trade description. */
export interface ParsedTrade {
  readonly side: 'buy' | 'sell';
  readonly quantity: number | null;
  readonly product: string | null;
  readonly unitPrice: Money | null;
  readonly isin: string | null;
}

export type ParsedTradeShape = Omit<ParsedTrade, 'side'>;

function splitTrailingCurrency(text: string): { head: string; currency: string } | null {
  const currency = text.slice(-3);
  if (!CURRENCY.test(currency)) return null;
  const head = text.slice(0, -3);
  if (!TRAILING_SPACE.test(head)) return null;
  return { head: head.trim(), currency };
}

function parsePriceTail(
  priceTail: string,
  dialect: Dialect,
): { unitPrice: Money | null; isin: string | null } {
  const trimmed = priceTail.trim();
  const open = trimmed.lastIndexOf('(');
  if (open < 0 || !trimmed.endsWith(')')) return { unitPrice: null, isin: null };

  const priceAndCurrency = splitTrailingCurrency(trimmed.slice(0, open).trim());
  if (!priceAndCurrency) return { unitPrice: null, isin: null };

  const price = dialect.parseDecimal(priceAndCurrency.head);
  return {
    unitPrice: price === null ? null : new Money(price, priceAndCurrency.currency),
    isin: trimmed.slice(open + 1, -1).trim() || null,
  };
}

function parseTradeBody(
  qtyAndProduct: string,
  priceTail: string,
  dialect: Dialect,
): ParsedTradeShape {
  const qtyMatch = LEADING_QTY.exec(qtyAndProduct);
  const quantity = qtyMatch ? parseQuantity(qtyMatch[0].replace(QTY_GROUPING, ''), dialect) : null;
  const rest = qtyMatch ? qtyAndProduct.slice(qtyMatch[0].length) : qtyAndProduct;

  return { quantity, product: rest.trim() || null, ...parsePriceTail(priceTail, dialect) };
}

function splitAtPrice(text: string, from: number): { left: string; right: string } | null {
  const at = text.indexOf('@', from);
  if (at <= 0 || at === text.length - 1) return null;
  return { left: text.slice(from, at), right: text.slice(at + 1) };
}

/**
 * Parse a trade description such as
 * `"Achat 42 iShares Core MSCI World UCITS ETF USD (Acc)@96,11 CHF (IE00B4L5Y983)"`.
 * Returns `null` when the text is not a trade.
 */
export function parseTradeDescription(description: string, dialect: Dialect): ParsedTrade | null {
  const trimmed = description.trim();
  const verb = TRADE_VERB.exec(trimmed);
  if (!verb) return null;

  const split = splitAtPrice(trimmed, verb[0].length);
  if (!split) return null;

  const side = BUY_SIDE.test(verb[1] ?? '') ? 'buy' : 'sell';
  return { side, ...parseTradeBody(split.left, split.right, dialect) };
}

export interface ParsedUnlabelledTrade extends ParsedTradeShape {
  readonly prefix: string;
}

export function parseUnlabelledTradeDescription(
  description: string,
  dialect: Dialect,
): ParsedUnlabelledTrade | null {
  const trimmed = description.trim();
  const quantity = trimmed.search(DIGIT);
  if (quantity < 0) return null;

  const split = splitAtPrice(trimmed, quantity);
  if (!split) return null;

  return {
    prefix: trimmed.slice(0, quantity).trim(),
    ...parseTradeBody(split.left, split.right, dialect),
  };
}

/** Structured result of parsing a currency-pair (FX) trade description. */
export interface ParsedFxTrade {
  readonly side: 'buy' | 'sell';
  readonly pair: string | null;
  readonly quantity: number | null;
  readonly rate: Money | null;
  readonly settlement: boolean;
}

/**
 * Parse an FX trade description such as `"Achat 4 800 EUR/CHF@0,9412 CHF ()"` or
 * its `"Règlement transaction devise: ..."` settlement variant. Returns `null`
 * when the text is not a currency-pair trade.
 */
export function parseFxTradeDescription(
  description: string,
  dialect: Dialect,
): ParsedFxTrade | null {
  let text = description.trim();
  const settlement = FX_SETTLEMENT_PREFIX.test(text);
  if (settlement) {
    text = text.replace(FX_SETTLEMENT_PREFIX, '');
  }

  const parsed = parseTradeDescription(text, dialect);
  if (!parsed || !parsed.product || !FX_PAIR.test(parsed.product)) {
    return null;
  }

  return {
    side: parsed.side,
    pair: parsed.product,
    quantity: parsed.quantity,
    rate: parsed.unitPrice,
    settlement,
  };
}

/** Structured result of parsing a cash-transfer description. */
export interface ParsedCashTransfer {
  readonly direction: 'toCashAccount' | 'fromCashAccount';
  readonly amount: Money | null;
}

/**
 * Parse a cash-transfer description such as
 * `"Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 213,25 EUR"`.
 */
export function parseCashTransferDescription(
  description: string,
  dialect: Dialect,
): ParsedCashTransfer | null {
  const trimmed = description.trim();
  const match = CASH_TRANSFER.exec(trimmed);
  if (!match) return null;

  const colon = trimmed.lastIndexOf(':');
  if (colon < 0) return null;

  const stated = splitTrailingCurrency(trimmed.slice(colon + 1).trim());
  if (!stated || !DIGIT.test(stated.head.charAt(0))) return null;

  const direction = TO_CASH_ACCOUNT.test(match[1] ?? '') ? 'toCashAccount' : 'fromCashAccount';
  const decimal = dialect.parseDecimal(stated.head);
  const amount = decimal === null ? null : new Money(decimal, stated.currency);

  return { direction, amount };
}

/** Extract a 4-digit year from a description, if present. */
export function extractYear(description: string): number | null {
  const match = /\b(\d{4})\b/.exec(description);
  return match ? Number(match[1]) : null;
}

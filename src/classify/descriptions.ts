import type { Dialect } from '../dialects/types';
import { Money } from '../money/money';

/** Leading quantity (digits with space thousands separators) then the remainder. */
const LEADING_QTY = /^([0-9][0-9\u00a0\u202f ]*)(.*)$/;
/** `<price> <CCY> (<isin?>)` tail of a trade description. */
const PRICE_TAIL = /^(.+?)\s+([A-Za-z]{3})\s+\(([^)]*)\)\s*$/;
/** `Achat|Vente <rest>@<priceTail>` */
const TRADE = /^(Achat|Vente)\s+(.+?)@(.+)$/;
/** Settlement prefix on FX trade rows. */
const FX_SETTLEMENT_PREFIX = /^R[èe]glement transaction devise:\s*/i;
/** Currency pair such as `EUR/CHF`. */
const FX_PAIR = /^[A-Za-z]{3}\/[A-Za-z]{3}$/;
/** `Virement vers|depuis ... : <amount> <CCY>` */
const CASH_TRANSFER =
  /^Virement\s+(vers|depuis)\b.*:\s*([0-9][0-9\u00a0\u202f .,]*?)\s+([A-Za-z]{3})\s*$/i;

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

/**
 * Parse a trade description such as
 * `"Achat 42 iShares Core MSCI World UCITS ETF USD (Acc)@96,11 CHF (IE00B4L5Y983)"`.
 * Returns `null` when the text is not a trade.
 */
export function parseTradeDescription(description: string, dialect: Dialect): ParsedTrade | null {
  const trade = TRADE.exec(description.trim());
  if (!trade) return null;

  const side = trade[1] === 'Achat' ? 'buy' : 'sell';
  const qtyAndProduct = trade[2] ?? '';
  const priceTail = trade[3] ?? '';

  const qtyMatch = LEADING_QTY.exec(qtyAndProduct);
  const quantity = qtyMatch ? parseQuantity(qtyMatch[1] ?? '', dialect) : null;
  const product = qtyMatch ? (qtyMatch[2] ?? '').trim() || null : qtyAndProduct.trim() || null;

  const priceMatch = PRICE_TAIL.exec(priceTail);
  let unitPrice: Money | null = null;
  let isin: string | null = null;
  if (priceMatch) {
    const priceDecimal = dialect.parseDecimal(priceMatch[1] ?? '');
    const currency = priceMatch[2] ?? '';
    if (priceDecimal !== null && currency !== '') {
      unitPrice = new Money(priceDecimal, currency);
    }
    isin = (priceMatch[3] ?? '').trim() || null;
  }

  return { side, quantity, product, unitPrice, isin };
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
  const match = CASH_TRANSFER.exec(description.trim());
  if (!match) return null;

  const direction = (match[1] ?? '').toLowerCase() === 'vers' ? 'toCashAccount' : 'fromCashAccount';
  const decimal = dialect.parseDecimal(match[2] ?? '');
  const currency = match[3] ?? '';
  const amount = decimal !== null && currency !== '' ? new Money(decimal, currency) : null;

  return { direction, amount };
}

/** Extract a 4-digit year from a description, if present. */
export function extractYear(description: string): number | null {
  const match = /\b(\d{4})\b/.exec(description);
  return match ? Number(match[1]) : null;
}

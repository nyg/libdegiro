import type { Dialect } from '../dialects/types'
import { Money } from '../money/money'

/** Leading quantity: digits, then any number of grouped thousands. */
const LEADING_QTY = /^[0-9]+(?:[ .,\u00a0\u202f][0-9]{3})*/
const QTY_GROUPING = /[ .,\u00a0\u202f]/g
/** `Achat|Vente|Buy|Sell|Koop|Verkoop|Kauf|Verkauf` and the whitespace that follows it. */
const TRADE_VERB = /^(Achat|Vente|Buy|Sell|Koop|Verkoop|Kauf|Verkauf)\s+/i
const BUY_SIDE = /^(achat|buy|koop|kauf)$/i
const UNLABELLED_PRICE_SEPARATORS = ['@'] as const
/** German trades read `Kauf 1 zu je 211 USD`. */
const LABELLED_PRICE_SEPARATORS = ['@', ' zu je '] as const
const CURRENCY = /^[A-Za-z]{3}$/
const DIGIT = /[0-9]/
const TRAILING_SPACE = /\s$/
/** Settlement prefix on FX trade rows. */
const FX_SETTLEMENT_PREFIX =
   /^(?:R[èe]glement transaction devise|(?:Currency|FX)\s+(?:transaction\s+)?settlement)\s*:\s*/i
/** Currency pair such as `EUR/CHF`. */
const FX_PAIR = /^[A-Za-z]{3}\/[A-Za-z]{3}$/
const TO_CASH_ACCOUNT =
   /^(?:(?:virement|transfer|deposit|withdrawal)\s+(?:vers|to)|overboeking\s+naar|überweisung\s+auf|transferir\s+a|trasferisci\s+sul)\b/i
const FROM_CASH_ACCOUNT =
   /^(?:(?:virement|transfer|deposit|withdrawal)\s+(?:depuis|from)|overboeking\s+van|auszahlung\s+von|transferir\s+desde|trasferisci\s+dal)\b/i
const AMOUNT_CHAR = /[0-9.,\s]/

/** Parse a localized integer quantity (with space thousands separators). */
export function parseQuantity(raw: string, dialect: Dialect): number | null {
   const decimal = dialect.parseDecimal(raw)
   if (decimal === null) {
      return null
   }
   const value = Number(decimal)
   return Number.isFinite(value) ? value : null
}

/** Structured result of parsing a trade description. */
export interface ParsedTrade {
   readonly side: 'buy' | 'sell'
   readonly quantity: number | null
   readonly product: string | null
   readonly unitPrice: Money | null
   readonly isin: string | null
}

export type ParsedTradeShape = Omit<ParsedTrade, 'side'>

function splitTrailingCurrency(text: string): { head: string, currency: string } | null {
   const currency = text.slice(-3)
   if (!CURRENCY.test(currency)) {
      return null
   }
   const head = text.slice(0, -3)
   if (!TRAILING_SPACE.test(head)) {
      return null
   }
   return { head: head.trim(), currency }
}

function parsePriceTail(
   priceTail: string,
   dialect: Dialect,
   isinRequired: boolean,
): { unitPrice: Money | null, isin: string | null } {
   const trimmed = priceTail.trim()
   const open = trimmed.lastIndexOf('(')
   const hasIsin = open >= 0 && trimmed.endsWith(')')
   if (!hasIsin && isinRequired) {
      return { unitPrice: null, isin: null }
   }

   const priceAndCurrency = splitTrailingCurrency(hasIsin ? trimmed.slice(0, open).trim() : trimmed)
   if (!priceAndCurrency) {
      return { unitPrice: null, isin: null }
   }

   const price = dialect.parseDecimal(priceAndCurrency.head)
   return {
      unitPrice: price === null ? null : new Money(price, priceAndCurrency.currency),
      isin: hasIsin ? trimmed.slice(open + 1, -1).trim() || null : null,
   }
}

function parseTradeBody(
   qtyAndProduct: string,
   priceTail: string,
   dialect: Dialect,
   isinRequired: boolean,
): ParsedTradeShape {
   const qtyMatch = LEADING_QTY.exec(qtyAndProduct)
   const quantity = qtyMatch ? parseQuantity(qtyMatch[0].replace(QTY_GROUPING, ''), dialect) : null
   const rest = qtyMatch ? qtyAndProduct.slice(qtyMatch[0].length) : qtyAndProduct

   return {
      quantity,
      product: rest.trim() || null,
      ...parsePriceTail(priceTail, dialect, isinRequired),
   }
}

function splitAtPrice(
   text: string,
   from: number,
   separators: readonly string[],
): { left: string, right: string } | null {
   let at = -1
   let length = 0
   for (const separator of separators) {
      const index = text.indexOf(separator, from)
      if (index >= 0 && (at < 0 || index < at)) {
         at = index
         length = separator.length
      }
   }
   if (at <= 0 || at + length >= text.length) {
      return null
   }
   return { left: text.slice(from, at), right: text.slice(at + length) }
}

/**
 * Parse a trade description such as
 * `"Achat 42 iShares Core MSCI World UCITS ETF USD (Acc)@96,11 CHF (IE00B4L5Y983)"`,
 * `"Koop 15 @ 76,50 EUR"` or `"Kauf 1 zu je 211 USD (US88160R1014)"`.
 * Returns `null` when the text is not a trade.
 */
export function parseTradeDescription(description: string, dialect: Dialect): ParsedTrade | null {
   const trimmed = description.trim()
   const verb = TRADE_VERB.exec(trimmed)
   if (!verb) {
      return null
   }

   const split = splitAtPrice(trimmed, verb[0].length, LABELLED_PRICE_SEPARATORS)
   if (!split) {
      return null
   }

   const side = BUY_SIDE.test(verb[1] ?? '') ? 'buy' : 'sell'
   return { side, ...parseTradeBody(split.left, split.right, dialect, false) }
}

export interface ParsedUnlabelledTrade extends ParsedTradeShape {
   readonly prefix: string
}

export function parseUnlabelledTradeDescription(
   description: string,
   dialect: Dialect,
): ParsedUnlabelledTrade | null {
   const trimmed = description.trim()
   const quantity = trimmed.search(DIGIT)
   if (quantity < 0) {
      return null
   }

   const split = splitAtPrice(trimmed, quantity, UNLABELLED_PRICE_SEPARATORS)
   if (!split) {
      return null
   }

   return {
      prefix: trimmed.slice(0, quantity).trim(),
      ...parseTradeBody(split.left, split.right, dialect, true),
   }
}

/** Structured result of parsing a currency-pair (FX) trade description. */
export interface ParsedFxTrade {
   readonly side: 'buy' | 'sell'
   readonly pair: string | null
   readonly quantity: number | null
   readonly rate: Money | null
   readonly settlement: boolean
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
   let text = description.trim()
   const settlement = FX_SETTLEMENT_PREFIX.test(text)
   if (settlement) {
      text = text.replace(FX_SETTLEMENT_PREFIX, '')
   }

   const parsed = parseTradeDescription(text, dialect)
   if (!parsed || !parsed.product || !FX_PAIR.test(parsed.product)) {
      return null
   }

   return {
      side: parsed.side,
      pair: parsed.product,
      quantity: parsed.quantity,
      rate: parsed.unitPrice,
      settlement,
   }
}

/** Structured result of parsing a cash-transfer description. */
export interface ParsedCashTransfer {
   readonly direction: 'toCashAccount' | 'fromCashAccount'
   readonly amount: Money | null
}

function cashTransferDirection(text: string): ParsedCashTransfer['direction'] | null {
   if (TO_CASH_ACCOUNT.test(text)) {
      return 'toCashAccount'
   }
   if (FROM_CASH_ACCOUNT.test(text)) {
      return 'fromCashAccount'
   }
   return null
}

function trailingAmount(text: string): string {
   let start = text.length
   while (start > 0 && AMOUNT_CHAR.test(text.charAt(start - 1))) {
      start -= 1
   }
   return text.slice(start).trim()
}

/**
 * Parse a cash-transfer description such as
 * `"Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 213,25 EUR"`, with
 * or without the colon before the amount.
 */
export function parseCashTransferDescription(
   description: string,
   dialect: Dialect,
): ParsedCashTransfer | null {
   const trimmed = description.trim()
   const direction = cashTransferDirection(trimmed)
   if (direction === null) {
      return null
   }

   const stated = splitTrailingCurrency(trimmed)
   const amountText = stated ? trailingAmount(stated.head) : ''
   if (!stated || !DIGIT.test(amountText.charAt(0))) {
      return null
   }

   const decimal = dialect.parseDecimal(amountText)
   const amount = decimal === null ? null : new Money(decimal, stated.currency)

   return { direction, amount }
}

/** Extract a 4-digit year from a description, if present. */
export function extractYear(description: string): number | null {
   const match = /\b(\d{4})\b/.exec(description)
   return match ? Number(match[1]) : null
}

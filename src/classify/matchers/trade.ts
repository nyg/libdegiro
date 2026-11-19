import { parseTradeDescription } from '../descriptions'
import type { Matcher } from '../types'

const FX_PAIR = /^[A-Za-z]{3}\/[A-Za-z]{3}$/

function isFxPair(product: string | null): boolean {
   return product !== null && FX_PAIR.test(product)
}

/** Matches a security buy/sell (`Achat`/`Vente` of an instrument carrying an ISIN). */
export const tradeMatcher: Matcher = {
   name: 'trade',
   match({ record, dialect }) {
      const parsed = parseTradeDescription(record.description, dialect)
      if (!parsed || isFxPair(parsed.product) || isFxPair(record.product)) {
         return null
      }
      // Security trades always carry an ISIN; FX pair trades do not.
      const isin = record.isin ?? parsed.isin
      if (isin === null) {
         return null
      }
      return {
         kind: parsed.side,
         side: parsed.side,
         quantity: parsed.quantity ?? 0,
         unitPrice: parsed.unitPrice,
         product: record.product ?? parsed.product,
         isin,
         orderId: record.orderId,
         amount: record.mutation,
         record,
      }
   },
}

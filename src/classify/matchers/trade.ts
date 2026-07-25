import type { Matcher } from '../types';
import { parseTradeDescription } from '../descriptions';

/** Matches a security buy/sell (`Achat`/`Vente` of an instrument carrying an ISIN). */
export const tradeMatcher: Matcher = {
  name: 'trade',
  match({ record, dialect }) {
    const parsed = parseTradeDescription(record.description, dialect);
    // Security trades always carry an ISIN; FX pair trades do not.
    if (!parsed || parsed.isin === null) return null;
    return {
      kind: parsed.side,
      side: parsed.side,
      quantity: parsed.quantity ?? 0,
      unitPrice: parsed.unitPrice,
      product: record.product ?? parsed.product,
      isin: record.isin ?? parsed.isin,
      orderId: record.orderId,
      amount: record.mutation,
      record,
    };
  },
};

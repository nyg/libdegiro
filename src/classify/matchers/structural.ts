import type { Money } from '../../money/money';
import type { Matcher, TradeSide } from '../types';
import { parseUnlabelledTradeDescription } from '../descriptions';

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const FX_PAIR = /^[A-Za-z]{3}\/[A-Za-z]{3}$/;
const STRUCTURAL_PRIORITY = -10;

function sideFromMutation(mutation: Money | null): TradeSide | null {
  if (mutation === null || mutation.isZero()) return null;
  return mutation.isNegative() ? 'buy' : 'sell';
}

export const structuralFxTradeMatcher: Matcher = {
  name: 'structuralFxTrade',
  priority: STRUCTURAL_PRIORITY + 1,
  match({ record, dialect }) {
    const parsed = parseUnlabelledTradeDescription(record.description, dialect);
    if (!parsed || !parsed.product || !FX_PAIR.test(parsed.product)) return null;

    const side = sideFromMutation(record.mutation);
    if (side === null) return null;

    return {
      kind: 'fxTrade',
      side,
      pair: parsed.product,
      quantity: parsed.quantity ?? 0,
      rate: parsed.unitPrice,
      settlement: parsed.prefix.includes(':'),
      orderId: record.orderId,
      amount: record.mutation,
      record,
    };
  },
};

export const structuralTradeMatcher: Matcher = {
  name: 'structuralTrade',
  priority: STRUCTURAL_PRIORITY,
  match({ record, dialect }) {
    const parsed = parseUnlabelledTradeDescription(record.description, dialect);
    if (!parsed || parsed.unitPrice === null) return null;

    const isin = record.isin ?? parsed.isin;
    if (isin === null || !ISIN.test(isin)) return null;

    const side = sideFromMutation(record.mutation);
    if (side === null) return null;

    return {
      kind: side,
      side,
      quantity: parsed.quantity ?? 0,
      unitPrice: parsed.unitPrice,
      product: record.product ?? parsed.product,
      isin,
      orderId: record.orderId,
      amount: record.mutation,
      record,
    };
  },
};

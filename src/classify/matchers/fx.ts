import type { Matcher } from '../types';
import { parseFxTradeDescription } from '../descriptions';

/** `Opération de change - Crédit/Débit` (accent spelling varies between legs). */
const FX_CONVERSION = /^op[ée]ration de change\s*-\s*(cr[ée]dit|d[ée]bit)/i;

/** Matches a currency-pair trade (`Achat/Vente <qty> EUR/CHF@<rate> CCY`). */
export const fxTradeMatcher: Matcher = {
  name: 'fxTrade',
  priority: 10,
  match({ record, dialect }) {
    const parsed = parseFxTradeDescription(record.description, dialect);
    if (!parsed) return null;
    return {
      kind: 'fxTrade',
      side: parsed.side,
      pair: parsed.pair,
      quantity: parsed.quantity ?? 0,
      rate: parsed.rate,
      settlement: parsed.settlement,
      orderId: record.orderId,
      amount: record.mutation,
      record,
    };
  },
};

/** Matches a single currency-conversion leg (credit or debit). */
export const fxConversionMatcher: Matcher = {
  name: 'fxConversion',
  match({ record }) {
    const match = FX_CONVERSION.exec(record.description.trim());
    if (!match) return null;
    const isCredit = /cr[ée]dit/i.test(match[1] ?? '');
    return {
      kind: isCredit ? 'fxCredit' : 'fxDebit',
      direction: isCredit ? 'credit' : 'debit',
      rate: record.fxRate,
      orderId: record.orderId,
      amount: record.mutation,
      record,
    };
  },
};

import type { Matcher } from '../types';

const DIVIDEND_TAX = /^imp[oô]ts? sur (le )?dividende/i;
const DIVIDEND = /^dividende\b/i;
const CAPITAL_RETURN = /^remboursement de capital/i;

/** Matches dividend tax withholding (`Impôts sur dividende`). */
export const dividendTaxMatcher: Matcher = {
  name: 'dividendTax',
  match({ record }) {
    if (!DIVIDEND_TAX.test(record.description.trim())) return null;
    return {
      kind: 'dividendTax',
      product: record.product,
      isin: record.isin,
      amount: record.mutation,
      record,
    };
  },
};

/** Matches a dividend payment (`Dividende`). */
export const dividendMatcher: Matcher = {
  name: 'dividend',
  match({ record }) {
    if (!DIVIDEND.test(record.description.trim())) return null;
    return {
      kind: 'dividend',
      product: record.product,
      isin: record.isin,
      amount: record.mutation,
      record,
    };
  },
};

/** Matches a return of capital (`Remboursement de capital`). */
export const capitalReturnMatcher: Matcher = {
  name: 'capitalReturn',
  match({ record }) {
    if (!CAPITAL_RETURN.test(record.description.trim())) return null;
    return {
      kind: 'capitalReturn',
      product: record.product,
      isin: record.isin,
      amount: record.mutation,
      record,
    };
  },
};

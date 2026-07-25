import type { Matcher } from '../types';
import { extractYear } from '../descriptions';

const BROKERAGE = /^frais degiro de courtage/i;
const CONNECTIVITY = /^frais de connexion aux places boursi[èe]res/i;

/** Matches a brokerage / third-party transaction fee. */
export const brokerageFeeMatcher: Matcher = {
  name: 'brokerageFee',
  match({ record }) {
    if (!BROKERAGE.test(record.description.trim())) return null;
    return {
      kind: 'brokerageFee',
      product: record.product,
      isin: record.isin,
      orderId: record.orderId,
      amount: record.mutation,
      record,
    };
  },
};

/** Matches an annual exchange connectivity fee. */
export const connectivityFeeMatcher: Matcher = {
  name: 'connectivityFee',
  match({ record }) {
    if (!CONNECTIVITY.test(record.description.trim())) return null;
    return {
      kind: 'connectivityFee',
      year: extractYear(record.description),
      amount: record.mutation,
      record,
    };
  },
};

import type { Matcher } from '../types';

const INTEREST = /interest income/i;

/** Matches interest income (`Flatex Interest Income`). */
export const interestMatcher: Matcher = {
  name: 'interest',
  match({ record }) {
    if (!INTEREST.test(record.description.trim())) return null;
    return {
      kind: 'interest',
      amount: record.mutation,
      record,
    };
  },
};

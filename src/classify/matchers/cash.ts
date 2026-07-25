import type { Matcher } from '../types';
import { parseCashTransferDescription } from '../descriptions';

const CASH_SWEEP = /^degiro cash sweep transfer/i;
const DEPOSIT = /^versement de fonds/i;

/** Matches a cash sweep between the DEGIRO account and the cash account. */
export const cashSweepMatcher: Matcher = {
  name: 'cashSweep',
  match({ record }) {
    if (!CASH_SWEEP.test(record.description.trim())) return null;
    return { kind: 'cashSweep', amount: record.mutation, record };
  },
};

/** Matches an external deposit of funds (`Versement de fonds`). */
export const depositMatcher: Matcher = {
  name: 'deposit',
  match({ record }) {
    if (!DEPOSIT.test(record.description.trim())) return null;
    return { kind: 'deposit', amount: record.mutation, record };
  },
};

/** Matches an informational cash-transfer mirror (`Virement vers/depuis ...`). */
export const cashTransferMatcher: Matcher = {
  name: 'cashTransfer',
  match({ record, dialect }) {
    const parsed = parseCashTransferDescription(record.description, dialect);
    if (!parsed) return null;
    return {
      kind: 'cashTransfer',
      direction: parsed.direction,
      statedAmount: parsed.amount,
      amount: record.mutation,
      record,
    };
  },
};

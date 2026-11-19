import { parseCashTransferDescription } from '../descriptions'
import type { Matcher } from '../types'

const CASH_SWEEP = /^(?:degiro|flatex) cash sweep transfer/i
const DEPOSIT =
   /^(?:versement de fonds|d[ée]p[ôo]t flatex|(?:processed\s+)?(?:flatex\s+|ideal\s+)?deposit|(?:ideal|flatex)\s+storting|(?:sofort\s+|flatex\s+)?einzahlung|ingreso(?!\s+cambio\b)|deposito|vklad)\b/i
const WITHDRAWAL =
   /^(?:retrait de fonds|(?:processed\s+)?(?:flatex\s+)?withdrawal|flatex\s+terugstorting|auszahlung|prelievo(?!\s+fx\b))\b/i

/** Matches a cash sweep between the DEGIRO account and the cash account. */
export const cashSweepMatcher: Matcher = {
   name: 'cashSweep',
   match({ record }) {
      if (!CASH_SWEEP.test(record.description.trim())) {
         return null
      }
      return { kind: 'cashSweep', amount: record.mutation, record }
   },
}

/** Matches an external deposit of funds (`Versement de fonds`). */
export const depositMatcher: Matcher = {
   name: 'deposit',
   match({ record }) {
      if (!DEPOSIT.test(record.description.trim())) {
         return null
      }
      return { kind: 'deposit', amount: record.mutation, record }
   },
}

/** Matches an external withdrawal of funds (`Retrait de fonds`). */
export const withdrawalMatcher: Matcher = {
   name: 'withdrawal',
   match({ record }) {
      if (!WITHDRAWAL.test(record.description.trim())) {
         return null
      }
      return { kind: 'withdrawal', amount: record.mutation, record }
   },
}

/** Matches an informational cash-transfer mirror (`Virement vers/depuis ...`). */
export const cashTransferMatcher: Matcher = {
   name: 'cashTransfer',
   match({ record, dialect }) {
      const parsed = parseCashTransferDescription(record.description, dialect)
      if (!parsed) {
         return null
      }
      return {
         kind: 'cashTransfer',
         direction: parsed.direction,
         statedAmount: parsed.amount,
         amount: record.mutation,
         record,
      }
   },
}

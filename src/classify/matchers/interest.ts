import type { Matcher } from '../types'

const INTEREST = /interest income|^flatex interest\b/i

/** Matches interest credited or charged (`Flatex Interest Income`, `Flatex Interest`). */
export const interestMatcher: Matcher = {
   name: 'interest',
   match({ record }) {
      if (!INTEREST.test(record.description.trim())) {
         return null
      }
      return {
         kind: 'interest',
         amount: record.mutation,
         record,
      }
   },
}

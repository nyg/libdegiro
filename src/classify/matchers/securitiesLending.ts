import type { Matcher } from '../types'

const SECURITIES_LENDING = /^revenus?\s+provenant\s+du\s+pr[êe]t\s+de\s+titres\b/i

export const securitiesLendingMatcher: Matcher = {
   name: 'securitiesLending',
   match({ record }) {
      if (!SECURITIES_LENDING.test(record.description.trim())) {
         return null
      }
      return {
         kind: 'securitiesLending',
         amount: record.mutation,
         record,
      }
   },
}

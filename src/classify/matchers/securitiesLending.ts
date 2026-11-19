import type { Matcher } from '../types'

const SECURITIES_LENDING = [
   /^revenus?\s+provenant\s+du\s+pr[êe]t\s+de\s+titres\b/i,
   /^inkomsten\s+uit\s+securities\s+lending\b/i,
   // Unconfirmed by a real export: one form is from another parser's test, the other mirrors the French.
   /^ingresos\s+(?:por|procedentes\s+del?)\s+pr[ée]stamo\s+de\s+valores\b/i,
]

export const securitiesLendingMatcher: Matcher = {
   name: 'securitiesLending',
   match({ record }) {
      const description = record.description.trim()
      if (!SECURITIES_LENDING.some((pattern) => pattern.test(description))) {
         return null
      }
      return {
         kind: 'securitiesLending',
         amount: record.mutation,
         record,
      }
   },
}

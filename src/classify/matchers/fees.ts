import { extractYear } from '../descriptions'
import type { Matcher } from '../types'

const BROKERAGE =
   /^(?:frais degiro de courtage|degiro transaction|degiro transactiekosten|(?:degiro )?transaktionsgeb[üu]hr|costes de transacci[óo]n|degiro commissioni di transazione|comiss[õo]es de transa[çc][ãa]o)/i
const CONNECTIVITY =
   /^(?:frais de connexion aux places boursi[èe]res|(?:de)?giro exchange connect(?:ion|ivity) fee|degiro aansluitingskosten|einrichtung von handelsmodalit[äa]ten|degiro costi di connessione|degiro poplatek za obchodov[áa]n[íi] na zahrani[čc]n[íi]ch burz[áa]ch)/i

/** Matches a brokerage / third-party transaction fee. */
export const brokerageFeeMatcher: Matcher = {
   name: 'brokerageFee',
   match({ record }) {
      if (!BROKERAGE.test(record.description.trim())) {
         return null
      }
      return {
         kind: 'brokerageFee',
         product: record.product,
         isin: record.isin,
         orderId: record.orderId,
         amount: record.mutation,
         record,
      }
   },
}

/** Matches an annual exchange connectivity fee. */
export const connectivityFeeMatcher: Matcher = {
   name: 'connectivityFee',
   match({ record }) {
      if (!CONNECTIVITY.test(record.description.trim())) {
         return null
      }
      return {
         kind: 'connectivityFee',
         year: extractYear(record.description),
         amount: record.mutation,
         record,
      }
   },
}

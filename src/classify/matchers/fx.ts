import type { Money } from '../../money/money'
import { parseFxTradeDescription } from '../descriptions'
import type { Matcher } from '../types'

/** `Opération de change - Crédit/Débit` (accent spelling varies between legs). */
const FX_CREDIT =
   /^(?:(?:op[ée]ration de change|currency exchange|fx)[\s(-]*cr[ée]dit|valuta creditering|w[äa]hrungswechsel \(einbuchung\)|ingreso cambio de divisa|credito fx|cr[ée]dito de divisa)/i
const FX_DEBIT =
   /^(?:(?:op[ée]ration de change|currency exchange|fx)[\s(-]*d[ée]bit|valuta debitering|w[äa]hrungswechsel \(ausbuchung\)|retirada cambio de divisa|prelievo fx|levantamento de divisa)/i
/** Czech names both legs alike, so only the sign tells them apart. */
const FX_EITHER_LEG = /^fx vy[uú][čc]tov[áa]n[íi] konverze m[ěe]ny/i

function directionFromSign(mutation: Money | null): 'credit' | 'debit' | null {
   if (mutation === null || mutation.isZero()) {
      return null
   }
   return mutation.isNegative() ? 'debit' : 'credit'
}

function conversionDirection(description: string, mutation: Money | null): 'credit' | 'debit' | null {
   if (FX_CREDIT.test(description)) {
      return 'credit'
   }
   if (FX_DEBIT.test(description)) {
      return 'debit'
   }
   return FX_EITHER_LEG.test(description) ? directionFromSign(mutation) : null
}

/** Matches a currency-pair trade (`Achat/Vente <qty> EUR/CHF@<rate> CCY`). */
export const fxTradeMatcher: Matcher = {
   name: 'fxTrade',
   priority: 10,
   match({ record, dialect }) {
      const parsed = parseFxTradeDescription(record.description, dialect)
      if (!parsed) {
         return null
      }
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
      }
   },
}

/** Matches a single currency-conversion leg (credit or debit). */
export const fxConversionMatcher: Matcher = {
   name: 'fxConversion',
   match({ record }) {
      const direction = conversionDirection(record.description.trim(), record.mutation)
      if (direction === null) {
         return null
      }
      return {
         kind: direction === 'credit' ? 'fxCredit' : 'fxDebit',
         direction,
         rate: record.fxRate,
         orderId: record.orderId,
         amount: record.mutation,
         record,
      }
   },
}

import { Money, type Movement, type PortfolioOptions } from 'libdegiro'

import { type ConvertedTotal, totalAsOf } from './convert'
import { balanceCurrencies, dailyBalanceSeries } from './timeseries'

/** A stretch of days that each closed with a negative balance in one currency. */
export interface DebitPeriod {
   readonly currency: string
   /** Close of the first day below zero. */
   readonly from: Date
   /** Close of the first day back at or above zero, or null while still borrowed. */
   readonly until: Date | null
   /** Nights spent below zero, or null while still borrowed. */
   readonly nights: number | null
   /** Largest end-of-day debit, as a positive amount. */
   readonly peak: Money
   readonly peakDate: Date
}

export interface CurrencyMargin {
   readonly currency: string
   /** Owed at the end of the statement, as a positive amount; zero when nothing is. */
   readonly borrowed: Money
   /** Start of the debit still open at the end of the statement. */
   readonly since: Date | null
   /** Largest end-of-day debit in the statement, as a positive amount. */
   readonly peak: Money
   /** Interest rows with a negative amount, summed; zero or negative. */
   readonly interestCharged: Money
   /** Oldest first. */
   readonly periods: readonly DebitPeriod[]
}

export interface MarginReport {
   /** Currencies that closed a day below zero or were charged interest, sorted. */
   readonly byCurrency: readonly CurrencyMargin[]
   /** What is owed at the end of the statement, per currency, positive and non-zero. */
   readonly borrowed: readonly Money[]
   readonly interestCharged: readonly Money[]
   /** Every debit period across currencies, newest first. */
   readonly periods: readonly DebitPeriod[]
   /** Start of the oldest debit still open, or null when nothing is borrowed. */
   readonly since: Date | null
}

/**
 * Money borrowed on margin, read from the statement's own running balance.
 *
 * DEGIRO lends the shortfall automatically when a purchase exceeds the cash in
 * its currency, so a negative balance is the loan. Each currency is its own
 * loan: an EUR buy paid from CHF through AutoFX leaves the debit in CHF.
 *
 * End-of-day balances, not row balances, decide what counts as borrowed. A
 * trade and its AutoFX legs dip below zero within one timestamp, and a sweep
 * pair can show a negative intermediate balance; neither is a loan.
 */
export function buildMarginReport(movements: readonly Movement[]): MarginReport {
   const charged = interestChargedByCurrency(movements)
   const currencies = new Set([...balanceCurrencies(movements), ...charged.keys()])

   const byCurrency = [...currencies]
      .sort()
      .map((currency) => currencyMargin(movements, currency, charged.get(currency)))
      .filter((entry) => entry.periods.length > 0 || !entry.interestCharged.isZero())

   const open = byCurrency.flatMap((entry) => (entry.since ? [entry.since] : []))

   return {
      byCurrency,
      borrowed: byCurrency.map((entry) => entry.borrowed).filter((amount) => !amount.isZero()),
      interestCharged: byCurrency
         .map((entry) => entry.interestCharged)
         .filter((amount) => !amount.isZero()),
      periods: byCurrency
         .flatMap((entry) => entry.periods)
         .sort((a, b) => b.from.getTime() - a.from.getTime()),
      since: open.length > 0 ? new Date(Math.min(...open.map((date) => date.getTime()))) : null,
   }
}

function currencyMargin(
   movements: readonly Movement[],
   currency: string,
   interestCharged = Money.zero(currency),
): CurrencyMargin {
   const periods: DebitPeriod[] = []
   let open = null as DebitPeriod | null
   let closing = Money.zero(currency)

   for (const { date, balance } of dailyBalanceSeries(movements, currency)) {
      closing = balance
      if (balance.isNegative()) {
         const debit = balance.negate()
         if (open === null) {
            open = { currency, from: date, until: null, nights: null, peak: debit, peakDate: date }
         } else if (debit.greaterThan(open.peak)) {
            open = { ...open, peak: debit, peakDate: date }
         }
         continue
      }
      if (open !== null) {
         periods.push({ ...open, until: date, nights: nightsBetween(open.from, date) })
         open = null
      }
   }

   if (open !== null) {
      periods.push(open)
   }

   return {
      currency,
      borrowed: closing.isNegative() ? closing.negate() : Money.zero(currency),
      since: open?.from ?? null,
      peak: periods.reduce(
         (largest, period) => (period.peak.greaterThan(largest) ? period.peak : largest),
         Money.zero(currency),
      ),
      interestCharged,
      periods,
   }
}

function interestChargedByCurrency(movements: readonly Movement[]): Map<string, Money> {
   const charged = new Map<string, Money>()
   for (const movement of movements) {
      const amount = movement.amount
      if (movement.kind !== 'interest' || amount === null || !amount.isNegative()) {
         continue
      }
      charged.set(amount.currency, (charged.get(amount.currency) ?? Money.zero(amount.currency)).add(amount))
   }
   return charged
}

const DAY = 86_400_000

const utcDay = (date: Date): number =>
   Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

const nightsBetween = (from: Date, until: Date): number =>
   Math.round((utcDay(until) - utcDay(from)) / DAY)

export interface LoanToCost {
   readonly ratio: number | null
   readonly converted: boolean
}

/**
 * The loan as a share of what the positions still held cost.
 *
 * Cost, not market value: the statement carries no prices. DEGIRO sets the
 * credit limit on market value, so this is a sense of scale, not headroom.
 * When the loan and the positions are in different currencies, both sides go
 * through the rate table on the statement's last day, or there is no ratio.
 */
export function loanToCost(
   borrowed: readonly Money[],
   cost: ConvertedTotal,
   on: Date | null,
   fx: PortfolioOptions | null | undefined,
): LoanToCost {
   const loan = totalAsOf(borrowed, on, fx)
   if (
      loan.amount === null ||
      cost.amount === null ||
      loan.amount.currency !== cost.amount.currency ||
      !cost.amount.isPositive()
   ) {
      return { ratio: null, converted: false }
   }
   return {
      ratio: loan.amount.amount.div(cost.amount.amount).toNumber(),
      converted: loan.converted || cost.converted,
   }
}

import type { PortfolioOptions, PortfolioSummary } from 'libdegiro'

import type { CashFlowReport } from './cashflow'
import { type ConvertedTotal, totalAsOf, totalIn } from './convert'
import type { IncomeTotals } from './income'
import type { PositionRows } from './positions'
import type { DateRange } from './timeseries'

export interface OverviewTotals {
   readonly deposited: ConvertedTotal
   readonly positions: ConvertedTotal
   readonly cash: ConvertedTotal
   readonly dividends: ConvertedTotal
   readonly fees: ConvertedTotal
   readonly interest: ConvertedTotal
   readonly dividendTax: ConvertedTotal
}

/**
 * Every Overview figure as one amount in the reference currency.
 *
 * Flows convert on the day each was booked. Cash and the cost of positions
 * held are standing amounts, so they convert on the statement's last day, as
 * the Positions tab does. Without a rate for every amount a figure is
 * unavailable rather than partly converted.
 */
export function buildOverviewTotals(
   input: {
      readonly cashFlow: CashFlowReport
      readonly portfolio: PortfolioSummary
      readonly positions: PositionRows
      readonly incomeTotals: IncomeTotals
      readonly interestAndLending: ConvertedTotal
      readonly range: DateRange | null
   },
   fx: PortfolioOptions | null | undefined,
): OverviewTotals {
   return {
      deposited: totalIn(input.cashFlow.events, fx),
      positions: input.positions.activeTotals.cost,
      cash: totalAsOf(input.portfolio.cashByCurrency, input.range?.to ?? null, fx),
      dividends: input.incomeTotals.dividends,
      fees: input.incomeTotals.fees,
      interest: input.interestAndLending,
      dividendTax: input.incomeTotals.dividendTax,
   }
}

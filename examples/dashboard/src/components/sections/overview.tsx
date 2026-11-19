import { sumByCurrency } from 'libdegiro'

import { StatCard } from '@/components/stat-card'
import { referenceCurrency } from '@/lib/analytics'
import { formatDate } from '@/lib/format'
import { useAnalytics } from '@/state/statement-context'

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

function interestHint(lending: boolean, charged: boolean): string {
   const credited = lending ? 'Interest and securities lending' : 'Credited by flatexDEGIRO'
   return charged ? `${credited}, less interest charged` : credited
}

export function OverviewSection() {
   const { portfolio, feeTotals, range, result, margin, overview, fx } = useAnalytics()
   const openPositions = portfolio.positions.filter((position) => position.quantity !== 0)
   const invested = portfolio.invested.filter((amount) => !amount.isZero())
   const lending = portfolio.securitiesLending.length > 0
   const base = referenceCurrency(fx)
   const booked = `Other currencies converted into ${base} at the ECB rate of the day each amount was booked.`
   const standing = range
      ? `Other currencies converted into ${base} at the ECB rate of ${formatDate(range.to)}, the statement's last day.`
      : booked
   const totals = Object.values(overview)
   const perCurrency = totals.some((total) => total.amount === null)
   const currency = totals.find((total) => total.amount !== null)?.amount?.currency

   return (
      <div className="flex flex-col gap-6">
         <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
               title="Deposited"
               total={overview.deposited}
               converted={booked}
               amounts={portfolio.netExternalFlow}
               hint="Transfers in, less transfers out"
            />
            <StatCard
               title="Positions"
               total={overview.positions}
               converted={standing}
               amounts={invested}
               hint={`${plural(openPositions.length, 'position')} held, ${plural(portfolio.positions.length, 'instrument')} traded`}
            />
            <StatCard
               title="Cash balance"
               total={overview.cash}
               converted={standing}
               amounts={portfolio.cashByCurrency}
               hideZero
               hint={
                  margin.since
                     ? `Latest. Below zero is a margin loan, since ${formatDate(margin.since)}`
                     : 'Latest'
               }
            />
            <StatCard
               title="Dividends"
               total={overview.dividends}
               converted={booked}
               amounts={portfolio.dividends}
               hint={`${portfolio.dividendTax.length > 0 ? 'Before' : 'No'} withholding tax`}
            />
         </div>

         <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
               title="Fees paid"
               total={overview.fees}
               converted={booked}
               amounts={feeTotals.all}
               hint={`${feeTotals.count.brokerage + feeTotals.count.connectivity} charges`}
            />
            <StatCard
               title={lending ? 'Interest & lending' : 'Interest'}
               total={overview.interest}
               converted={booked}
               amounts={sumByCurrency([...portfolio.interest, ...portfolio.securitiesLending])}
               hideZero
               hint={interestHint(lending, margin.interestCharged.length > 0)}
            />
            <StatCard
               title="Withholding tax"
               total={overview.dividendTax}
               converted={booked}
               amounts={portfolio.dividendTax}
               hideZero
               hint="Deducted at source"
            />
            <StatCard
               title="Statement period"
               value={
                  range ? (
                     <span className="text-base font-medium">
                        {formatDate(range.from)} → {formatDate(range.to)}
                     </span>
                  ) : (
                     '—'
                  )
               }
               hint={`${result.records.length} rows, ${result.transactions.length} transactions`}
            />
         </div>

         <p className="text-muted-foreground text-xs">
            {perCurrency
               ? 'Some totals are listed per currency: turn on Convert with ECB rates, in the exchange rates menu, to see them in one currency.'
               : `Amounts in ${currency ?? base}. A figure marked ≈ includes other currencies converted at ECB reference rates; the other tabs break every total down by currency.`}
         </p>
      </div>
   )
}

import { MoneyList } from '@/components/money-list'
import { StatCard } from '@/components/stat-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
} from '@/components/ui/table'
import { referenceCurrency } from '@/lib/analytics'
import { formatDate, formatPercent } from '@/lib/format'
import { useAnalytics } from '@/state/statement-context'

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

function LoanToCostValue() {
   const { loanToCost, margin, fx } = useAnalytics()

   if (margin.borrowed.length === 0) {
      return <StatCard title="Loan to cost" value="—" hint="Nothing borrowed right now" />
   }

   if (loanToCost.ratio === null) {
      return (
         <StatCard
            title="Loan to cost"
            value={<span className="text-muted-foreground">n/a</span>}
            hint="The loan and the positions are in different currencies: turn on Convert with ECB rates to compare them"
         />
      )
   }

   const percent = formatPercent(loanToCost.ratio)
   return (
      <StatCard
         title="Loan to cost"
         value={loanToCost.converted ? `≈ ${percent}` : percent}
         hint={`Loan over the cost of positions held${loanToCost.converted ? ` (${referenceCurrency(fx)}, last day's ECB rate)` : ''}. DEGIRO's limit uses market value`}
      />
   )
}

export function MarginLoan() {
   const { margin } = useAnalytics()

   if (margin.byCurrency.length === 0) {
      return null
   }

   return (
      <div className="flex flex-col gap-6">
         <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
               title="Borrowed on margin"
               amounts={margin.borrowed}
               hint={
                  margin.since
                     ? `Since ${formatDate(margin.since)}`
                     : 'Nothing owed at the end of the statement'
               }
            />
            <StatCard
               title="Largest debit"
               amounts={margin.byCurrency.map((entry) => entry.peak)}
               hideZero
               hint="Highest end-of-day loan"
            />
            <StatCard
               title="Interest charged"
               amounts={margin.interestCharged}
               hint="Booked monthly, in arrears"
            />
            <LoanToCostValue />
         </div>

         <Card>
            <CardHeader>
               <CardTitle className="text-base">Margin loan</CardTitle>
               <CardDescription>
                  A negative balance is a loan. When a buy costs more than the cash in its currency,
                  DEGIRO lends the shortfall against your positions and charges interest on it each month.
                  Each currency is a separate loan, and an EUR buy paid from CHF leaves the debt in CHF.
                  Only end-of-day balances count, so a dip settled within the minute is not a loan.
               </CardDescription>
            </CardHeader>
            <CardContent>
               <div className="overflow-x-auto">
                  <Table>
                     <TableHeader>
                        <TableRow>
                           <TableHead className="w-20">Currency</TableHead>
                           <TableHead className="w-32">From</TableHead>
                           <TableHead className="w-32">Until</TableHead>
                           <TableHead className="text-right">Duration</TableHead>
                           <TableHead className="text-right">Largest debit</TableHead>
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {margin.periods.map((period) => (
                           <TableRow key={`${period.currency}-${period.from.getTime()}`}>
                              <TableCell>{period.currency}</TableCell>
                              <TableCell className="tabular whitespace-nowrap">
                                 {formatDate(period.from)}
                              </TableCell>
                              <TableCell className="tabular whitespace-nowrap">
                                 {period.until ? (
                                    formatDate(period.until)
                                 ) : (
                                    <Badge variant="destructive">Still borrowed</Badge>
                                 )}
                              </TableCell>
                              <TableCell className="tabular text-right">
                                 {period.nights === null ? '—' : plural(period.nights, 'night')}
                              </TableCell>
                              <TableCell>
                                 <MoneyList amounts={[period.peak]} size="sm" className="items-end" />
                              </TableCell>
                           </TableRow>
                        ))}
                     </TableBody>
                  </Table>
               </div>
            </CardContent>
         </Card>
      </div>
   )
}

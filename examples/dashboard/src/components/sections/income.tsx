import type { ConvertedTotal } from '@/lib/analytics';
import { useAnalytics } from '@/state/statement-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyList } from '@/components/money-list';
import { TotalAmount } from '@/components/converted';
import { IsinLink } from '@/components/isin-link';
import { formatDate, formatPercent } from '@/lib/format';

const TOTAL_METHOD =
  'Dividends, withholding tax, interest and fees added together, each line converted on the day it was booked at the ECB reference rate. A figure marked ≈ came out of a rate rather than off the statement.';

const TOTAL_CONVERTED =
  'Booked in more than one currency and combined through ECB reference rates, each line converted on the day it was booked.';

const TOTAL_UNAVAILABLE =
  'These lines are booked in more than one currency and no exchange rate is available to combine them. Turning on ECB rates fills this in.';

function TotalCell({ total }: { total: ConvertedTotal }) {
  return (
    <TableCell className="text-right">
      <TotalAmount
        total={total}
        converted={TOTAL_CONVERTED}
        unavailable={TOTAL_UNAVAILABLE}
        signed
      />
    </TableCell>
  );
}

export function IncomeSection() {
  const { dividends, income, incomeTotals } = useAnalytics();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Year by year</CardTitle>
          <CardDescription>
            Each bucket stays per currency. Only the Total column and the bottom row combine them,
            converting every line on the day it was booked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Year</TableHead>
                  <TableHead className="text-right">Dividends</TableHead>
                  <TableHead className="text-right">Withholding tax</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted underline-offset-4">
                          Total
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{TOTAL_METHOD}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {income.map((year) => (
                  <TableRow key={year.year}>
                    <TableCell className="tabular font-medium">{year.year}</TableCell>
                    <TableCell>
                      <MoneyList
                        amounts={year.dividends}
                        size="sm"
                        hideZero
                        className="items-end"
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyList
                        amounts={year.dividendTax}
                        size="sm"
                        hideZero
                        className="items-end"
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyList amounts={year.interest} size="sm" hideZero className="items-end" />
                    </TableCell>
                    <TableCell>
                      <MoneyList amounts={year.fees} size="sm" hideZero className="items-end" />
                    </TableCell>
                    <TotalCell total={year.total} />
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TotalCell total={incomeTotals.dividends} />
                  <TotalCell total={incomeTotals.dividendTax} />
                  <TotalCell total={incomeTotals.interest} />
                  <TotalCell total={incomeTotals.fees} />
                  <TotalCell total={incomeTotals.total} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {dividends.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dividends by instrument</CardTitle>
            <CardDescription>
              An effective withholding rate is shown only where the dividend and its tax were booked
              in the same currency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instrument</TableHead>
                    <TableHead>ISIN</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Last paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividends.map((group) => (
                    <TableRow key={group.key}>
                      <TableCell className="max-w-xs">
                        <span className="block truncate">{group.label}</span>
                      </TableCell>
                      <TableCell>
                        {group.isin ? (
                          <IsinLink isin={group.isin} product={group.label} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <MoneyList amounts={group.gross} size="sm" className="items-end" />
                      </TableCell>
                      <TableCell>
                        <MoneyList amounts={group.tax} size="sm" className="items-end" />
                      </TableCell>
                      <TableCell>
                        <MoneyList amounts={group.net} size="sm" className="items-end" />
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {group.withholdingRate === null ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help underline decoration-dotted">
                                —
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              No tax was withheld, or the dividend and the tax were booked in
                              different currencies.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          formatPercent(group.withholdingRate)
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right whitespace-nowrap">
                        {formatDate(group.lastDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

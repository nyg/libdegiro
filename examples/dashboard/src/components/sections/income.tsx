import { useAnalytics } from '@/state/statement-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyList } from '@/components/money-list';
import { formatDate, formatPercent } from '@/lib/format';

export function IncomeSection() {
  const { dividends, income, portfolio } = useAnalytics();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Year by year</CardTitle>
          <CardDescription>
            Every column stays per currency — nothing is converted or combined.
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
                  </TableRow>
                ))}
              </TableBody>
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
                      <TableCell className="max-w-xs truncate">{group.label}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-sm">Dividends</p>
            <MoneyList amounts={portfolio.dividends} />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Withholding tax</p>
            <MoneyList amounts={portfolio.dividendTax} />
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Interest</p>
            <MoneyList amounts={portfolio.interest} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

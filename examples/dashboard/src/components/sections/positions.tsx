import type { PositionRow } from '@/lib/analytics';
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
import { IsinLink } from '@/components/isin-link';
import { formatMoneyAbs, formatQuantity } from '@/lib/format';

const PNL_UNAVAILABLE =
  'Realised profit and loss could not be computed unambiguously — usually because the instrument was traded in more than one currency, or a sale had no matching purchase inside this statement.';

const FEES_METHOD =
  'Every DEGIRO transaction fee booked against this instrument over the statement — the per-order charge on each buy and each sell, added up. It is a cost already paid, not a valuation.';

const FEES_CURRENCY =
  'DEGIRO charges the transaction fee in the currency of the exchange’s home market, which is often not the currency the trade settled in: a Swiss-listed ETF bought in CHF is routinely charged in EUR. There is no exchange rate anywhere in a statement, so the two are listed side by side rather than invented into one number.';

const PNL_METHOD =
  'FIFO, computed within this statement’s date range, and net of the brokerage fees booked against the instrument. Fees are only netted off once shares have actually been sold, and only when they were charged in the same currency as the P/L.';

function ExplainedHeader({ label, explanation }: { label: string; explanation: string }) {
  return (
    <TableHead className="text-right">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{explanation}</TooltipContent>
      </Tooltip>
    </TableHead>
  );
}

function PositionsTable({ rows, showHeld }: { rows: readonly PositionRow[]; showHeld: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Instrument</TableHead>
            <TableHead>ISIN</TableHead>
            <TableHead className="text-right">Bought</TableHead>
            <TableHead className="text-right">Sold</TableHead>
            {showHeld ? <TableHead className="text-right">Held</TableHead> : null}
            <ExplainedHeader label="Transaction fees" explanation={FEES_METHOD} />
            <ExplainedHeader label="Realised P/L" explanation={PNL_METHOD} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.isin}>
              <TableCell className="max-w-xs">
                <span className="block truncate">{row.product ?? row.isin}</span>
              </TableCell>
              <TableCell>
                <IsinLink isin={row.isin} />
              </TableCell>
              <TableCell className="tabular text-right">{formatQuantity(row.bought)}</TableCell>
              <TableCell className="tabular text-right">{formatQuantity(row.sold)}</TableCell>
              {showHeld ? (
                <TableCell className="tabular text-right font-medium">
                  {formatQuantity(row.quantity)}
                </TableCell>
              ) : null}
              <TableCell>
                <div className="flex flex-col items-end gap-0.5">
                  <MoneyList amounts={row.fees} size="sm" hideZero className="items-end" />
                  {row.fees.length > 1 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground cursor-help text-xs underline decoration-dotted">
                          two currencies
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{FEES_CURRENCY}</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right">
                {row.net ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <MoneyList amounts={[row.net]} size="sm" signed className="items-end" />
                    {row.unappliedFees.length > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help text-xs underline decoration-dotted">
                            some fees excluded
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {row.unappliedFees.map(formatMoneyAbs).join(' and ')} of fees on this
                          instrument were booked in another currency, and no exchange rate exists in
                          a statement to convert them.
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help text-sm underline decoration-dotted">
                        n/a
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{PNL_UNAVAILABLE}</TooltipContent>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PositionsSection() {
  const { positions } = useAnalytics();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active positions</CardTitle>
          <CardDescription>
            {positions.active.length === 0
              ? 'Nothing is still held at the end of this statement.'
              : 'Instruments with shares left at the end of this statement. Fees on a position that has not been sold are part of the cost of the shares you still hold, so they are shown but never netted into P/L.'}
          </CardDescription>
        </CardHeader>
        {positions.active.length > 0 ? (
          <CardContent>
            <PositionsTable rows={positions.active} showHeld />
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Closed positions</CardTitle>
          <CardDescription>
            {positions.closed.length === 0
              ? 'Every instrument traded in this statement is still held.'
              : 'Instruments bought and sold back down to nothing. Every fee below has been netted into the realised figure, where both were charged in the same currency.'}
          </CardDescription>
        </CardHeader>
        {positions.closed.length > 0 ? (
          <CardContent>
            <PositionsTable rows={positions.closed} showHeld={false} />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

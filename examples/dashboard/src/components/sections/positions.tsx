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
  'Every DEGIRO transaction fee booked against this instrument over the statement.';

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
                <IsinLink isin={row.isin} product={row.product} />
              </TableCell>
              <TableCell className="tabular text-right">{formatQuantity(row.bought)}</TableCell>
              <TableCell className="tabular text-right">{formatQuantity(row.sold)}</TableCell>
              {showHeld ? (
                <TableCell className="tabular text-right font-medium">
                  {formatQuantity(row.quantity)}
                </TableCell>
              ) : null}
              <TableCell>
                <MoneyList amounts={row.fees} size="sm" hideZero className="items-end" />
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
          {positions.active.length === 0 ? (
            <CardDescription>Nothing is still held at the end of this statement.</CardDescription>
          ) : null}
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
          {positions.closed.length === 0 ? (
            <CardDescription>
              Every instrument traded in this statement is still held.
            </CardDescription>
          ) : null}
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

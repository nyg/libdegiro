import type { ConvertedTotal, PositionRow, PositionTotals } from '@/lib/analytics';
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
import { Approx, TotalAmount, Unavailable } from '@/components/converted';
import { IsinLink } from '@/components/isin-link';
import { formatMoneyAbs, formatPercent, formatQuantity } from '@/lib/format';

const PNL_UNAVAILABLE =
  'Realised profit and loss could not be computed unambiguously — usually because a sale had no matching purchase inside this statement, or the instrument was traded in more than one currency and no exchange rate was available to bridge them.';

const FEES_METHOD =
  'Every DEGIRO transaction fee booked against this instrument over the statement.';

const PNL_METHOD =
  'FIFO, computed within this statement’s date range, and net of the brokerage fees booked against the instrument. Fees are only netted off once shares have actually been sold. A figure marked ≈ was derived through ECB reference rates rather than booked in one currency.';

const OPEN_COST_METHOD =
  'What the shares still held were bought for: the purchase price of the FIFO lots no sale has consumed, in the currency they were traded in. This is a cost, not a valuation — a statement carries no market price.';

const CLOSED_COST_METHOD =
  'What the shares that were sold were bought for: the purchase price of the FIFO lots the sales consumed. Reading the realised figure beside it gives the return this position actually produced.';

const COST_UNAVAILABLE =
  'The cost of these shares could not be computed unambiguously — usually because a sale had no matching purchase inside this statement, or the instrument was traded in more than one currency and no exchange rate was available to bridge them.';

const WEIGHT_METHOD =
  'This position’s cost as a share of the total open cost in the Total row below. It weights what you paid, not what the holding is worth — a statement carries no market price. Costs booked in another currency are converted at the ECB reference rate for the statement’s last day.';

const WEIGHT_UNAVAILABLE =
  'The open positions are booked in more than one currency and no exchange rate is available to put them on one scale. Turning on ECB rates fills this in.';

const CONVERTED =
  'Derived through ECB reference rates, converting each leg on the day it was booked, rather than read straight off the statement. It therefore includes the currency move as well as the price move.';

const TOTAL_CONVERTED =
  'Combined through ECB reference rates at the statement’s last day. A cost basis or a realised figure spans many bookings rather than one, so a single date has to stand for the lot — which makes this a summary, not a figure to reconcile against.';

const TOTAL_UNAVAILABLE =
  'These rows are booked in more than one currency and no exchange rate is available to combine them. Turning on ECB rates fills this in.';

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

function Excluded({ count }: { count: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground cursor-help text-xs underline decoration-dotted">
          {count} excluded
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {count === 1 ? 'One instrument' : `${count} instruments`} could not be computed
        unambiguously and {count === 1 ? 'is' : 'are'} left out of this total.
      </TooltipContent>
    </Tooltip>
  );
}

function WeightCell({ weight }: { weight: number | undefined }) {
  return (
    <TableCell className="tabular text-right">
      {weight === undefined ? (
        <Unavailable explanation={WEIGHT_UNAVAILABLE} />
      ) : (
        formatPercent(weight)
      )}
    </TableCell>
  );
}

function TotalCell({
  total,
  missing = 0,
  signed = false,
}: {
  total: ConvertedTotal;
  missing?: number;
  signed?: boolean;
}) {
  return (
    <TableCell className="text-right">
      <div className="flex flex-col items-end gap-0.5">
        <TotalAmount
          total={total}
          converted={TOTAL_CONVERTED}
          unavailable={TOTAL_UNAVAILABLE}
          signed={signed}
        />
        {missing > 0 ? <Excluded count={missing} /> : null}
      </div>
    </TableCell>
  );
}

function PositionsTable({
  rows,
  showHeld,
  totals,
  weights,
}: {
  rows: readonly PositionRow[];
  showHeld: boolean;
  totals: PositionTotals;
  weights?: ReadonlyMap<string, number>;
}) {
  const costMethod = showHeld ? OPEN_COST_METHOD : CLOSED_COST_METHOD;

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
            <ExplainedHeader label="Cost" explanation={costMethod} />
            {weights ? <ExplainedHeader label="%" explanation={WEIGHT_METHOD} /> : null}
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
              <TableCell className="text-right">
                {row.cost ? (
                  row.costConverted ? (
                    <Approx explanation={CONVERTED}>
                      <MoneyList amounts={[row.cost]} size="sm" className="items-end" />
                    </Approx>
                  ) : (
                    <MoneyList amounts={[row.cost]} size="sm" className="items-end" />
                  )
                ) : (
                  <Unavailable explanation={COST_UNAVAILABLE} />
                )}
              </TableCell>
              {weights ? <WeightCell weight={weights.get(row.isin)} /> : null}
              <TableCell>
                <MoneyList amounts={row.fees} size="sm" hideZero className="items-end" />
              </TableCell>
              <TableCell className="text-right">
                {row.net ? (
                  <div className="flex flex-col items-end gap-0.5">
                    {row.pnlConverted || row.feesConverted ? (
                      <Approx explanation={CONVERTED}>
                        <MoneyList amounts={[row.net]} size="sm" signed className="items-end" />
                      </Approx>
                    ) : (
                      <MoneyList amounts={[row.net]} size="sm" signed className="items-end" />
                    )}
                    {row.unappliedFees.length > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-muted-foreground cursor-help text-xs underline decoration-dotted">
                            some fees excluded
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {row.unappliedFees.map(formatMoneyAbs).join(' and ')} of fees on this
                          instrument were booked in another currency, and no exchange rate was
                          available to convert them.
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                ) : (
                  <Unavailable explanation={PNL_UNAVAILABLE} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={showHeld ? 5 : 4}>Total</TableCell>
            <TotalCell total={totals.cost} missing={totals.missingCost} />
            {weights ? <WeightCell weight={weights.size > 0 ? 1 : undefined} /> : null}
            <TotalCell total={totals.fees} />
            <TotalCell total={totals.net} missing={totals.missingNet} signed />
          </TableRow>
        </TableFooter>
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
            <PositionsTable
              rows={positions.active}
              showHeld
              totals={positions.activeTotals}
              weights={positions.costWeights}
            />
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
            <PositionsTable
              rows={positions.closed}
              showHeld={false}
              totals={positions.closedTotals}
            />
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}

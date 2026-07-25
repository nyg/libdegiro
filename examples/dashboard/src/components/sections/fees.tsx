import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  buildFeeNarrative,
  connectivityFeesByYearAndExchange,
  cumulativeFees,
  feeRatio,
  feesByMonth,
  feesByProduct,
  inCurrency,
  type FeeContext,
  type FeeRatio,
} from '@/lib/analytics';
import { useAnalytics } from '@/state/statement-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/stat-card';
import { MoneyList } from '@/components/money-list';
import {
  CumulativeFeesChart,
  FeesByMonthChart,
  FeesByProductChart,
} from '@/components/charts/fee-charts';
import { formatDate, formatMoney, formatPercent, formatQuantity } from '@/lib/format';

const RATIO_EXPLANATIONS: Record<Exclude<FeeRatio, { kind: 'pct' }>['why'], string> = {
  'currency-mismatch':
    'The fee and the trade were booked in different currencies. This dashboard makes no network calls, so it has no exchange rate to bridge them.',
  'multi-currency':
    'The order settled in more than one currency, so there is no single base to compare against.',
  'no-consideration': 'The order has no trade amount to compare the fee against.',
};

function FeeRatioCell({ ratio }: { ratio: FeeRatio }) {
  if (ratio.kind === 'pct') return <span className="tabular">{formatPercent(ratio.value)}</span>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-muted-foreground cursor-help underline decoration-dotted">—</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{RATIO_EXPLANATIONS[ratio.why]}</TooltipContent>
    </Tooltip>
  );
}

function WhyCell({ context }: { context: FeeContext }) {
  const { reason } = context;

  switch (reason.kind) {
    case 'trade':
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant={reason.side === 'buy' ? 'default' : 'secondary'}>{reason.side}</Badge>
            <span className="tabular text-sm">{formatQuantity(reason.quantity)}</span>
            <span className="truncate text-sm">{reason.product ?? reason.isin ?? 'Unknown'}</span>
          </div>
          <MoneyList amounts={reason.consideration} size="sm" className="text-muted-foreground" />
        </div>
      );
    case 'fxTrade':
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline">FX {reason.side}</Badge>
          <span className="tabular text-sm">{formatQuantity(reason.quantity)}</span>
          <span className="text-sm">{reason.pair ?? 'currency pair'}</span>
        </div>
      );
    case 'connectivity':
      return (
        <span className="text-sm">
          {reason.exchange?.label ?? 'Exchange'} connectivity for{' '}
          {reason.year ?? 'an unstated year'}
        </span>
      );
    case 'orphan':
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground cursor-help text-sm underline decoration-dotted">
              {reason.note === 'fee-only-order' ? 'Order not in this export' : 'Not a trade'}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {reason.note === 'fee-only-order'
              ? 'The order this fee belongs to has no trade rows in this file — most often because the trade settled just outside the exported date range.'
              : `The order contains ${reason.siblings.map((m) => m.kind).join(', ') || 'no other rows'}.`}
          </TooltipContent>
        </Tooltip>
      );
  }
}

export function FeesSection() {
  const { fees, feeTotals, feeContexts, range } = useAnalytics();
  const currencies = feeTotals.currencies;
  const [currency, setCurrency] = useState(() => currencies[0] ?? 'EUR');

  const active = currencies.includes(currency) ? currency : (currencies[0] ?? 'EUR');

  const narrative = useMemo(
    () => buildFeeNarrative(fees.entries, feeTotals),
    [fees.entries, feeTotals],
  );

  const monthly = useMemo(
    () =>
      feesByMonth(fees.entries, active, {
        fill: true,
        ...(range ? { range: [range.from, range.to] as const } : {}),
      }),
    [fees.entries, active, range],
  );

  const cumulative = useMemo(
    () =>
      cumulativeFees(fees.entries, active, {
        fill: true,
        ...(range ? { range: [range.from, range.to] as const } : {}),
      }),
    [fees.entries, active, range],
  );

  const products = useMemo(() => feesByProduct(fees.entries, active), [fees.entries, active]);
  const connectivity = useMemo(
    () => connectivityFeesByYearAndExchange(fees.entries, active),
    [fees.entries, active],
  );
  const scopedCount = useMemo(
    () => inCurrency(fees.entries, active).length,
    [fees.entries, active],
  );

  if (fees.entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fees</CardTitle>
          <CardDescription>This statement contains no fee rows.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Brokerage fees"
          amounts={feeTotals.brokerage}
          hint={`${feeTotals.count.brokerage} charges across ${feeTotals.orderCount} orders`}
        />
        <StatCard
          title="Connectivity fees"
          amounts={feeTotals.connectivity}
          hint={`${feeTotals.count.connectivity} annual exchange charges`}
        />
        <StatCard
          title="All fees"
          amounts={feeTotals.all}
          hint="Totals stay per currency — never converted"
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 pt-6">
          <p className="text-lg font-medium text-balance">{narrative.headline}</p>
          {narrative.details.map((detail) => (
            <p key={detail} className="text-muted-foreground text-sm">
              {detail}
            </p>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">When you paid</h3>
          <p className="text-muted-foreground text-sm">
            {scopedCount} fees booked in {active}
          </p>
        </div>
        {currencies.length > 1 ? (
          <Select value={active} onValueChange={setCurrency}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fees by month</CardTitle>
            <CardDescription>
              Empty months are shown, so the gaps are real rather than implied.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeesByMonthChart buckets={monthly} currency={active} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paid to date</CardTitle>
            <CardDescription>Running total over the statement period.</CardDescription>
          </CardHeader>
          <CardContent>
            <CumulativeFeesChart points={cumulative} currency={active} />
          </CardContent>
        </Card>
      </div>

      {products.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What cost the most</CardTitle>
            <CardDescription>
              Brokerage fees by instrument. Connectivity fees carry no instrument and are excluded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FeesByProductChart groups={products} currency={active} />
          </CardContent>
        </Card>
      ) : null}

      {connectivity.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exchange connectivity</CardTitle>
            <CardDescription>
              Charged once a year per venue. The year a fee covers is often not the year it was
              billed — both are shown.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee year</TableHead>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Billed</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectivity.map((group) => (
                  <TableRow key={`${group.year}-${group.exchange?.label}`}>
                    <TableCell className="tabular font-medium">{group.year ?? '—'}</TableCell>
                    <TableCell>
                      {group.exchange?.label ?? 'Unknown'}
                      {group.exchange?.code && group.exchange.name ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {group.exchange.code}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular">
                      {group.entries[0] ? formatDate(group.entries[0].date) : '—'}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatMoney(group.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every fee, and why</CardTitle>
          <CardDescription className="flex items-start gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Each fee is matched to the order that caused it through its order id.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="w-24 text-right">Of trade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeContexts.map((context) => (
                  <TableRow key={`${context.fee.line ?? 'x'}-${context.fee.description}`}>
                    <TableCell className="tabular text-sm whitespace-nowrap">
                      {formatDate(context.fee.date)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <WhyCell context={context} />
                    </TableCell>
                    <TableCell
                      className={`tabular text-right whitespace-nowrap ${
                        context.fee.amount.isPositive()
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : ''
                      }`}
                    >
                      {formatMoney(context.fee.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <FeeRatioCell
                        ratio={feeRatio(
                          context.fee.amount,
                          context.reason.kind === 'trade' || context.reason.kind === 'fxTrade'
                            ? context.reason.consideration
                            : [],
                        )}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

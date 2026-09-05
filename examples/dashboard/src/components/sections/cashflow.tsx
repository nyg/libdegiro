import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAnalytics } from '@/state/statement-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MoneyList } from '@/components/money-list';
import { StatCard } from '@/components/stat-card';
import { formatAxisNumber, formatDate, formatDecimal, toChartNumber } from '@/lib/format';

export function CashFlowSection() {
  const { cashFlow } = useAnalytics();
  const [currency, setCurrency] = useState(() => cashFlow.currencies[0] ?? '');
  const active = cashFlow.byCurrency.find((entry) => entry.currency === currency)
    ? currency
    : (cashFlow.currencies[0] ?? '');
  const selected = cashFlow.byCurrency.find((entry) => entry.currency === active) ?? null;

  const data = useMemo(
    () =>
      (selected?.events ?? []).map((event) => ({
        t: event.date.getTime(),
        cumulative: toChartNumber(event.cumulative),
      })),
    [selected],
  );

  const config = useMemo(
    () =>
      ({
        cumulative: { label: `Running total (${active})`, color: 'var(--chart-1)' },
      }) satisfies ChartConfig,
    [active],
  );

  if (cashFlow.events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funding</CardTitle>
          <CardDescription>
            No money entered or left the account from outside it during this statement.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Deposited"
          amounts={cashFlow.byCurrency.map((entry) => entry.deposits)}
          hideZero
          hint={`${countOf(cashFlow.byCurrency, 'depositCount')} transfers in`}
        />
        <StatCard
          title="Withdrawn"
          amounts={cashFlow.byCurrency.map((entry) => entry.withdrawals)}
          hideZero
          hint={`${countOf(cashFlow.byCurrency, 'withdrawalCount')} transfers out`}
        />
        <StatCard
          title="Net funded"
          amounts={cashFlow.byCurrency.map((entry) => entry.net)}
          hint="What you actually put in"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <CardTitle className="text-base">Money in and out over time</CardTitle>
          {cashFlow.currencies.length > 1 ? (
            <Select value={active} onValueChange={setCurrency}>
              <SelectTrigger className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cashFlow.currencies.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="h-[340px] w-full">
            <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={40}
                padding={{ left: 24, right: 24 }}
                tickFormatter={(value: number) => formatDate(new Date(value))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={formatAxisNumber}
              />
              <ChartTooltip
                cursor={{ strokeDasharray: 4 }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_label, payload) => {
                      const point = payload[0]?.payload as { t: number } | undefined;
                      return point ? formatDate(new Date(point.t)) : '';
                    }}
                    valueFormatter={(value) =>
                      typeof value === 'number' ? formatDecimal(value) : String(value)
                    }
                  />
                }
              />
              <Line
                dataKey="cumulative"
                type="stepAfter"
                stroke="var(--color-cumulative)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Every transfer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-28">Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Running total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashFlow.events.map((event) => (
                  <TableRow key={event.key}>
                    <TableCell className="tabular whitespace-nowrap">
                      {formatDate(event.date)}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="block truncate">{event.description}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        {event.direction === 'in' ? (
                          <ArrowDownLeft className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        )}
                        {event.direction === 'in' ? 'Deposit' : 'Withdrawal'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <MoneyList amounts={[event.amount]} size="sm" signed className="items-end" />
                    </TableCell>
                    <TableCell>
                      <MoneyList amounts={[event.cumulative]} size="sm" className="items-end" />
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

function countOf(
  entries: readonly { depositCount: number; withdrawalCount: number }[],
  field: 'depositCount' | 'withdrawalCount',
): number {
  return entries.reduce((sum, entry) => sum + entry[field], 0);
}

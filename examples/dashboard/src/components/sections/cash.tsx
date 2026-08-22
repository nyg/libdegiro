import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { dailyBalanceSeries } from '@/lib/analytics';
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
  formatAxisNumber,
  formatDate,
  formatDecimal,
  formatMoney,
  toChartNumber,
} from '@/lib/format';

/** Past this many points, per-point dots read as noise rather than as data. */
const DOT_LIMIT = 40;

export function CashSection() {
  const { result, currencies } = useAnalytics();
  const [currency, setCurrency] = useState(() => currencies[0] ?? 'EUR');
  const active = currencies.includes(currency) ? currency : (currencies[0] ?? 'EUR');

  const series = useMemo(
    () => dailyBalanceSeries(result.movements, active),
    [result.movements, active],
  );

  const data = useMemo(
    () =>
      series.map((point) => ({
        // A numeric time axis, not a category one: a category axis gives a busy
        // trading day the same width as a quiet month.
        t: point.date.getTime(),
        balance: toChartNumber(point.balance),
      })),
    [series],
  );

  // The tooltip names the series, so the currency belongs there rather than
  // repeated on every y tick.
  const config = useMemo(
    () => ({ balance: { label: active, color: 'var(--chart-2)' } }) satisfies ChartConfig,
    [active],
  );

  const closing = series[series.length - 1];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Cash balance over time</CardTitle>
          <CardDescription>
            Each point is the balance at the end of that day. Sweeps to and from the flatexDEGIRO
            cash account cancel out within a timestamp and are shown net.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-end justify-between gap-3 sm:flex-col sm:items-end">
          {closing ? (
            <div className="sm:text-right">
              <div className="font-mono text-lg font-medium tabular-nums">
                {formatMoney(closing.balance)}
              </div>
              <div className="text-muted-foreground text-xs">as of {formatDate(closing.date)}</div>
            </div>
          ) : null}
          {currencies.length > 1 ? (
            <Select value={active} onValueChange={setCurrency}>
              <SelectTrigger className="w-28 shrink-0">
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
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No {active} balances in this statement.
          </p>
        ) : (
          <ChartContainer config={config} className="h-[320px] w-full">
            <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 8 }}>
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
                tickFormatter={(value: number) => formatDate(new Date(value))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={formatAxisNumber}
              />
              <ChartTooltip
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
              <Area
                dataKey="balance"
                type="stepAfter"
                stroke="var(--color-balance)"
                fill="var(--color-balance)"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={data.length <= DOT_LIMIT ? { r: 2 } : false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

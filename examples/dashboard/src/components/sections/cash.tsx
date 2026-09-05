import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { dailyBalanceSeries, totalBalanceSeries } from '@/lib/analytics';
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
import { formatAxisNumber, formatDate, formatDecimal, toChartNumber } from '@/lib/format';

const TOTAL = '__total__';

export function CashSection() {
  const { result, currencies, fx } = useAnalytics();
  const base = fx?.rates && fx.base ? fx.base : null;
  const combinable = base !== null && currencies.length > 1;

  const [selection, setSelection] = useState(() => currencies[0] ?? 'EUR');
  const options = combinable ? [...currencies, TOTAL] : currencies;
  const active = options.includes(selection) ? selection : (currencies[0] ?? 'EUR');
  const total = active === TOTAL;

  const series = useMemo(
    () =>
      total && base && fx?.rates
        ? totalBalanceSeries(result.movements, base, fx.rates)
        : dailyBalanceSeries(result.movements, active),
    [result.movements, active, total, base, fx],
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

  const label = total ? `Total ≈ ${base}` : active;

  // The tooltip names the series, so the currency belongs there rather than
  // repeated on every y tick.
  const config = useMemo(
    () => ({ balance: { label, color: 'var(--chart-2)' } }) satisfies ChartConfig,
    [label],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Cash balance over time</CardTitle>
          <CardDescription>
            Each point is the balance at the end of that day. Sweeps to and from the flatexDEGIRO
            cash account cancel out within a timestamp and are shown net.
            {total ? (
              <>
                {' '}
                Every currency’s standing balance is carried forward and converted into {base} at
                that day’s ECB reference rate, so the line moves with the rate as well as with the
                cash.
              </>
            ) : null}
          </CardDescription>
        </div>
        {options.length > 1 ? (
          <Select value={active} onValueChange={setSelection}>
            <SelectTrigger className="w-32 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
              {combinable ? <SelectItem value={TOTAL}>Total</SelectItem> : null}
            </SelectContent>
          </Select>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No {total ? 'convertible' : active} balances in this statement.
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
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { balanceSeries } from '@/lib/analytics';
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
import { formatDate, toChartNumber } from '@/lib/format';

const config = { balance: { label: 'Balance', color: 'var(--chart-2)' } } satisfies ChartConfig;

export function CashSection() {
  const { result, currencies } = useAnalytics();
  const [currency, setCurrency] = useState(() => currencies[0] ?? 'EUR');
  const active = currencies.includes(currency) ? currency : (currencies[0] ?? 'EUR');

  const data = useMemo(
    () =>
      balanceSeries(result.movements, active).map((point) => ({
        // A numeric time axis, not a category one: a category axis gives a busy
        // trading day the same width as a quiet month.
        t: point.date.getTime(),
        balance: toChartNumber(point.balance),
      })),
    [result.movements, active],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Cash balance over time</CardTitle>
          <CardDescription>
            The trading account only. Transfers to the flatexDEGIRO cash account are a separate
            balance and are excluded.
          </CardDescription>
        </div>
        {currencies.length > 1 ? (
          <Select value={active} onValueChange={setCurrency}>
            <SelectTrigger className="w-32 shrink-0">
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
                width={72}
                tickFormatter={(value: number) => `${Math.round(value)} ${active}`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(_label, payload) => {
                      const point = payload[0]?.payload as { t: number } | undefined;
                      return point ? formatDate(new Date(point.t)) : '';
                    }}
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
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

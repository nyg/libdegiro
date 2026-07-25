import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { Money } from 'libdegiro';
import type { CumulativeFeePoint, FeeGroup, FeeMonthBucket } from '@/lib/analytics';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMonthShort, toChartNumber } from '@/lib/format';

/**
 * Recharts serialises and diffs whatever is in `data`, and `Big` has no
 * `toJSON` (it would stringify as `{s, e, c}`). So every chart takes plain
 * numbers here, and the exact `Money` stays in the analytics layer.
 *
 * Costs are also flipped positive for display: bars that grow downward read as
 * losses rather than as spending. This is the one place that inversion happens.
 */
const asCost = (money: Money): number => -toChartNumber(money);

const feeConfig = {
  brokerage: { label: 'Brokerage', color: 'var(--chart-1)' },
  connectivity: { label: 'Connectivity', color: 'var(--chart-3)' },
} satisfies ChartConfig;

export function FeesByMonthChart({
  buckets,
  currency,
}: {
  buckets: readonly FeeMonthBucket[];
  currency: string;
}) {
  const data = useMemo(
    () =>
      buckets.map((bucket) => ({
        month: formatMonthShort(bucket.start),
        brokerage: asCost(bucket.brokerage),
        connectivity: asCost(bucket.connectivity),
      })),
    [buckets],
  );

  return (
    <ChartContainer config={feeConfig} className="h-[260px] w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => `${value} ${currency}`}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="brokerage"
          stackId="fees"
          fill="var(--color-brokerage)"
          radius={[0, 0, 2, 2]}
        />
        <Bar
          dataKey="connectivity"
          stackId="fees"
          fill="var(--color-connectivity)"
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}

const cumulativeConfig = {
  cumulative: { label: 'Paid to date', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function CumulativeFeesChart({
  points,
  currency,
}: {
  points: readonly CumulativeFeePoint[];
  currency: string;
}) {
  const data = useMemo(
    () =>
      points.map((point) => ({
        month: formatMonthShort(point.date),
        cumulative: asCost(point.cumulative),
      })),
    [points],
  );

  return (
    <ChartContainer config={cumulativeConfig} className="h-[220px] w-full">
      <AreaChart accessibilityLayer data={data} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(value: number) => `${value} ${currency}`}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          dataKey="cumulative"
          type="monotone"
          stroke="var(--color-cumulative)"
          fill="var(--color-cumulative)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const productConfig = {
  total: { label: 'Fees', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function FeesByProductChart({
  groups,
  currency,
  limit = 8,
}: {
  groups: readonly FeeGroup[];
  currency: string;
  limit?: number;
}) {
  const data = useMemo(
    () =>
      groups.slice(0, limit).map((group) => ({
        label: group.label.length > 34 ? `${group.label.slice(0, 33)}…` : group.label,
        total: asCost(group.total),
      })),
    [groups, limit],
  );

  return (
    <ChartContainer config={productConfig} className="h-[280px] w-full">
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => `${value} ${currency}`}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={190}
          tickMargin={4}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={3} />
      </BarChart>
    </ChartContainer>
  );
}

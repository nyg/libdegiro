import type { ReactNode } from 'react';
import type { Money } from 'libdegiro';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MoneyList } from '@/components/money-list';
import { cn } from '@/lib/utils';

/**
 * Most KPIs here are a `Money[]` rather than a single figure, because the
 * library never nets across currencies. Pass `value` instead for the few stats
 * that are counts or dates.
 */
export function StatCard({
  title,
  amounts,
  value,
  hint,
  footer,
  className,
  signed = false,
}: {
  title: string;
  amounts?: readonly Money[];
  value?: ReactNode;
  hint?: string;
  footer?: ReactNode;
  className?: string;
  signed?: boolean;
}) {
  return (
    <Card className={cn('gap-3', className)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value !== undefined ? (
          <span className="tabular text-2xl font-semibold tracking-tight">{value}</span>
        ) : (
          <MoneyList amounts={amounts ?? []} size="lg" signed={signed} />
        )}
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
        {footer}
      </CardContent>
    </Card>
  );
}

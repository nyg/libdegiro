import type { Money } from 'libdegiro';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';

/**
 * Almost every total in this app is a `Money[]`, not a `Money` — the library
 * never nets across currencies and neither does the UI. This renders one line
 * per currency, which is the honest shape.
 */
export function MoneyList({
  amounts,
  className,
  emptyLabel = '—',
  signed = false,
  hideZero = false,
  size = 'base',
}: {
  amounts: readonly Money[];
  className?: string;
  emptyLabel?: string;
  /** Colour negatives red and positives green. Off by default: a fee that is
   *  negative is expected, not a warning. */
  signed?: boolean;
  /**
   * Drop zero totals. DEGIRO books genuine 0.00 rows (two zero interest
   * credits in the sample), and rendering "CHF 0.00 EUR 0.00" in a roll-up
   * says less than a dash does. The rows themselves stay visible in Activity.
   */
  hideZero?: boolean;
  size?: 'base' | 'lg' | 'sm';
}) {
  const visible = hideZero ? amounts.filter((money) => !money.isZero()) : amounts;

  if (visible.length === 0) {
    return <span className={cn('text-muted-foreground tabular', className)}>{emptyLabel}</span>;
  }

  return (
    <div className={cn('tabular flex flex-col gap-0.5', className)}>
      {visible.map((money) => (
        <span
          key={money.currency}
          className={cn(
            size === 'lg' && 'text-2xl font-semibold tracking-tight',
            size === 'sm' && 'text-sm',
            signed && money.isNegative() && 'text-destructive',
            signed && money.isPositive() && 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {formatMoney(money)}
        </span>
      ))}
    </div>
  );
}

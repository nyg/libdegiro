import { useAnalytics } from '@/state/statement-context';
import { StatCard } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { formatDate } from '@/lib/format';

export function OverviewSection() {
  const { portfolio, feeTotals, range, result } = useAnalytics();
  const openPositions = portfolio.positions.filter((position) => position.quantity !== 0);

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Info className="size-4" aria-hidden />
        <AlertDescription>
          An account statement records cash movements, not market prices — so this dashboard can
          show what you paid and received, but never what your holdings are worth today. There is no
          unrealised profit or loss anywhere in it.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Cash balance"
          amounts={portfolio.cashByCurrency}
          hint="Latest per currency"
        />
        <StatCard title="Deposited" amounts={portfolio.deposits} hint="External transfers in" />
        <StatCard
          title="Dividends"
          amounts={portfolio.dividends}
          hint={`${portfolio.dividendTax.length > 0 ? 'Before' : 'No'} withholding tax`}
        />
        <StatCard
          title="Fees paid"
          amounts={feeTotals.all}
          hint={`${feeTotals.count.brokerage + feeTotals.count.connectivity} charges`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Interest" amounts={portfolio.interest} hint="Credited by flatexDEGIRO" />
        <StatCard
          title="Withholding tax"
          amounts={portfolio.dividendTax}
          hint="Deducted at source"
        />
        <StatCard
          title="Open positions"
          value={openPositions.length}
          hint={`${portfolio.positions.length} instruments traded in total`}
        />
        <StatCard
          title="Statement period"
          value={
            range ? (
              <span className="text-base font-medium">
                {formatDate(range.from)} → {formatDate(range.to)}
              </span>
            ) : (
              '—'
            )
          }
          hint={`${result.records.length} rows, ${result.transactions.length} transactions`}
        />
      </div>
    </div>
  );
}

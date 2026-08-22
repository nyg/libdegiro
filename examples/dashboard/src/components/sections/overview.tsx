import { useAnalytics } from '@/state/statement-context';
import { StatCard } from '@/components/stat-card';
import { formatDate } from '@/lib/format';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function OverviewSection() {
  const { portfolio, feeTotals, range, result } = useAnalytics();
  const openPositions = portfolio.positions.filter((position) => position.quantity !== 0);
  const invested = portfolio.invested.filter((amount) => !amount.isZero());

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Deposited"
          amounts={portfolio.netExternalFlow}
          hint="Transfers in, less transfers out"
        />
        <StatCard
          title="Positions"
          amounts={invested}
          hint={`${plural(openPositions.length, 'position')} held, ${plural(portfolio.positions.length, 'instrument')} traded`}
        />
        <StatCard
          title="Cash balance"
          amounts={portfolio.cashByCurrency}
          hideZero
          hint="Latest per currency"
        />
        <StatCard
          title="Dividends"
          amounts={portfolio.dividends}
          hint={`${portfolio.dividendTax.length > 0 ? 'Before' : 'No'} withholding tax`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Fees paid"
          amounts={feeTotals.all}
          hint={`${feeTotals.count.brokerage + feeTotals.count.connectivity} charges`}
        />
        <StatCard
          title="Interest"
          amounts={portfolio.interest}
          hideZero
          hint="Credited by flatexDEGIRO"
        />
        <StatCard
          title="Withholding tax"
          amounts={portfolio.dividendTax}
          hideZero
          hint="Deducted at source"
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

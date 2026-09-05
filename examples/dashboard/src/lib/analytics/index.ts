import {
  summarizePortfolio,
  type ParseResult,
  type PortfolioOptions,
  type PortfolioSummary,
} from 'libdegiro';
import { collectFees, totalFees, type FeeCollection, type FeeTotals } from './fees';
import { explainFees, type FeeContext } from './explain';
import {
  dividendsByInstrument,
  incomeByYear,
  type DividendGroup,
  type YearlyIncome,
} from './income';
import { balanceCurrencies, statementRange, type DateRange } from './timeseries';
import { buildCashFlow, type CashFlowReport } from './cashflow';
import { buildHealthReport, type HealthReport } from './health';
import { buildPositionRows, type PositionRows } from './positions';

export * from './cashflow';
export * from './exchange';
export * from './fees';
export * from './summary';
export * from './explain';
export * from './income';
export * from './timeseries';
export * from './health';
export * from './positions';

/**
 * Everything the dashboard derives from one parsed statement.
 *
 * Computed once per file and memoised on the `ParseResult` identity, so that
 * typing in a filter never recomputes fee aggregates. Anything that depends on
 * a user choice (the selected currency, a search query) is deliberately *not*
 * here — those stay as functions the components call with their own arguments.
 */
export interface Analytics {
  readonly result: ParseResult;
  readonly portfolio: PortfolioSummary;
  readonly positions: PositionRows;
  readonly fees: FeeCollection;
  readonly feeTotals: FeeTotals;
  readonly feeContexts: readonly FeeContext[];
  readonly cashFlow: CashFlowReport;
  readonly dividends: readonly DividendGroup[];
  readonly income: readonly YearlyIncome[];
  readonly health: HealthReport;
  /** Currencies that have a cash balance series, sorted. */
  readonly currencies: readonly string[];
  readonly range: DateRange | null;
  readonly fx: PortfolioOptions | null;
}

export function buildAnalytics(result: ParseResult, fx?: PortfolioOptions | null): Analytics {
  const fees = collectFees(result.movements);
  const unparseableExchanges = fees.entries.filter(
    (entry) => entry.category === 'connectivity' && entry.exchange === null,
  ).length;

  const portfolio = summarizePortfolio(result.movements, fx ?? undefined);

  return {
    result,
    portfolio,
    positions: buildPositionRows(portfolio, fees.entries, fx),
    fees,
    feeTotals: totalFees(fees.entries),
    feeContexts: explainFees(result),
    cashFlow: buildCashFlow(result.movements),
    dividends: dividendsByInstrument(result.movements),
    income: incomeByYear(result.movements),
    health: buildHealthReport(result, unparseableExchanges),
    currencies: balanceCurrencies(result.movements),
    range: statementRange(result.movements),
    fx: fx ?? null,
  };
}

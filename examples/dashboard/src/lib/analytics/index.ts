import { summarizePortfolio, type ParseResult, type PortfolioSummary } from 'libdegiro';
import { collectFees, totalFees, type FeeCollection, type FeeTotals } from './fees';
import { explainFees, type FeeContext } from './explain';
import {
  dividendsByInstrument,
  incomeByYear,
  type DividendGroup,
  type YearlyIncome,
} from './income';
import { balanceCurrencies, statementRange, type DateRange } from './timeseries';
import { buildHealthReport, type HealthReport } from './health';

export * from './exchange';
export * from './fees';
export * from './summary';
export * from './explain';
export * from './income';
export * from './timeseries';
export * from './health';

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
  readonly fees: FeeCollection;
  readonly feeTotals: FeeTotals;
  readonly feeContexts: readonly FeeContext[];
  readonly dividends: readonly DividendGroup[];
  readonly income: readonly YearlyIncome[];
  readonly health: HealthReport;
  /** Currencies that have a cash balance series, sorted. */
  readonly currencies: readonly string[];
  readonly range: DateRange | null;
}

export function buildAnalytics(result: ParseResult): Analytics {
  const fees = collectFees(result.movements);
  const unparseableExchanges = fees.entries.filter(
    (entry) => entry.category === 'connectivity' && entry.exchange === null,
  ).length;

  return {
    result,
    portfolio: summarizePortfolio(result.movements),
    fees,
    feeTotals: totalFees(fees.entries),
    feeContexts: explainFees(result),
    dividends: dividendsByInstrument(result.movements),
    income: incomeByYear(result.movements),
    health: buildHealthReport(result, unparseableExchanges),
    currencies: balanceCurrencies(result.movements),
    range: statementRange(result.movements),
  };
}

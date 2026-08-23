import {
  reconcileBalances,
  type BalanceDiscrepancy,
  type Movement,
  type ParseIssue,
  type ParseResult,
  type ReconciliationReport,
} from 'libdegiro';
import { formatDate } from '@/lib/format';
import { statementRange, type DateRange } from './timeseries';

export interface UnknownDescription {
  readonly description: string;
  readonly count: number;
  readonly firstLine: number | null;
}

export interface HealthReport {
  readonly rows: number;
  readonly errors: readonly ParseIssue[];
  readonly warnings: readonly ParseIssue[];
  readonly unknown: readonly Movement[];
  /** Distinct descriptions no matcher recognised, most frequent first. */
  readonly unknownDescriptions: readonly UnknownDescription[];
  /** Fee rows whose description had no parseable venue. */
  readonly unparseableExchanges: number;
  readonly reconciliation: ReconciliationReport;
  readonly range: DateRange | null;
  /** `true` when the header matched no language and the layout fallback read the file. */
  readonly heuristicDialect: boolean;
  readonly ok: boolean;
}

export function buildHealthReport(result: ParseResult, unparseableExchanges: number): HealthReport {
  const unknown = result.movements.filter((m) => m.kind === 'unknown');

  const byDescription = new Map<string, UnknownDescription>();
  for (const movement of unknown) {
    const { description, line } = movement.record;
    const existing = byDescription.get(description);
    byDescription.set(description, {
      description,
      count: (existing?.count ?? 0) + 1,
      firstLine: existing?.firstLine ?? line ?? null,
    });
  }

  const reconciliation = reconcileBalances(result.movements);

  return {
    rows: result.records.length,
    errors: result.errors,
    warnings: result.warnings,
    unknown,
    unknownDescriptions: [...byDescription.values()].sort((a, b) => b.count - a.count),
    unparseableExchanges,
    reconciliation,
    range: statementRange(result.movements),
    heuristicDialect: result.dialect.heuristic === true,
    ok:
      result.errors.length === 0 &&
      unknown.length === 0 &&
      reconciliation.ok &&
      unparseableExchanges === 0,
  };
}

export const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * Why `ok` is false, in the user's terms.
 *
 * `ok` folds together four independent checks, and the counts the panel shows
 * only mention two of them — so a statement that reconciles badly, or whose
 * connectivity fees name an unparseable venue, reads as "0 errors, 0 warnings"
 * next to a warning banner. This is the missing half of that sentence.
 */
export function describeHealthProblems(report: HealthReport): string[] {
  const problems: string[] = [];

  if (report.errors.length > 0) {
    problems.push(`${plural(report.errors.length, 'row')} failed to parse.`);
  }
  if (report.unknown.length > 0) {
    problems.push(
      `${plural(report.unknown.length, 'row')} carry a description no classifier recognises — see the table below.`,
    );
  }
  const unexplained = report.reconciliation.unexplained.length;
  if (unexplained > 0) {
    problems.push(
      `${plural(unexplained, 'balance transition')} ${unexplained === 1 ? 'does' : 'do'} not match the balance the statement itself reports, by more than rounding can explain — see the table below.`,
    );
  }
  if (report.unparseableExchanges > 0) {
    const one = report.unparseableExchanges === 1;
    problems.push(
      `${plural(report.unparseableExchanges, 'exchange connectivity fee')} name a venue this dashboard could not parse, so ${one ? 'it is' : 'they are'} missing from the per-exchange breakdown under Fees. Fee totals are unaffected.`,
    );
  }

  return problems;
}

/**
 * Things worth saying that are nonetheless not faults.
 *
 * A half-centime rounding gap is the statement disagreeing with itself, not the
 * parser getting anything wrong. Reporting it as a failure trains people to
 * ignore the panel; hiding it entirely leaves a real number unexplained.
 */
export function describeHealthNotes(report: HealthReport): string[] {
  const notes: string[] = [];

  if (report.heuristicDialect) {
    notes.push(
      'No dialect recognised this header, so the file was read by its column layout alone and its dates and amounts were interpreted by guesswork. Dates, amounts and balances above are worth a spot-check against the statement.',
    );
  }

  const rounding = report.reconciliation.rounding.length;
  if (rounding > 0) {
    notes.push(
      `${plural(rounding, 'balance transition')} ${rounding === 1 ? 'is' : 'are'} off by less than one centime. DEGIRO rounds a half-unit price down in its amount column and up in its balance column, so the statement disagrees with itself. Nothing here is a parsing error.`,
    );
  }

  return notes;
}

/** The one-sentence reading of a discrepancy: what it means and what to do. */
export function explainDiscrepancy(entry: BalanceDiscrepancy): string {
  if (entry.kind === 'rounding') {
    if (entry.exactAmount && !entry.exactAmount.amount.eq(entry.statedMutation.amount)) {
      return `The row's own quantity × unit price is exactly ${entry.exactAmount.toString()}. The statement rounded that to ${entry.statedMutation.toString()} in its amount column but moved the balance by ${entry.appliedMutation.toString()}. Both columns come from the statement; neither is libdegiro's.`;
    }
    return `The statement's amount and balance columns disagree by ${entry.difference.abs().toString()}, less than one centime. Nothing was parsed wrongly.`;
  }
  return `libdegiro replayed ${entry.statedMutation.toString()} onto this balance but the statement moved it by ${entry.appliedMutation.toString()}. Either this row was classified wrongly, or a row that moves this balance is missing from the replay.`;
}

const pad = (label: string): string => label.padEnd(18);

function discrepancyBlock(entry: BalanceDiscrepancy, index: number): string[] {
  const lines = [
    `  ${index + 1}. ${entry.currency} line ${entry.line ?? '?'} — ${entry.kind}`,
    `     ${pad('classified as')}${entry.movementKind}`,
    `     ${pad('description')}${entry.description}`,
    `     ${pad('previous row')}line ${entry.previousLine ?? '?'}, balance ${entry.previousBalance.toString()}`,
    `     ${pad('amount column')}${entry.statedMutation.toString()}`,
    `     ${pad('balance moved by')}${entry.appliedMutation.toString()}`,
  ];
  if (entry.exactAmount) {
    lines.push(`     ${pad('quantity × price')}${entry.exactAmount.toString()}`);
  }
  lines.push(
    `     ${pad('expected balance')}${entry.expected.toString()}`,
    `     ${pad('reported balance')}${entry.actual.toString()}`,
    `     ${pad('difference')}${entry.difference.toString()}`,
    `     ${pad('reading')}${explainDiscrepancy(entry)}`,
  );
  return lines;
}

/**
 * A diagnostics blob a user can paste into a bug report for the library.
 *
 * Two audiences, two privacy levels. The summary is counts and description text
 * only — enough to write a new matcher, and nothing that is anybody's holdings.
 * The discrepancy blocks below it do carry amounts, ISINs and product names,
 * because a balance that does not reconcile *is* the arithmetic: a report
 * saying "one transition is off" cannot be acted on by anyone. The panel says
 * so before the copy button, so the choice stays the user's.
 */
export function diagnosticsText(report: HealthReport, dialectId: string): string {
  const { reconciliation } = report;
  const lines = [
    'libdegiro diagnostics — DEGIRO statement dashboard',
    '',
    `${pad('dialect')}${dialectId}`,
    `${pad('rows')}${report.rows}`,
    `${pad('period')}${report.range ? `${formatDate(report.range.from)} → ${formatDate(report.range.to)}` : 'unknown'}`,
    `${pad('parse errors')}${report.errors.length}`,
    `${pad('parse warnings')}${report.warnings.length}`,
    `${pad('unclassified')}${report.unknown.length}`,
    `${pad('unparsed venues')}${report.unparseableExchanges}`,
    `${pad('balances')}${reconciliation.exact ? 'reconcile exactly' : `${reconciliation.rounding.length} rounding, ${reconciliation.unexplained.length} unexplained`}`,
    '',
    'per currency',
  ];

  for (const entry of reconciliation.byCurrency) {
    const rounding = entry.discrepancies.filter((d) => d.kind === 'rounding').length;
    const unexplained = entry.discrepancies.length - rounding;
    const verdict =
      entry.discrepancies.length === 0
        ? 'clean'
        : `${rounding} rounding, ${unexplained} unexplained`;
    lines.push(
      `  ${entry.currency}  ${entry.checked} transitions, ${entry.openingBalance.toString()} → ${entry.closingBalance.toString()}, ${verdict}`,
    );
  }

  if (reconciliation.discrepancies.length > 0) {
    lines.push(
      '',
      `balance discrepancies (${reconciliation.discrepancies.length})`,
      '  Amounts, ISINs and product names appear here because the arithmetic is',
      '  the bug report. Everything above this line is counts only.',
      '',
    );
    reconciliation.discrepancies.forEach((entry, index) => {
      lines.push(...discrepancyBlock(entry, index), '');
    });
  }

  if (report.unknownDescriptions.length > 0) {
    lines.push('', `unrecognised descriptions (${report.unknownDescriptions.length})`);
    for (const entry of report.unknownDescriptions) {
      lines.push(`  ${entry.count}x  line ${entry.firstLine ?? '?'}  ${entry.description}`);
    }
  }

  return lines.join('\n');
}

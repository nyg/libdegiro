import {
  reconcileBalances,
  type Movement,
  type ParseIssue,
  type ParseResult,
  type ReconciliationReport,
} from 'libdegiro';

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
    ok:
      result.errors.length === 0 &&
      unknown.length === 0 &&
      reconciliation.ok &&
      unparseableExchanges === 0,
  };
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

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
  if (!report.reconciliation.ok) {
    const count = report.reconciliation.discrepancies.length;
    problems.push(
      `${plural(count, 'balance transition')} ${count === 1 ? 'does' : 'do'} not match the balance the statement itself reports — see the table below.`,
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
 * A diagnostics blob a user can paste into a bug report for the library.
 *
 * Deliberately carries counts and *descriptions* only — never amounts, ISINs,
 * product names or dates. Unrecognised description text is what a new matcher
 * needs; everything else would be someone's portfolio.
 */
export function diagnosticsText(report: HealthReport, dialectId: string): string {
  const lines = [
    `libdegiro diagnostics`,
    `dialect: ${dialectId}`,
    `rows: ${report.rows}`,
    `errors: ${report.errors.length}, warnings: ${report.warnings.length}`,
    `unclassified rows: ${report.unknown.length}`,
    `balances reconcile: ${report.reconciliation.ok ? 'yes' : 'no'}`,
  ];

  if (report.reconciliation.discrepancies.length > 0) {
    lines.push(`discrepancies: ${report.reconciliation.discrepancies.length}`);
  }
  if (report.unknownDescriptions.length > 0) {
    lines.push('', 'unrecognised descriptions:');
    for (const entry of report.unknownDescriptions) {
      lines.push(`  ${entry.count}x ${entry.description}`);
    }
  }

  return lines.join('\n');
}

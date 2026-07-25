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

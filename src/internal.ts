import { DialectRegistry, defaultDialects } from './dialects/registry';
import type { Dialect } from './dialects/types';
import type { RawRecord } from './records/rawRecord';
import { defaultClassifier, type ClassifierRegistry } from './classify/registry';
import { defaultGroupingStrategies, groupMovements } from './group/grouper';
import type { GroupingStrategy } from './group/grouper';
import type { Transaction } from './group/transaction';
import type { Movement } from './classify/types';
import type { ParseIssue } from './errors';

/** Options shared by every parsing entry point. */
export interface ParseOptions {
  /**
   * Force a specific dialect, skipping header detection. Useful when a custom
   * export omits or alters the header.
   */
  readonly dialect?: Dialect;
  /**
   * Dialects used for header detection. Accepts a {@link DialectRegistry} or a
   * plain array. Defaults to the built-in dialects.
   */
  readonly dialects?: DialectRegistry | readonly Dialect[];
  /** Classifier registry. Defaults to the built-in matchers. */
  readonly classifier?: ClassifierRegistry;
  /** Grouping strategy pipeline. Defaults to the built-in strategies. */
  readonly groupingStrategies?: readonly GroupingStrategy[];
  /** CSV field delimiter. Defaults to `,`. */
  readonly delimiter?: string;
}

/** The full result of parsing a DEGIRO export. */
export interface ParseResult {
  /** The dialect used to interpret the file. */
  readonly dialect: Dialect;
  /** Normalised rows, in file order (newest first). */
  readonly records: readonly RawRecord[];
  /** Classified movements, one per record, in file order. */
  readonly movements: readonly Movement[];
  /** Composite transactions, sorted by booking date (newest first). */
  readonly transactions: readonly Transaction[];
  /** All collected issues (errors + warnings). */
  readonly issues: readonly ParseIssue[];
  /** Issues with severity `error`. */
  readonly errors: readonly ParseIssue[];
  /** Issues with severity `warning`. */
  readonly warnings: readonly ParseIssue[];
}

/** Resolve the dialects option into a {@link DialectRegistry}. */
export function resolveDialectRegistry(dialects: ParseOptions['dialects']): DialectRegistry {
  if (dialects === undefined) return defaultDialects;
  if (dialects instanceof DialectRegistry) return dialects;
  return new DialectRegistry(dialects);
}

/** Classify + group already-mapped records into a {@link ParseResult}. */
export function assembleResult(input: {
  readonly dialect: Dialect;
  readonly records: readonly RawRecord[];
  readonly issues: readonly ParseIssue[];
  readonly classifier?: ClassifierRegistry;
  readonly strategies?: readonly GroupingStrategy[];
}): ParseResult {
  const classifier = input.classifier ?? defaultClassifier;
  const strategies = input.strategies ?? defaultGroupingStrategies;
  const records = [...input.records];
  const movements = records.map((record) => classifier.classify(record, input.dialect));
  const transactions = groupMovements(movements, strategies);
  return {
    dialect: input.dialect,
    records,
    movements,
    transactions,
    issues: input.issues,
    errors: input.issues.filter((issue) => issue.severity === 'error'),
    warnings: input.issues.filter((issue) => issue.severity === 'warning'),
  };
}

/**
 * Error and issue model for libdegiro.
 *
 * The parser is *lenient*: per-row problems are collected as {@link ParseIssue}
 * values on the result instead of throwing. Only truly fatal conditions (for
 * example, a file whose format matches no known dialect) throw.
 */

/** Pipeline stage that produced an issue. */
export type ParseStage = 'tokenize' | 'map' | 'classify' | 'group' | 'validate';

/** Severity of a collected issue. */
export type IssueSeverity = 'error' | 'warning';

/**
 * A non-fatal problem encountered while parsing a single row or group.
 * Collected on {@link ParseResult.errors} / `warnings` rather than thrown.
 */
export interface ParseIssue {
  readonly severity: IssueSeverity;
  readonly stage: ParseStage;
  readonly message: string;
  /** 1-based line number in the source CSV (including the header), if known. */
  readonly line?: number;
  /** Raw cells of the offending row, if available. */
  readonly raw?: readonly string[];
  /** Underlying error or value that caused this issue, if any. */
  readonly cause?: unknown;
}

/** Options accepted by every libdegiro error. */
export interface DegiroErrorOptions {
  readonly cause?: unknown;
}

/** Base class for all errors thrown by libdegiro. */
export class DegiroError extends Error {
  constructor(message: string, options?: DegiroErrorOptions) {
    super(message);
    this.name = 'DegiroError';
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Thrown when no registered dialect recognises the CSV header. */
export class UnknownDialectError extends DegiroError {
  constructor(
    public readonly header: readonly string[],
    options?: DegiroErrorOptions,
  ) {
    super(`No registered dialect recognised the CSV header: [${header.join(', ')}]`, options);
    this.name = 'UnknownDialectError';
  }
}

/** Thrown when arithmetic is attempted across two different currencies. */
export class CurrencyMismatchError extends DegiroError {
  constructor(
    public readonly expected: string,
    public readonly actual: string,
    options?: DegiroErrorOptions,
  ) {
    super(`Currency mismatch: expected "${expected}" but got "${actual}"`, options);
    this.name = 'CurrencyMismatchError';
  }
}

/** Convenience builder for a {@link ParseIssue}. */
export function createIssue(
  severity: IssueSeverity,
  stage: ParseStage,
  message: string,
  details: Omit<ParseIssue, 'severity' | 'stage' | 'message'> = {},
): ParseIssue {
  return { severity, stage, message, ...details };
}

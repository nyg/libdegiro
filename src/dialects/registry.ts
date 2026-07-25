import type { CsvRow } from '../csv/tokenizer';
import { UnknownDialectError } from '../errors';
import type { Dialect } from './types';
import { frenchDialect } from './fr';

/** Options for registering a dialect. */
export interface RegisterDialectOptions {
  /** Insert at the front so it is matched before existing dialects. */
  readonly prepend?: boolean;
}

/**
 * An ordered collection of {@link Dialect}s used to recognise an export's format.
 *
 * Register custom dialects to support other languages or layouts. Detection
 * returns the first dialect whose {@link Dialect.matches} accepts the header.
 */
export class DialectRegistry {
  private readonly dialects: Dialect[] = [];

  constructor(initial: readonly Dialect[] = []) {
    this.dialects.push(...initial);
  }

  /** Register a dialect. By default it is appended (lowest precedence). */
  register(dialect: Dialect, options: RegisterDialectOptions = {}): this {
    if (options.prepend) {
      this.dialects.unshift(dialect);
    } else {
      this.dialects.push(dialect);
    }
    return this;
  }

  /** All registered dialects, in matching order. */
  all(): readonly Dialect[] {
    return [...this.dialects];
  }

  /** Detect the dialect for a header row, or `undefined` if none matches. */
  find(header: CsvRow): Dialect | undefined {
    return this.dialects.find((dialect) => dialect.matches(header));
  }

  /**
   * Detect the dialect for a header row.
   * @throws {UnknownDialectError} when no registered dialect matches.
   */
  detect(header: CsvRow): Dialect {
    const dialect = this.find(header);
    if (!dialect) {
      throw new UnknownDialectError(header);
    }
    return dialect;
  }

  /** A shallow copy of this registry, useful for per-call customisation. */
  clone(): DialectRegistry {
    return new DialectRegistry(this.dialects);
  }
}

/** Registry pre-populated with all built-in dialects. */
export function createDefaultDialectRegistry(): DialectRegistry {
  return new DialectRegistry([frenchDialect]);
}

/** Shared registry containing the built-in dialects. */
export const defaultDialects = createDefaultDialectRegistry();

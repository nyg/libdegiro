import type { RawRecord } from '../records/rawRecord';
import type { Dialect } from '../dialects/types';
import type { Matcher, Movement } from './types';
import { tradeMatcher } from './matchers/trade';
import { fxTradeMatcher, fxConversionMatcher } from './matchers/fx';
import { dividendMatcher, dividendTaxMatcher, capitalReturnMatcher } from './matchers/dividend';
import { brokerageFeeMatcher, connectivityFeeMatcher } from './matchers/fees';
import { interestMatcher } from './matchers/interest';
import { cashSweepMatcher, depositMatcher, cashTransferMatcher } from './matchers/cash';

/** Options for registering a matcher. */
export interface RegisterMatcherOptions {
  /** Insert before existing matchers of equal priority. */
  readonly prepend?: boolean;
}

/**
 * An ordered collection of {@link Matcher}s. Matchers are evaluated by
 * descending priority (then registration order); the first to return a
 * {@link Movement} wins. Records that match nothing classify as `unknown`.
 */
export class ClassifierRegistry {
  private readonly matchers: Matcher[] = [];

  constructor(initial: readonly Matcher[] = []) {
    this.matchers.push(...initial);
    this.sort();
  }

  /** Register a matcher. */
  register(matcher: Matcher, options: RegisterMatcherOptions = {}): this {
    if (options.prepend) {
      this.matchers.unshift(matcher);
    } else {
      this.matchers.push(matcher);
    }
    this.sort();
    return this;
  }

  /** All registered matchers, in evaluation order. */
  all(): readonly Matcher[] {
    return [...this.matchers];
  }

  /** Classify a single record, falling back to an `unknown` movement. */
  classify(record: RawRecord, dialect: Dialect): Movement {
    const ctx = { record, dialect };
    for (const matcher of this.matchers) {
      const movement = matcher.match(ctx);
      if (movement) return movement;
    }
    return { kind: 'unknown', amount: record.mutation, record };
  }

  /** A shallow copy of this registry, useful for per-call customisation. */
  clone(): ClassifierRegistry {
    return new ClassifierRegistry(this.matchers);
  }

  private sort(): void {
    // Stable sort by descending priority (Array.prototype.sort is stable).
    this.matchers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }
}

/** The built-in matchers, in their default registration order. */
export const defaultMatchers: readonly Matcher[] = [
  fxTradeMatcher,
  tradeMatcher,
  fxConversionMatcher,
  dividendTaxMatcher,
  dividendMatcher,
  capitalReturnMatcher,
  brokerageFeeMatcher,
  connectivityFeeMatcher,
  interestMatcher,
  depositMatcher,
  cashSweepMatcher,
  cashTransferMatcher,
];

/** Create a registry pre-populated with all built-in matchers. */
export function createDefaultClassifierRegistry(): ClassifierRegistry {
  return new ClassifierRegistry(defaultMatchers);
}

/** Shared registry containing the built-in matchers. */
export const defaultClassifier = createDefaultClassifierRegistry();

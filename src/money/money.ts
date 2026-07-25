import Big from 'big.js';
import { CurrencyMismatchError } from '../errors';

/** Anything that can be turned into a {@link Money} amount. */
export type MoneyInput = number | string | Big;

/** Plain serialisable representation of a {@link Money} value. */
export interface MoneyJSON {
  readonly amount: string;
  readonly currency: string;
}

/**
 * Immutable monetary value backed by {@link Big} for exact decimal arithmetic.
 *
 * All operations return new instances; arithmetic across differing currencies
 * throws {@link CurrencyMismatchError}.
 */
export class Money {
  /** Exact decimal amount. */
  readonly amount: Big;
  /** ISO-like currency code as found in the statement (e.g. `EUR`, `CHF`, `USD`). */
  readonly currency: string;

  constructor(amount: MoneyInput, currency: string) {
    this.amount = amount instanceof Big ? amount : new Big(amount);
    this.currency = currency;
  }

  /** Construct a {@link Money} value. */
  static of(amount: MoneyInput, currency: string): Money {
    return new Money(amount, currency);
  }

  /** A zero amount in the given currency. */
  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  /** Multiply by a scalar (e.g. quantity). */
  times(factor: MoneyInput): Money {
    return new Money(this.amount.times(factor), this.currency);
  }

  negate(): Money {
    return new Money(this.amount.times(-1), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  isZero(): boolean {
    return this.amount.eq(0);
  }

  isPositive(): boolean {
    return this.amount.gt(0);
  }

  isNegative(): boolean {
    return this.amount.lt(0);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.gt(other.amount);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lt(other.amount);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.eq(other.amount);
  }

  /** Lossy conversion to a JS number. Prefer {@link Money.amount} for exactness. */
  toNumber(): number {
    return this.amount.toNumber();
  }

  toString(): string {
    return `${this.amount.toString()} ${this.currency}`;
  }

  toJSON(): MoneyJSON {
    return { amount: this.amount.toString(), currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

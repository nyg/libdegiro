import type { CsvRow } from '../csv/tokenizer';
import type { ColumnMap } from './types';

export const DEGIRO_COLUMNS: ColumnMap = {
  date: 0,
  time: 1,
  valueDate: 2,
  product: 3,
  isin: 4,
  description: 5,
  fx: 6,
  mutationCurrency: 7,
  mutationAmount: 8,
  balanceCurrency: 9,
  balanceAmount: 10,
  orderId: 11,
};

export const SPACE_SEPARATORS = /[\s\u00a0\u202f]/g;

const DMY_DASH = /^(\d{2})-(\d{2})-(\d{4})$/;
const DMY_SLASH = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM = /^(\d{1,2}):(\d{2})$/;

export function hasHeaderTokens(header: CsvRow, tokens: readonly string[]): boolean {
  const cells = header.map((cell) => cell.trim());
  return tokens.every((token) => cells.includes(token));
}

function atUtc(year: string, month: string, day: string, time: string): Date | null {
  const timeMatch = HM.exec(time.trim());
  if (!timeMatch) return null;
  const [, hh, min] = timeMatch;

  const result = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hh), Number(min)),
  );
  if (
    result.getUTCDate() !== Number(day) ||
    result.getUTCMonth() !== Number(month) - 1 ||
    result.getUTCFullYear() !== Number(year)
  ) {
    return null;
  }
  return result;
}

export function parseDegiroDateTime(date: string, time = '00:00'): Date | null {
  const match = DMY_DASH.exec(date.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return atUtc(yyyy!, mm!, dd!, time);
}

export function parseFlexibleDateTime(date: string, time = '00:00'): Date | null {
  const trimmed = date.trim();

  const iso = ISO_DATE.exec(trimmed);
  if (iso) return atUtc(iso[1]!, iso[2]!, iso[3]!, time);

  const slashed = DMY_SLASH.exec(trimmed);
  if (slashed) return atUtc(slashed[3]!, slashed[2]!, slashed[1]!, time);

  return parseDegiroDateTime(trimmed, time);
}

export function parseFlexibleDecimal(raw: string): string | null {
  const trimmed = raw.trim().replace(SPACE_SEPARATORS, '');
  if (trimmed === '') return null;

  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const grouping = lastComma > lastDot ? '.' : ',';
    normalized = trimmed.split(grouping).join('').replace(',', '.');
  } else {
    const parts = trimmed.split(lastComma >= 0 ? ',' : '.');
    const grouped = parts.length > 2 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
    normalized = grouped ? parts.join('') : parts.join('.');
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

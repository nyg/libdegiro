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

const DMY = /^(\d{2})-(\d{2})-(\d{4})$/;
const HM = /^(\d{1,2}):(\d{2})$/;

export function hasHeaderTokens(header: CsvRow, tokens: readonly string[]): boolean {
  const cells = header.map((cell) => cell.trim());
  return tokens.every((token) => cells.includes(token));
}

export function parseDegiroDateTime(date: string, time = '00:00'): Date | null {
  const dateMatch = DMY.exec(date.trim());
  if (!dateMatch) return null;
  const timeMatch = HM.exec(time.trim());
  if (!timeMatch) return null;

  const [, dd, mm, yyyy] = dateMatch;
  const [, hh, min] = timeMatch;
  const ms = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
  const result = new Date(ms);
  if (
    result.getUTCDate() !== Number(dd) ||
    result.getUTCMonth() !== Number(mm) - 1 ||
    result.getUTCFullYear() !== Number(yyyy)
  ) {
    return null;
  }
  return result;
}

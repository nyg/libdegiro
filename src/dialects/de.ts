import type { CsvRow } from '../csv/tokenizer'
import {
   DEGIRO_COLUMNS,
   hasHeaderTokens,
   parseDegiroDateTime,
   parseFlexibleDecimal,
} from './common'
import type { Dialect } from './types'

const GERMAN_HEADER_TOKENS = [
   'Datum',
   'Uhrzeit',
   'Produkt',
   'ISIN',
   'Beschreibung',
   'Änderung',
   'Saldo',
] as const

export const germanDialect: Dialect = {
   id: 'de',
   label: 'DEGIRO German (Account.csv)',
   columns: DEGIRO_COLUMNS,
   matches(header: CsvRow): boolean {
      return hasHeaderTokens(header, GERMAN_HEADER_TOKENS)
   },
   parseDecimal: parseFlexibleDecimal,
   parseDateTime: parseDegiroDateTime,
   parseDate(date: string): Date | null {
      return parseDegiroDateTime(date)
   },
}

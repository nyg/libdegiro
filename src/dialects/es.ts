import type { CsvRow } from '../csv/tokenizer'
import {
   DEGIRO_COLUMNS,
   hasHeaderTokens,
   parseDegiroDateTime,
   parseFlexibleDecimal,
} from './common'
import type { Dialect } from './types'

const SPANISH_HEADER_TOKENS = [
   'Fecha',
   'Hora',
   'Producto',
   'ISIN',
   'Descripción',
   'Variación',
   'Saldo',
] as const

export const spanishDialect: Dialect = {
   id: 'es',
   label: 'DEGIRO Spanish (Account.csv)',
   columns: DEGIRO_COLUMNS,
   matches(header: CsvRow): boolean {
      return hasHeaderTokens(header, SPANISH_HEADER_TOKENS)
   },
   parseDecimal: parseFlexibleDecimal,
   parseDateTime: parseDegiroDateTime,
   parseDate(date: string): Date | null {
      return parseDegiroDateTime(date)
   },
}

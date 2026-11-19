import type { CsvRow } from '../csv/tokenizer'
import {
   DEGIRO_COLUMNS,
   hasHeaderTokens,
   parseDegiroDateTime,
   parseFlexibleDecimal,
} from './common'
import type { Dialect } from './types'

const DUTCH_HEADER_TOKENS = ['Datum', 'Tijd', 'Product', 'ISIN', 'Mutatie', 'Saldo'] as const
const DUTCH_DESCRIPTION_LABELS = ['Omschrijving', 'Beschrijving'] as const

export const dutchDialect: Dialect = {
   id: 'nl',
   label: 'DEGIRO Dutch (Account.csv)',
   columns: DEGIRO_COLUMNS,
   matches(header: CsvRow): boolean {
      return (
         hasHeaderTokens(header, DUTCH_HEADER_TOKENS) &&
         DUTCH_DESCRIPTION_LABELS.some((label) => hasHeaderTokens(header, [label]))
      )
   },
   parseDecimal: parseFlexibleDecimal,
   parseDateTime: parseDegiroDateTime,
   parseDate(date: string): Date | null {
      return parseDegiroDateTime(date)
   },
}

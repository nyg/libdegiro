import { readFileSync } from 'node:fs'

import { Money, parseDegiroCsv } from 'libdegiro'
import { describe, expect, it } from 'vitest'

import { buildMarginReport, loanToCost } from '@/lib/analytics/margin'

const HEADER = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre'

const fixture = readFileSync(
   new URL('../../../test/fixtures/Account.csv', import.meta.url),
   'utf8',
)

const marginOf = (rows: readonly string[]) =>
   buildMarginReport(parseDegiroCsv([HEADER, ...rows].join('\n')).movements)

const MARGIN_BUY = [
   '19-11-2026,11:21,19-11-2026,,,"Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 100,00 CHF",,,,CHF,"-4900,00",',
   '19-11-2026,11:21,19-11-2026,,,Degiro Cash Sweep Transfer,,CHF,"100,00",CHF,"-4800,00",',
   '19-11-2026,10:45,19-11-2026,BITCOIN ETP,CH1199067674,Operation de change - Crédit,"1,0800",EUR,"5400,00",EUR,"0,00",o1',
   '19-11-2026,10:45,19-11-2026,BITCOIN ETP,CH1199067674,Opération de change - Débit,,CHF,"-5000,00",CHF,"-4900,00",o1',
   '19-11-2026,10:45,19-11-2026,BITCOIN ETP,CH1199067674,"Achat 400 Bitcoin ETP@13,5 EUR (CH1199067674)",,EUR,"-5400,00",EUR,"-5400,00",o1',
   '18-11-2026,09:00,18-11-2026,,,Versement de fonds,,CHF,"100,00",CHF,"100,00",',
]

describe('buildMarginReport', () => {
   it('finds no loan in the sample export', () => {
      // Given
      const movements = parseDegiroCsv(fixture).movements

      // When
      const report = buildMarginReport(movements)

      // Then
      expect(report.borrowed).toEqual([])
      expect(report.since).toBeNull()
   })

   it('reports the debit left by a purchase larger than the cash', () => {
      // When
      const report = marginOf(MARGIN_BUY)

      // Then
      expect(report.borrowed.map(String)).toEqual(['4900 CHF'])
      expect(report.since?.toISOString()).toBe('2026-11-19T11:21:00.000Z')
      expect(report.periods).toHaveLength(1)
      expect(report.periods[0]!.until).toBeNull()
      expect(report.periods[0]!.nights).toBeNull()
   })

   it('ignores a balance that dips below zero only within a timestamp', () => {
      // When
      const report = marginOf(MARGIN_BUY)

      // Then
      expect(report.byCurrency.map((entry) => entry.currency)).toEqual(['CHF'])
   })

   it('closes a period when the balance is back at zero or above', () => {
      // Given
      const rows = [
         '05-03-2025,10:00,05-03-2025,,,Versement de fonds,,CHF,"500,00",CHF,"200,00",',
         '03-03-2025,10:00,03-03-2025,X,IE00B4L5Y983,"Achat 1 X@200 CHF (IE00B4L5Y983)",,CHF,"-200,00",CHF,"-300,00",o2',
         '01-03-2025,10:00,01-03-2025,X,IE00B4L5Y983,"Achat 2 X@200 CHF (IE00B4L5Y983)",,CHF,"-400,00",CHF,"-100,00",o1',
         '28-02-2025,10:00,28-02-2025,,,Versement de fonds,,CHF,"300,00",CHF,"300,00",',
      ]

      // When
      const report = marginOf(rows)

      // Then
      const period = report.periods[0]!
      expect(report.borrowed).toEqual([])
      expect(report.since).toBeNull()
      expect(period.nights).toBe(4)
      expect(period.peak.toString()).toBe('300 CHF')
      expect(period.peakDate.toISOString()).toBe('2025-03-03T10:00:00.000Z')
      expect(report.byCurrency[0]!.peak.toString()).toBe('300 CHF')
   })

   it('sums the interest charged on the loan', () => {
      // Given
      const rows = [
         '02-12-2026,05:50,30-11-2026,,,Flatex Interest,,CHF,"-16,93",CHF,"-4916,93",',
         ...MARGIN_BUY,
      ]

      // When
      const report = marginOf(rows)

      // Then
      expect(report.interestCharged.map(String)).toEqual(['-16.93 CHF'])
      expect(report.borrowed.map(String)).toEqual(['4916.93 CHF'])
   })
})

describe('loanToCost', () => {
   it('divides the loan by the cost of the positions held', () => {
      // When
      const result = loanToCost(
         [Money.of('500', 'CHF')],
         { amount: Money.of('5000', 'CHF'), converted: false },
         null,
         null,
      )

      // Then
      expect(result).toEqual({ ratio: 0.1, converted: false })
   })

   it('gives no ratio across currencies without a rate table', () => {
      // When
      const result = loanToCost(
         [Money.of('500', 'CHF')],
         { amount: Money.of('5000', 'EUR'), converted: false },
         null,
         null,
      )

      // Then
      expect(result.ratio).toBeNull()
   })
})

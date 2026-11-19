import { ecbRateTable, Money, parseDegiroCsv } from 'libdegiro'
import { describe, expect, it } from 'vitest'

import { buildAnalytics } from '@/lib/analytics'
import { totalIn } from '@/lib/analytics/convert'

const HEADER = 'Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre'

const rates = ecbRateTable({ '2025-01-01': { CHF: 0.5 } })
const fx = { rates, base: 'CHF' }

const twoCurrencies = parseDegiroCsv(
   [
      HEADER,
      '03-01-2025,10:00,03-01-2025,,,Flatex Interest Income,,EUR,"0,00",EUR,"50,00",',
      '02-01-2025,10:00,02-01-2025,,,Versement de fonds,,CHF,"100,00",CHF,"100,00",',
      '01-01-2025,10:00,01-01-2025,,,Versement de fonds,,EUR,"50,00",EUR,"50,00",',
   ].join('\n'),
)

describe('buildOverviewTotals', () => {
   it('converts every currency into the reference currency', () => {
      // When
      const { overview } = buildAnalytics(twoCurrencies, fx)

      // Then
      expect(overview.deposited).toEqual({ amount: Money.of('125', 'CHF'), converted: true })
      expect(overview.cash).toEqual({ amount: Money.of('125', 'CHF'), converted: true })
   })

   it('keeps a total exact when only zeros are in another currency', () => {
      // When
      const { overview } = buildAnalytics(twoCurrencies, fx)

      // Then
      expect(overview.interest).toEqual({ amount: Money.zero('CHF'), converted: false })
   })

   it('adds securities lending to the interest figure', () => {
      // Given
      const lent = parseDegiroCsv(
         [
            HEADER,
            '02-09-2025,10:00,02-09-2025,,,Revenus provenant du Prêt de titres - Août,,EUR,"0,07",EUR,"100,17",',
            '01-09-2025,10:00,01-09-2025,,,Flatex Interest Income,,EUR,"0,10",EUR,"100,10",',
         ].join('\n'),
      )

      // When
      const { overview } = buildAnalytics(lent, null)

      // Then
      expect(overview.interest).toEqual({ amount: Money.of('0.17', 'EUR'), converted: false })
   })

   it('has no single figure across currencies without rates', () => {
      // When
      const { overview } = buildAnalytics(twoCurrencies, null)

      // Then
      expect(overview.deposited.amount).toBeNull()
      expect(overview.cash.amount).toBeNull()
   })
})

describe('totalIn', () => {
   it('needs no rate for a zero amount', () => {
      // Given
      const entries = [
         { amount: Money.of('100', 'CHF'), date: new Date('2025-01-02T00:00:00Z') },
         { amount: Money.zero('EUR'), date: new Date('2025-01-03T00:00:00Z') },
      ]

      // When
      const total = totalIn(entries, null)

      // Then
      expect(total).toEqual({ amount: Money.of('100', 'CHF'), converted: false })
   })
})

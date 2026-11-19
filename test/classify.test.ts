import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect,it } from 'vitest'

import {
   createDefaultClassifierRegistry,
   defaultClassifier,
   depositMatcher,
   type Dialect,
   dividendMatcher,
   dutchDialect,
   englishDialect,
   frenchDialect,
   genericDialect,
   germanDialect,
   mapRow,
   type Matcher,
   Money,
   type Movement,
   type MovementKind,
   type RawRecord,
   spanishDialect,
   tokenizeCsv,
   tradeMatcher,
   withdrawalMatcher,
} from '../src/index'

const fixture = readFileSync(
   fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
   'utf8',
)

function classifyAll(): Movement[] {
   const rows = tokenizeCsv(fixture).slice(1) // drop header
   const movements: Movement[] = []
   for (const row of rows) {
      const { record } = mapRow(row, frenchDialect)
      if (record) {
         movements.push(defaultClassifier.classify(record, frenchDialect))
      }
   }
   return movements
}

function record(description: string, overrides: Partial<RawRecord> = {}): RawRecord {
   return {
      bookingDate: new Date('2026-01-01T00:00:00Z'),
      valueDate: new Date('2026-01-01T00:00:00Z'),
      product: null,
      isin: null,
      description,
      fxRate: null,
      mutation: null,
      balance: null,
      orderId: null,
      raw: [],
      ...overrides,
   }
}

function itClassifies(dialect: Dialect, cases: readonly (readonly [string, MovementKind])[]): void {
   it.each(cases)('classifies "%s" as %s', (description, kind) => {
      expect(defaultClassifier.classify(record(description), dialect).kind).toBe(kind)
   })
}

function itReadsCashTransfers(
   dialect: Dialect,
   cases: readonly (readonly [string, 'toCashAccount' | 'fromCashAccount', string])[],
): void {
   it.each(cases)('reads "%s" as a transfer %s of %s', (description, direction, stated) => {
      const movement = defaultClassifier.classify(record(description), dialect)
      expect(movement.kind).toBe('cashTransfer')
      if (movement.kind === 'cashTransfer') {
         expect(movement.direction).toBe(direction)
         expect(movement.statedAmount?.toString()).toBe(stated)
      }
   })
}

describe('classification of the full sample export', () => {
   it('classifies every row (no unknown movements)', () => {
      const movements = classifyAll()
      const unknown = movements.filter((m) => m.kind === 'unknown')
      expect(unknown).toHaveLength(0)
   })

   it('produces a sensible distribution of movement kinds', () => {
      const counts = new Map<string, number>()
      for (const m of classifyAll()) {
         counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1)
      }
      expect(counts.get('buy')).toBeGreaterThan(0)
      expect(counts.get('sell')).toBeGreaterThan(0)
      expect(counts.get('dividend')).toBeGreaterThan(0)
      expect(counts.get('brokerageFee')).toBeGreaterThan(0)
      expect(counts.get('cashSweep')).toBeGreaterThan(0)
      expect(counts.get('cashTransfer')).toBeGreaterThan(0)
      expect(counts.get('deposit')).toBeGreaterThan(0)
      expect(counts.get('interest')).toBeGreaterThan(0)
      expect(counts.get('fxTrade')).toBeGreaterThan(0)
      expect(counts.get('fxCredit')).toBeGreaterThan(0)
      expect(counts.get('fxDebit')).toBeGreaterThan(0)
   })
})

describe('individual matchers', () => {
   const classify = (rec: RawRecord) => defaultClassifier.classify(rec, frenchDialect)

   it('parses a security buy', () => {
      const m = classify(
         record('Achat 42 iShares Core MSCI World UCITS ETF USD (Acc)@96,11 CHF (IE00B4L5Y983)', {
            product: 'ISHARES CORE MSCI WORLD UCITS ETF',
            isin: 'IE00B4L5Y983',
            mutation: undefined,
         }),
      )
      expect(m.kind).toBe('buy')
      if (m.kind === 'buy') {
         expect(m.quantity).toBe(42)
         expect(m.unitPrice?.toString()).toBe('96.11 CHF')
         expect(m.isin).toBe('IE00B4L5Y983')
      }
   })

   it('parses a sell with a price that has no decimals', () => {
      const m = classify(record('Vente 35 SPDR MSCI ACWI UCITS ETF USD Dis@120 CHF (IE00B44Z5B48)'))
      expect(m.kind).toBe('sell')
      if (m.kind === 'sell') {
         expect(m.quantity).toBe(35)
         expect(m.unitPrice?.toString()).toBe('120 CHF')
      }
   })

   it('parses an FX pair trade with a thousands-separated quantity', () => {
      const m = classify(record('Achat 4 800 EUR/CHF@0,9412 CHF ()', { product: 'EUR/CHF' }))
      expect(m.kind).toBe('fxTrade')
      if (m.kind === 'fxTrade') {
         expect(m.pair).toBe('EUR/CHF')
         expect(m.quantity).toBe(4800)
         expect(m.rate?.toString()).toBe('0.9412 CHF')
         expect(m.settlement).toBe(false)
      }
   })

   it('flags the FX settlement leg', () => {
      const m = classify(record('Règlement transaction devise: Vente 4 800 EUR/CHF@0,9412 CHF ()'))
      expect(m.kind).toBe('fxTrade')
      if (m.kind === 'fxTrade') {
         expect(m.settlement).toBe(true)
      }
   })

   it('distinguishes FX credit and debit legs despite accent differences', () => {
      expect(classify(record('Operation de change - Crédit')).kind).toBe('fxCredit')
      expect(classify(record('Opération de change - Débit')).kind).toBe('fxDebit')
   })

   it('classifies dividend, dividend tax and capital return', () => {
      expect(classify(record('Dividende')).kind).toBe('dividend')
      expect(classify(record('Impôts sur dividende')).kind).toBe('dividendTax')
      expect(classify(record('Remboursement de capital')).kind).toBe('capitalReturn')
   })

   it('classifies fees and extracts the connectivity year', () => {
      expect(classify(record('Frais DEGIRO de courtage et/ou de parties tierces')).kind).toBe(
         'brokerageFee',
      )
      const conn = classify(record('Frais de connexion aux places boursières 2025 (- - FX)'))
      expect(conn.kind).toBe('connectivityFee')
      if (conn.kind === 'connectivityFee') {
         expect(conn.year).toBe(2025)
      }
   })

   it('classifies cash transfers with direction and stated amount', () => {
      const out = classify(
         record('Virement vers votre Compte Espèces à la flatexDEGIRO Bank: 6 770,1 CHF'),
      )
      expect(out.kind).toBe('cashTransfer')
      if (out.kind === 'cashTransfer') {
         expect(out.direction).toBe('toCashAccount')
         expect(out.statedAmount?.toString()).toBe('6770.1 CHF')
      }
      const incoming = classify(
         record('Virement depuis votre Compte Espèces à la flatexDEGIRO Bank: 213,25 EUR'),
      )
      if (incoming.kind === 'cashTransfer') {
         expect(incoming.direction).toBe('fromCashAccount')
      }
   })

   it('classifies cash sweep, deposit and interest', () => {
      expect(classify(record('Degiro Cash Sweep Transfer')).kind).toBe('cashSweep')
      expect(classify(record('Versement de fonds')).kind).toBe('deposit')
      expect(classify(record('Flatex Interest Income')).kind).toBe('interest')
   })

   it('classifies interest charged on a negative balance', () => {
      // Given
      const charge = record('Flatex Interest', { mutation: Money.of('-16.93', 'CHF') })

      // When
      const movement = classify(charge)

      // Then
      expect(movement.kind).toBe('interest')
      expect(movement.amount?.toString()).toBe('-16.93 CHF')
   })

   it('classifies securities-lending income in French, Dutch and Spanish, keeping its amount', () => {
      // Given
      const august = record('Revenus provenant du Prêt de titres - Août', {
         mutation: Money.of('0.07', 'EUR'),
      })
      const december = record('Revenus provenant du Prêt de titres - Décembre')
      const june = record('Inkomsten uit Securities Lending - Juni')
      const october = record('Ingresos por Préstamo de Valores - Octubre')
      const march = record('Ingresos procedentes del préstamo de valores - Marzo')

      // When
      const movements = [august, december, june, october, march].map(classify)

      // Then
      expect(movements.map((m) => m.kind)).toEqual(Array(5).fill('securitiesLending'))
      expect(movements[0]?.amount?.toString()).toBe('0.07 EUR')
   })

   it('falls back to unknown for unrecognised descriptions', () => {
      expect(classify(record('Some brand new DEGIRO movement')).kind).toBe('unknown')
   })
})

describe('English descriptions', () => {
   const classify = (rec: RawRecord) => defaultClassifier.classify(rec, englishDialect)

   it('parses a security buy and sell', () => {
      const buy = classify(
         record('Buy 1,060 SMI ETF@106.02 CHF (CH0019852802)', { isin: 'CH0019852802' }),
      )
      expect(buy.kind).toBe('buy')
      if (buy.kind === 'buy') {
         expect(buy.quantity).toBe(1060)
         expect(buy.unitPrice?.toString()).toBe('106.02 CHF')
      }
      expect(classify(record('Sell 10 VWCE@120.36 EUR (IE00BK5BQT80)')).kind).toBe('sell')
   })

   it('parses FX pair trades and their settlement leg', () => {
      const fx = classify(record('Buy 4,800 EUR/CHF@0.9412 CHF ()'))
      expect(fx.kind).toBe('fxTrade')
      if (fx.kind === 'fxTrade') {
         expect(fx.pair).toBe('EUR/CHF')
         expect(fx.quantity).toBe(4800)
         expect(fx.settlement).toBe(false)
      }
      const settled = classify(
         record('Currency transaction settlement: Sell 4,800 EUR/CHF@0.9412 CHF ()'),
      )
      if (settled.kind === 'fxTrade') {
         expect(settled.settlement).toBe(true)
      }
   })

   it('distinguishes FX credit and debit legs in both spellings', () => {
      expect(classify(record('Currency Exchange - Credit')).kind).toBe('fxCredit')
      expect(classify(record('Currency Exchange (Debit)')).kind).toBe('fxDebit')
      expect(classify(record('FX Credit')).kind).toBe('fxCredit')
      expect(classify(record('FX Debit')).kind).toBe('fxDebit')
   })

   it('classifies dividend, dividend tax and capital return', () => {
      expect(classify(record('Dividend')).kind).toBe('dividend')
      expect(classify(record('Dividend Tax')).kind).toBe('dividendTax')
      expect(classify(record('Return of Capital')).kind).toBe('capitalReturn')
      expect(classify(record('Capital Return')).kind).toBe('capitalReturn')
   })

   it('classifies fees and extracts the connectivity year', () => {
      expect(classify(record('DEGIRO Transaction and/or Third Party Fees')).kind).toBe(
         'brokerageFee',
      )
      const conn = classify(record('DEGIRO Exchange Connection Fee 2024 (Euronext Amsterdam - EAM)'))
      expect(conn.kind).toBe('connectivityFee')
      if (conn.kind === 'connectivityFee') {
         expect(conn.year).toBe(2024)
      }
      expect(classify(record('DEGIRO Exchange Connectivity Fee 2024')).kind).toBe('connectivityFee')
   })

   it('classifies cash transfers with direction and stated amount', () => {
      const out = classify(record('Transfer to your Cash Account at flatex Bank: 6,770.10 CHF'))
      expect(out.kind).toBe('cashTransfer')
      if (out.kind === 'cashTransfer') {
         expect(out.direction).toBe('toCashAccount')
         expect(out.statedAmount?.toString()).toBe('6770.1 CHF')
      }
      const incoming = classify(record('Transfer from your Cash Account at flatex Bank: 213.25 EUR'))
      if (incoming.kind === 'cashTransfer') {
         expect(incoming.direction).toBe('fromCashAccount')
      }
   })

   it('prefers a cash transfer over a deposit when the row names the cash account', () => {
      expect(classify(record('Deposit to your Cash Account at flatex Bank: 213.25 EUR')).kind).toBe(
         'cashTransfer',
      )
      expect(
         classify(record('Withdrawal from your Cash Account at flatex Bank: 213.25 EUR')).kind,
      ).toBe('cashTransfer')
   })

   it('classifies deposits and withdrawals, however they are qualified', () => {
      expect(classify(record('Deposit')).kind).toBe('deposit')
      expect(classify(record('flatex Deposit')).kind).toBe('deposit')
      expect(classify(record('Withdrawal')).kind).toBe('withdrawal')
      expect(classify(record('Processed Flatex Withdrawal')).kind).toBe('withdrawal')
   })

   it('does not mistake a French export read through the English dialect', () => {
      expect(classify(record('Versement de fonds')).kind).toBe('deposit')
      expect(classify(record('Degiro Cash Sweep Transfer')).kind).toBe('cashSweep')
   })
})

describe('Dutch descriptions', () => {
   const classify = (rec: RawRecord) => defaultClassifier.classify(rec, dutchDialect)

   itClassifies(dutchDialect, [
      ['DEGIRO Transactiekosten en/of kosten van derden', 'brokerageFee'],
      ['DEGIRO Transactiekosten', 'brokerageFee'],
      ['DEGIRO Aansluitingskosten 2021 (Borsa Italiana S.p.A. - MIL)', 'connectivityFee'],
      ['Valuta Creditering', 'fxCredit'],
      ['Valuta Debitering', 'fxDebit'],
      ['Dividend', 'dividend'],
      ['Dividendbelasting', 'dividendTax'],
      ['Kapitaalsuitkering', 'capitalReturn'],
      ['Rente', 'interest'],
      ['iDEAL Deposit', 'deposit'],
      ['iDEAL storting', 'deposit'],
      ['flatex Storting', 'deposit'],
      ['flatex terugstorting', 'withdrawal'],
   ])

   itReadsCashTransfers(dutchDialect, [
      ['Overboeking naar uw geldrekening bij flatexDEGIRO Bank: 0,92 EUR', 'toCashAccount', '0.92 EUR'],
      ['Overboeking van uw geldrekening bij flatexDEGIRO Bank: 213,25 EUR', 'fromCashAccount', '213.25 EUR'],
      ['Overboeking van uw geldrekening bij flatexDEGIRO Bank 26,45 EUR', 'fromCashAccount', '26.45 EUR'],
   ])

   it('reads a buy that names neither product nor ISIN from the columns', () => {
      // Given
      const row = record('Koop 15 @ 76,50 EUR', {
         product: 'VANGUARD FTSE ALL-WORLD UCITS ETF',
         isin: 'IE00B3RBWM25',
         mutation: Money.of('-1147.50', 'EUR'),
      })

      // When
      const movement = classify(row)

      // Then
      expect(movement.kind).toBe('buy')
      if (movement.kind === 'buy') {
         expect(movement.quantity).toBe(15)
         expect(movement.unitPrice?.toString()).toBe('76.5 EUR')
         expect(movement.product).toBe('VANGUARD FTSE ALL-WORLD UCITS ETF')
         expect(movement.isin).toBe('IE00B3RBWM25')
      }
   })

   it('reads a sell from its verb', () => {
      // Given
      const row = record('Verkoop 7 @ 112,40 EUR', { isin: 'IE00B3RBWM25' })

      // When
      const movement = classify(row)

      // Then
      expect(movement.kind).toBe('sell')
      if (movement.kind === 'sell') {
         expect(movement.quantity).toBe(7)
         expect(movement.unitPrice?.toString()).toBe('112.4 EUR')
      }
   })

   it('leaves a trade with no ISIN anywhere unknown', () => {
      expect(classify(record('Koop 15 @ 76,50 EUR')).kind).toBe('unknown')
   })

   it('reads a currency pair as an FX trade, never a security trade', () => {
      // Given
      const row = record('Koop 4.800 EUR/CHF@0,9412 CHF ()', { product: 'EUR/CHF', isin: 'IE00B3RBWM25' })

      // When
      const movement = classify(row)
      const asSecurity = tradeMatcher.match({ record: row, dialect: dutchDialect })

      // Then
      expect(movement.kind).toBe('fxTrade')
      expect(asSecurity).toBeNull()
   })

   it('does not read an FX pair in the product column as a security trade', () => {
      // Given
      const row = record('Koop 100 @ 0,94 CHF', { product: 'EUR/CHF', isin: 'IE00B3RBWM25' })

      // When
      const movement = tradeMatcher.match({ record: row, dialect: dutchDialect })

      // Then
      expect(movement).toBeNull()
   })
})

describe('German descriptions', () => {
   const classify = (rec: RawRecord) => defaultClassifier.classify(rec, germanDialect)

   itClassifies(germanDialect, [
      ['Transaktionsgebühr', 'brokerageFee'],
      ['DEGIRO Transaktionsgebühren und/oder Fremdkosten', 'brokerageFee'],
      ['Einrichtung von Handelsmodalitäten 2019 (New York Stock Exchange - NSY)', 'connectivityFee'],
      ['Währungswechsel (Einbuchung)', 'fxCredit'],
      ['Währungswechsel (Ausbuchung)', 'fxDebit'],
      ['Dividende', 'dividend'],
      ['Fondsausschüttung', 'dividend'],
      ['Dividendensteuer', 'dividendTax'],
      ['Kapitalrückzahlung', 'capitalReturn'],
      ['Zinsen für Leerverkauf', 'interest'],
      ['Einzahlung', 'deposit'],
      ['SOFORT Einzahlung', 'deposit'],
      ['flatex Einzahlung', 'deposit'],
      ['Auszahlung', 'withdrawal'],
      ['flatex Cash Sweep Transfer', 'cashSweep'],
   ])

   itReadsCashTransfers(germanDialect, [
      ['Überweisung auf Ihr Geldkonto bei der flatex Bank: 2,37 EUR', 'toCashAccount', '2.37 EUR'],
      ['Auszahlung von Ihrem Geldkonto bei der flatex Bank: 542,8 EUR', 'fromCashAccount', '542.8 EUR'],
   ])

   it('extracts the year of a connectivity fee', () => {
      const movement = classify(record('Einrichtung von Handelsmodalitäten 2019 (New York Stock Exchange - NSY)'))
      expect(movement.kind === 'connectivityFee' && movement.year).toBe(2019)
   })

   it('reads a buy that names no product, taking the ISIN from the description', () => {
      // Given
      const row = record('Kauf 1 zu je 211 USD (US88160R1014)', { product: 'TESLA INC' })

      // When
      const movement = classify(row)

      // Then
      expect(movement.kind).toBe('buy')
      if (movement.kind === 'buy') {
         expect(movement.quantity).toBe(1)
         expect(movement.unitPrice?.toString()).toBe('211 USD')
         expect(movement.product).toBe('TESLA INC')
         expect(movement.isin).toBe('US88160R1014')
      }
   })

   it('reads a sell from its verb', () => {
      // Given
      const row = record('Verkauf 25 zu je 67,4 USD (US0378331005)')

      // When
      const movement = classify(row)

      // Then
      expect(movement.kind).toBe('sell')
      if (movement.kind === 'sell') {
         expect(movement.quantity).toBe(25)
         expect(movement.unitPrice?.toString()).toBe('67.4 USD')
         expect(movement.isin).toBe('US0378331005')
      }
   })
})

describe('Spanish descriptions', () => {
   itClassifies(spanishDialect, [
      ['Costes de transacción y/o externos de DEGIRO', 'brokerageFee'],
      ['Ingreso Cambio de Divisa', 'fxCredit'],
      ['Retirada Cambio de Divisa', 'fxDebit'],
      ['Dividendo', 'dividend'],
      ['Retención del dividendo', 'dividendTax'],
      ['Ingreso', 'deposit'],
   ])

   itReadsCashTransfers(spanishDialect, [
      ['Transferir a su Cuenta de Efectivo en flatexDEGIRO Bank: 43,9 EUR', 'toCashAccount', '43.9 EUR'],
      ['Transferir desde su Cuenta de Efectivo en flatexDEGIRO Bank: 12,5 EUR', 'fromCashAccount', '12.5 EUR'],
   ])
})

describe('Italian descriptions', () => {
   itClassifies(genericDialect, [
      ['DEGIRO Commissioni di transazione e/o di terze parti', 'brokerageFee'],
      ['DEGIRO Costi di connessione 2021 (Xetra - XET)', 'connectivityFee'],
      ['Credito FX', 'fxCredit'],
      ['Prelievo FX', 'fxDebit'],
      ['Dividendo', 'dividend'],
      ['Ritenuta sul dividendo', 'dividendTax'],
      ['Interesse', 'interest'],
      ['Deposito', 'deposit'],
      ['Deposito flatex', 'deposit'],
      ['Prelievo', 'withdrawal'],
      ['Prelievo flatex', 'withdrawal'],
   ])

   itReadsCashTransfers(genericDialect, [
      ['Trasferisci sul tuo conto deposito presso flatexDEGIRO Bank: 7,25 EUR', 'toCashAccount', '7.25 EUR'],
      ['Trasferisci dal tuo conto deposito presso flatexDEGIRO Bank: 1.250,5 EUR', 'fromCashAccount', '1250.5 EUR'],
   ])
})

describe('Czech descriptions', () => {
   const classify = (rec: RawRecord) => defaultClassifier.classify(rec, genericDialect)

   itClassifies(genericDialect, [
      ['DEGIRO poplatek za Obchodování na zahraničních burzách 2023 (Borsa Italiana - MIL)', 'connectivityFee'],
      ['Dividenda', 'dividend'],
      ['Vklad', 'deposit'],
   ])

   it.each([
      ['FX vyučtování konverze měny', '125.40', 'fxCredit'],
      ['FX vyučtování konverze měny', '-115.00', 'fxDebit'],
      ['FX vyúčtování konverze měny', '-115.00', 'fxDebit'],
   ] as const)('takes "%s" of %s as %s from the sign', (description, amount, kind) => {
      expect(classify(record(description, { mutation: Money.of(amount, 'EUR') })).kind).toBe(kind)
   })

   it('leaves an FX leg with no amount to sign unknown', () => {
      expect(classify(record('FX vyučtování konverze měny')).kind).toBe('unknown')
   })
})

describe('Portuguese descriptions', () => {
   itClassifies(genericDialect, [
      ['Comissões de transação DEGIRO e/ou taxas de terceiros', 'brokerageFee'],
      ['Crédito de divisa', 'fxCredit'],
      ['Levantamento de divisa', 'fxDebit'],
   ])
})

describe('French and English wordings seen in other statements', () => {
   itClassifies(englishDialect, [
      ['Dépôt flatex', 'deposit'],
      ['Giro Exchange Connection Fee 2022', 'connectivityFee'],
      ['Interest', 'interest'],
   ])
})

describe('wordings that share a prefix with another kind', () => {
   it.each(['Dividendbelasting', 'Dividendensteuer', 'Retención del dividendo', 'Ritenuta sul dividendo'])(
      'never reads the tax row "%s" as a dividend',
      (description) => {
         expect(dividendMatcher.match({ record: record(description), dialect: genericDialect })).toBeNull()
      },
   )

   it('never reads a Spanish FX credit as a deposit', () => {
      expect(
         depositMatcher.match({ record: record('Ingreso Cambio de Divisa'), dialect: spanishDialect }),
      ).toBeNull()
   })

   it('never reads an Italian FX debit as a withdrawal', () => {
      expect(withdrawalMatcher.match({ record: record('Prelievo FX'), dialect: genericDialect })).toBeNull()
   })
})

describe('rows that need a new kind', () => {
   it.each([
      'Koersverandering geldmarktfonds (EUR)',
      'Conversie geldmarktfonds: Koop 100 @ 1 EUR',
      'Geldmarktfonds Umwandlung: Kauf 709,65 zu je 1 EUR',
      'STOCK SPLIT: Koop 4 @ 25 EUR',
      'DELISTING: Verkauf 4 zu je 0 EUR',
      'Transactiebelasting',
      'Französische Transaktionssteuer',
      'Verrekening Welkomstactie',
      'SOFORT Zahlungsgebühr',
      'ADR/GDR Externe Kosten',
      'Coupon',
      'Meegekochte Rente',
      'Vervangende Betaling',
      'Belasting op vervangend dividend',
      'Reservation iDEAL / Sofort Deposit',
   ])('leaves "%s" unknown', (description) => {
      // Given
      const row = record(description, { isin: 'IE00B3RBWM25', mutation: Money.of('-100', 'EUR') })

      // When
      const movement = defaultClassifier.classify(row, genericDialect)

      // Then
      expect(movement.kind).toBe('unknown')
   })
})

describe('classifier extensibility', () => {
   it('classifies an otherwise-unknown description via a custom matcher', () => {
      // A referral bonus is not understood by the built-ins...
      expect(defaultClassifier.classify(record('Récompense de parrainage'), frenchDialect).kind).toBe(
         'unknown',
      )

      // ...until we register a higher-priority matcher that treats it as a deposit.
      const referralMatcher: Matcher = {
         name: 'referral-bonus',
         priority: 100,
         match({ record: rec }) {
            if (!/^Récompense de parrainage/i.test(rec.description)) {
               return null
            }
            return { kind: 'deposit', amount: rec.mutation, record: rec }
         },
      }
      const registry = createDefaultClassifierRegistry().register(referralMatcher)
      expect(registry.all()[0]?.name).toBe('referral-bonus')
      expect(registry.classify(record('Récompense de parrainage'), frenchDialect).kind).toBe(
         'deposit',
      )
   })
})

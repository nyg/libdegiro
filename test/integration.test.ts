import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect,it } from 'vitest'

import {
   ClassifierRegistry,
   type Dialect,
   frenchDialect,
   type Matcher,
   Money,
   parseDegiroCsv,
   parseFrenchDateTime,
   reconcileBalances,
   summarizePortfolio,
   UnknownDialectError,
} from '../src/index'

const fixture = readFileSync(
   fileURLToPath(new URL('./fixtures/Account.csv', import.meta.url)),
   'utf8',
)

const englishFixture = readFileSync(
   fileURLToPath(new URL('./fixtures/Account-en.csv', import.meta.url)),
   'utf8',
)

describe('end-to-end on the real sample export', () => {
   const result = parseDegiroCsv(fixture)

   it('parses, classifies, groups and reconciles consistently', () => {
      expect(result.errors).toHaveLength(0)
      expect(result.records).toHaveLength(236)
      expect(result.movements.every((m) => m.kind !== 'unknown')).toBe(true)

      const grouped = result.transactions.flatMap((t) => t.movements)
      expect(grouped).toHaveLength(result.movements.length)

      expect(reconcileBalances(result.movements).ok).toBe(true)

      const summary = summarizePortfolio(result.movements)
      expect(summary.positions.length).toBeGreaterThan(0)
      expect(summary.cashByCurrency.length).toBe(3)
   })
})

describe('end-to-end on an English-header export', () => {
   const result = parseDegiroCsv(englishFixture)

   it('detects the English dialect and parses it cleanly', () => {
      expect(result.dialect.id).toBe('en')
      expect(result.errors).toHaveLength(0)
      expect(result.records).toHaveLength(236)
      expect(result.movements.every((m) => m.kind !== 'unknown')).toBe(true)
      expect(reconcileBalances(result.movements).ok).toBe(true)
   })

   it('yields the same movements as the French export of the same account', () => {
      const french = parseDegiroCsv(fixture)
      const shape = (r: typeof result) =>
         r.movements.map((m) => ({
            kind: m.kind,
            amount: m.amount?.toString() ?? null,
            description: m.record.description,
            bookingDate: m.record.bookingDate.toISOString(),
         }))
      expect(shape(result)).toEqual(shape(french))
   })

   it('summarizes to the same portfolio as the French export', () => {
      const english = summarizePortfolio(result.movements)
      const french = summarizePortfolio(parseDegiroCsv(fixture).movements)
      expect(english.cashByCurrency.map((m) => m.toString())).toEqual(
         french.cashByCurrency.map((m) => m.toString()),
      )
      expect(english.positions.map((p) => p.isin)).toEqual(french.positions.map((p) => p.isin))
   })
})

describe('an English export written in English, with US number formatting', () => {
   const csv = [
      'Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id',
      '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,"Buy 1,060 SMI ETF@106.02 CHF (CH0019852802)",,CHF,"-112381.20",CHF,"7,939.80",o1',
      '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,DEGIRO Transaction and/or Third Party Fees,,CHF,"-2.79",CHF,"7,937.01",o1',
      '19-11-2024,09:01,19-11-2024,VWCE,IE00BK5BQT80,"Sell 10 VWCE@120.36 EUR (IE00BK5BQT80)",,EUR,"1,203.60",EUR,"1,203.60",o2',
      '18-11-2024,00:00,18-11-2024,VWCE,IE00BK5BQT80,Dividend,,EUR,"12.34",EUR,"12.34",',
      '18-11-2024,00:00,18-11-2024,VWCE,IE00BK5BQT80,Dividend Tax,,EUR,"-1.85",EUR,"10.49",',
      '17-11-2024,00:00,17-11-2024,,,Currency Exchange - Credit,1.0888,CHF,"500.00",CHF,"500.00",o3',
      '17-11-2024,00:00,17-11-2024,,,FX Debit,1.0888,EUR,"-459.22",EUR,"0.00",o3',
      '16-11-2024,00:00,16-11-2024,,,Degiro Cash Sweep Transfer,,CHF,"9,000.00",CHF,"9,000.00",',
      '16-11-2024,00:00,16-11-2024,,,"Transfer from your Cash Account at flatex Bank: 9,000.00 CHF",,,,CHF,"0.00",',
      '15-11-2024,00:00,15-11-2024,,,Deposit,,CHF,"9,000.00",CHF,"9,000.00",',
      '14-11-2024,00:00,14-11-2024,,,Processed Flatex Withdrawal,,CHF,"-100.00",CHF,"8,900.00",',
      '13-11-2024,00:00,13-11-2024,,,DEGIRO Exchange Connection Fee 2024 (Euronext Amsterdam - EAM),,EUR,"-2.50",EUR,"-2.50",',
      '12-11-2024,00:00,12-11-2024,,,Flatex Interest Income,,EUR,"0.42",EUR,"0.42",',
      '11-11-2024,00:00,11-11-2024,,,Return of Capital,,EUR,"5.00",EUR,"5.00",',
      '10-11-2024,00:00,10-11-2024,,,"Currency transaction settlement: Sell 1,900 EUR/CHF@0.9412 CHF ()",,EUR,"-1,900.00",EUR,"0.00",o4',
      '',
   ].join('\n')

   const result = parseDegiroCsv(csv)

   it('classifies every English description with the built-in matchers', () => {
      expect(result.dialect.id).toBe('en')
      expect(result.issues).toHaveLength(0)
      expect(result.movements.map((m) => m.kind)).toEqual([
         'buy',
         'brokerageFee',
         'sell',
         'dividend',
         'dividendTax',
         'fxCredit',
         'fxDebit',
         'cashSweep',
         'cashTransfer',
         'deposit',
         'withdrawal',
         'connectivityFee',
         'interest',
         'capitalReturn',
         'fxTrade',
      ])
   })

   it('reads US-grouped quantities and prices', () => {
      const buy = result.movements.find((m) => m.kind === 'buy')
      expect(buy?.kind).toBe('buy')
      if (buy?.kind === 'buy') {
         expect(buy.quantity).toBe(1060)
         expect(buy.unitPrice?.toString()).toBe('106.02 CHF')
         expect(buy.amount?.toString()).toBe('-112381.2 CHF')
      }
   })

   it('reads the direction and stated amount of an English cash transfer', () => {
      const transfer = result.movements.find((m) => m.kind === 'cashTransfer')
      expect(transfer?.kind).toBe('cashTransfer')
      if (transfer?.kind === 'cashTransfer') {
         expect(transfer.direction).toBe('fromCashAccount')
         expect(transfer.statedAmount?.toString()).toBe('9000 CHF')
      }
   })

   it('reads the settlement leg of an English FX trade', () => {
      const fx = result.movements.find((m) => m.kind === 'fxTrade')
      expect(fx?.kind).toBe('fxTrade')
      if (fx?.kind === 'fxTrade') {
         expect(fx.settlement).toBe(true)
         expect(fx.pair).toBe('EUR/CHF')
         expect(fx.quantity).toBe(1900)
         expect(fx.rate?.toString()).toBe('0.9412 CHF')
      }
   })
})

const dutchCsv = [
   'Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id',
   '06-04-2025,07:00,06-04-2025,,,Valuta Creditering,"1,0850",USD,"108,50",USD,"108,50",n3',
   '06-04-2025,07:00,06-04-2025,,,Valuta Debitering,"1,0850",EUR,"-100,00",EUR,"156,07",n3',
   '05-04-2025,11:00,05-04-2025,,,flatex terugstorting,,EUR,"-500,00",EUR,"256,07",',
   '04-04-2025,09:00,04-04-2025,,,Degiro Cash Sweep Transfer,,EUR,"26,45",EUR,"756,07",',
   '04-04-2025,09:00,04-04-2025,,,"Overboeking van uw geldrekening bij flatexDEGIRO Bank 26,45 EUR",,,,EUR,"729,62",',
   '03-04-2025,09:00,03-04-2025,,,Degiro Cash Sweep Transfer,,EUR,"-256,07",EUR,"756,07",',
   '03-04-2025,09:00,03-04-2025,,,"Overboeking naar uw geldrekening bij flatexDEGIRO Bank: 256,07 EUR",,,,EUR,"1012,14",',
   '02-04-2025,14:05,02-04-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,DEGIRO Transactiekosten en/of kosten van derden,,EUR,"-1,00",EUR,"756,07",n2',
   '02-04-2025,14:05,02-04-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,"Verkoop 5 @ 80,00 EUR",,EUR,"400,00",EUR,"757,07",n2',
   '01-04-2025,10:00,01-04-2025,,,DEGIRO Aansluitingskosten 2025 (Euronext Amsterdam - EAM),,EUR,"-2,50",EUR,"357,07",',
   '31-03-2025,23:59,31-03-2025,,,Rente,,EUR,"-0,42",EUR,"359,57",',
   '10-03-2025,07:30,10-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,Dividendbelasting,,EUR,"-1,85",EUR,"359,99",',
   '10-03-2025,07:30,10-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,Dividend,,EUR,"12,34",EUR,"361,84",',
   '04-03-2025,09:15,04-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,DEGIRO Transactiekosten en/of kosten van derden,,EUR,"-3,00",EUR,"349,50",n1',
   '04-03-2025,09:15,04-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,"Koop 15 @ 76,50 EUR",,EUR,"-1147,50",EUR,"352,50",n1',
   '03-03-2025,08:00,03-03-2025,,,iDEAL storting,,EUR,"1500,00",EUR,"1500,00",',
   '',
].join('\n')

const germanCsv = [
   'Datum,Uhrzeit,Wertstellungsdatum,Produkt,ISIN,Beschreibung,FX,Änderung,,Saldo,,Auftrag ID',
   '05-04-2025,11:00,05-04-2025,,,Auszahlung,,EUR,"-300,00",EUR,"499,98",',
   '03-04-2025,09:00,03-04-2025,,,flatex Cash Sweep Transfer,,EUR,"0,50",EUR,"799,98",',
   '03-04-2025,09:00,03-04-2025,,,"Auszahlung von Ihrem Geldkonto bei der flatex Bank: 0,5 EUR",,,,EUR,"799,48",',
   '02-04-2025,09:00,02-04-2025,,,flatex Cash Sweep Transfer,,EUR,"-299,98",EUR,"799,98",',
   '02-04-2025,09:00,02-04-2025,,,"Überweisung auf Ihr Geldkonto bei der flatex Bank: 299,98 EUR",,,,EUR,"1099,96",',
   '01-04-2025,10:00,01-04-2025,,,Einrichtung von Handelsmodalitäten 2025 (New York Stock Exchange - NSY),,EUR,"-2,50",EUR,"799,98",',
   '31-03-2025,23:59,31-03-2025,,,Zinsen für Leerverkauf,,EUR,"-0,15",EUR,"802,48",',
   '14-03-2025,07:00,14-03-2025,APPLE INC,US0378331005,Dividendensteuer,,USD,"-0,38",USD,"2,12",',
   '14-03-2025,07:00,14-03-2025,APPLE INC,US0378331005,Dividende,,USD,"2,50",USD,"2,50",',
   '04-03-2025,15:30,04-03-2025,,,Währungswechsel (Ausbuchung),"1,0800",EUR,"-195,37",EUR,"802,63",d1',
   '04-03-2025,15:30,04-03-2025,,,Währungswechsel (Einbuchung),"1,0800",USD,"211,00",USD,"0,00",d1',
   '04-03-2025,15:30,04-03-2025,TESLA INC,US88160R1014,Transaktionsgebühr,,EUR,"-2,00",EUR,"998,00",d1',
   '04-03-2025,15:30,04-03-2025,TESLA INC,US88160R1014,Kauf 1 zu je 211 USD (US88160R1014),,USD,"-211,00",USD,"-211,00",d1',
   '03-03-2025,08:00,03-03-2025,,,SOFORT Einzahlung,,EUR,"1000,00",EUR,"1000,00",',
   '',
].join('\n')

const spanishCsv = [
   'Fecha,Hora,Fecha valor,Producto,ISIN,Descripción,Tipo,Variación,,Saldo,,ID Orden',
   '03-04-2025,09:00,03-04-2025,,,Degiro Cash Sweep Transfer,,EUR,"12,50",EUR,"43,90",',
   '03-04-2025,09:00,03-04-2025,,,"Transferir desde su Cuenta de Efectivo en flatexDEGIRO Bank: 12,5 EUR",,,,EUR,"31,40",',
   '02-04-2025,09:00,02-04-2025,,,Degiro Cash Sweep Transfer,,EUR,"-43,90",EUR,"43,90",',
   '02-04-2025,09:00,02-04-2025,,,"Transferir a su Cuenta de Efectivo en flatexDEGIRO Bank: 43,9 EUR",,,,EUR,"87,80",',
   '01-04-2025,10:00,01-04-2025,,,Giro Exchange Connection Fee 2025 (Euronext Amsterdam - EAM),,EUR,"-2,50",EUR,"43,90",',
   '21-03-2025,07:00,21-03-2025,,,Ingreso Cambio de Divisa,"1,0850",USD,"54,25",USD,"54,25",e2',
   '21-03-2025,07:00,21-03-2025,,,Retirada Cambio de Divisa,"1,0850",EUR,"-50,00",EUR,"46,40",e2',
   '20-03-2025,07:00,20-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,Retención del dividendo,,EUR,"-0,80",EUR,"96,40",',
   '20-03-2025,07:00,20-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,Dividendo,,EUR,"4,20",EUR,"97,20",',
   '04-03-2025,09:10,04-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,Costes de transacción y/o externos de DEGIRO,,EUR,"-2,00",EUR,"93,00",e1',
   '04-03-2025,09:10,04-03-2025,VANGUARD FTSE ALL-WORLD UCITS ETF,IE00B3RBWM25,"Compra 10 Vanguard FTSE All-World UCITS ETF USD Dis@90,5 EUR (IE00B3RBWM25)",,EUR,"-905,00",EUR,"95,00",e1',
   '03-03-2025,08:00,03-03-2025,,,Ingreso,,EUR,"1000,00",EUR,"1000,00",',
   '',
].join('\n')

describe.each([
   [
      'Dutch',
      'nl',
      dutchCsv,
      ['fxCredit', 'fxDebit', 'withdrawal', 'cashSweep', 'cashTransfer', 'cashSweep', 'cashTransfer', 'brokerageFee', 'sell', 'connectivityFee', 'interest', 'dividendTax', 'dividend', 'brokerageFee', 'buy', 'deposit'],
      ['EUR', 'USD'],
   ],
   [
      'German',
      'de',
      germanCsv,
      ['withdrawal', 'cashSweep', 'cashTransfer', 'cashSweep', 'cashTransfer', 'connectivityFee', 'interest', 'dividendTax', 'dividend', 'fxDebit', 'fxCredit', 'brokerageFee', 'buy', 'deposit'],
      ['EUR', 'USD'],
   ],
   [
      'Spanish',
      'es',
      spanishCsv,
      ['cashSweep', 'cashTransfer', 'cashSweep', 'cashTransfer', 'connectivityFee', 'fxCredit', 'fxDebit', 'dividendTax', 'dividend', 'brokerageFee', 'buy', 'deposit'],
      ['EUR', 'USD'],
   ],
] as const)('end-to-end on a %s export', (_language, id, csv, kinds, currencies) => {
   const result = parseDegiroCsv(csv)

   it('detects its dialect and reads every row without an issue', () => {
      expect(result.dialect.id).toBe(id)
      expect(result.issues).toHaveLength(0)
   })

   it('classifies every row', () => {
      expect(result.movements.map((movement) => movement.kind)).toEqual(kinds)
   })

   it('reconciles the running balance of each currency exactly', () => {
      const report = reconcileBalances(result.movements)
      expect(report.exact).toBe(true)
      expect(report.byCurrency.map((currency) => currency.currency).sort((a, b) => a.localeCompare(b))).toEqual(currencies)
   })
})

describe('an export in a language no dialect knows', () => {
   const italianCsv = [
      'Data,Ora,Data Valore,Prodotto,ISIN,Descrizione,Borsa,Variazioni,,Saldo,,ID Ordine',
      '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,"Acquisto 1.060 SMI ETF@106,02 CHF (CH0019852802)",,CHF,"-112.381,20",CHF,"7.939,80",o1',
      '20-11-2024,09:01,20-11-2024,SMI ETF,CH0019852802,"Vendita 10 SMI ETF@106,02 CHF (CH0019852802)",,CHF,"1.060,20",CHF,"9.000,00",o2',
      '19-11-2024,00:00,19-11-2024,,,"Credito FX","1,0888",CHF,"500,00",CHF,"500,00",o3',
      '18-11-2024,00:00,18-11-2024,,,"Variazione di prezzo Fondo Comune Monetario (CHF)",,CHF,"9.000,00",CHF,"9.000,00",',
      '17-11-2024,00:00,17-11-2024,,,"Valutatransactie afwikkeling: Verkoop 1.900 EUR/CHF@0,9412 CHF ()",,EUR,"-1.900,00",EUR,"0,00",o4',
      '',
   ].join('\n')

   const result = parseDegiroCsv(italianCsv)

   it('falls back to the positional layout and reads every row', () => {
      expect(result.dialect.id).toBe('generic')
      expect(result.errors).toHaveLength(0)
      expect(result.records).toHaveLength(5)
      expect(result.records[0]?.bookingDate.toISOString()).toBe('2024-11-20T09:01:00.000Z')
      expect(result.records[0]?.mutation?.toString()).toBe('-112381.2 CHF')
      expect(result.records[3]?.balance?.toString()).toBe('9000 CHF')
   })

   it('warns that the file was read by layout rather than by language', () => {
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]?.message).toMatch(/column layout/)
      expect(result.warnings[0]?.line).toBe(1)
   })

   it('recovers trades from the shape of the description alone', () => {
      const buy = result.movements[0]
      expect(buy?.kind).toBe('buy')
      if (buy?.kind === 'buy') {
         expect(buy.quantity).toBe(1060)
         expect(buy.unitPrice?.toString()).toBe('106.02 CHF')
         expect(buy.isin).toBe('CH0019852802')
      }

      expect(result.movements[1]?.kind).toBe('sell')
   })

   it('recovers an FX pair trade and its settlement leg', () => {
      const fx = result.movements[4]
      expect(fx?.kind).toBe('fxTrade')
      if (fx?.kind === 'fxTrade') {
         expect(fx.pair).toBe('EUR/CHF')
         expect(fx.quantity).toBe(1900)
         expect(fx.rate?.toString()).toBe('0.9412 CHF')
         expect(fx.settlement).toBe(true)
      }
   })

   it('leaves descriptions it cannot read as unknown, never dropping the row', () => {
      expect(result.movements[3]?.kind).toBe('unknown')
      expect(result.movements[3]?.amount?.toString()).toBe('9000 CHF')
   })
})

describe('a semicolon-delimited export', () => {
   const csv = [
      'Datum;Tijd;Valutadatum;Product;ISIN;Omschrijving;FX;Mutatie;;Saldo;;Order Id',
      '18-11-2024;00:00;18-11-2024;;;Storting;;CHF;"9.000,00";CHF;"9.000,00";',
      '',
   ].join('\n')

   it('retries the delimiter when the header tokenizes to one cell', () => {
      const result = parseDegiroCsv(csv)
      expect(result.dialect.id).toBe('nl')
      expect(result.records).toHaveLength(1)
      expect(result.records[0]?.balance?.toString()).toBe('9000 CHF')
   })

   it('does not second-guess an explicit delimiter', () => {
      expect(() => parseDegiroCsv(csv, { delimiter: ',' })).toThrow(UnknownDialectError)
   })
})

describe('extensibility: a custom dialect and custom matchers', () => {
   const dutchDialect: Dialect = {
      id: 'nl',
      label: 'DEGIRO Dutch (custom)',
      columns: frenchDialect.columns,
      matches: (header) =>
         ['Datum', 'Tijd', 'Product', 'ISIN', 'Omschrijving', 'Mutatie', 'Saldo'].every((t) =>
            header.map((c) => c.trim()).includes(t),
         ),
      parseDecimal: (raw) => {
         const normalized = raw.trim().replace(/\./g, '').replace(',', '.')
         if (normalized === '') {
            return null
         }
         return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null
      },
      parseDateTime: parseFrenchDateTime,
      parseDate: (date) => parseFrenchDateTime(date),
   }

   const TRADE = /^(Koop|Verkoop)\s+(\d+)\s+.*@([\d,]+)\s+([A-Z]{3})\s+\(([^)]*)\)$/
   const dutchTradeMatcher: Matcher = {
      name: 'nl-trade',
      match({ record }) {
         const m = TRADE.exec(record.description.trim())
         if (!m) {
            return null
         }
         const side = m[1] === 'Koop' ? 'buy' : 'sell'
         return {
            kind: side,
            side,
            quantity: Number(m[2]),
            unitPrice: new Money(m[3]!.replace(',', '.'), m[4]!),
            product: record.product,
            isin: record.isin ?? (m[5] || null),
            orderId: record.orderId,
            amount: record.mutation,
            record,
         }
      },
   }
   const dutchDepositMatcher: Matcher = {
      name: 'nl-deposit',
      match({ record }) {
         if (record.description.trim() !== 'Storting') {
            return null
         }
         return { kind: 'deposit', amount: record.mutation, record }
      },
   }

   const dutchCsv = [
      'Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,,Saldo,,Order Id',
      '20-11-2024,09:01,20-11-2024,SMI,CH0019852802,"Koop 10 SMI@106,02 CHF (CH0019852802)",,CHF,"-1.060,20",CHF,"7.939,80",o1',
      '14-11-2024,08:37,13-11-2024,,,Storting,,CHF,"9.000,00",CHF,"9.000,00",',
      '',
   ].join('\n')

   it('parses a foreign-format export via injected dialect + classifier', () => {
      const classifier = new ClassifierRegistry([dutchTradeMatcher, dutchDepositMatcher])
      const result = parseDegiroCsv(dutchCsv, {
         dialects: [dutchDialect],
         classifier,
      })

      expect(result.dialect.id).toBe('nl')
      expect(result.movements).toHaveLength(2)

      const buy = result.movements.find((m) => m.kind === 'buy')
      expect(buy?.kind).toBe('buy')
      if (buy?.kind === 'buy') {
         expect(buy.quantity).toBe(10)
         expect(buy.unitPrice?.toString()).toBe('106.02 CHF')
         expect(buy.isin).toBe('CH0019852802')
      }

      expect(result.movements.some((m) => m.kind === 'deposit')).toBe(true)

      // The custom output flows through grouping and reconciliation unchanged.
      expect(result.transactions.length).toBeGreaterThan(0)
      expect(reconcileBalances(result.movements).ok).toBe(true)
   })
})

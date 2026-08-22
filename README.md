<h1 align="center">libdegiro</h1>

<p align="center">
  Parse DEGIRO broker <strong>Account.csv</strong> exports into a typed, extensible domain model.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/libdegiro"><img src="https://img.shields.io/npm/v/libdegiro?logo=npm&logoColor=white&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/nyg/libdegiro/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/nyg/libdegiro/ci.yml?branch=master&logo=github&label=CI" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/libdegiro"><img src="https://img.shields.io/npm/types/libdegiro?logo=typescript&logoColor=white" alt="TypeScript types included"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/libdegiro?color=blue" alt="MIT licence"></a>
</p>

<p align="center">
  <strong><a href="https://nyg.github.io/libdegiro/">Live demo</a></strong>
  ·
  <a href="#install">Install</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#domain-model">Domain model</a>
  ·
  <a href="#extensibility">Extensibility</a>
</p>

---

A modern, ESM-only TypeScript library that turns a DEGIRO account statement into strongly-typed **movements** and grouped **transactions**, with exact-decimal money, balance reconciliation, and portfolio roll-ups. Every stage of the pipeline is pluggable, so new locales, movement types and grouping rules are easy to add.

- 🧮 **Exact money** with [`big.js`](https://github.com/MikeMcl/big.js) — no float drift
- 🧩 **Extensible** dialects, classifiers and grouping strategies
- 🌐 **French and English exports** out of the box, whatever number format they carry
- 🧠 **Typed domain model** — discriminated unions for movements & transactions
- 🪶 **Lenient parsing** — per-row problems are collected, never thrown
- 🌊 **Streaming** parser for very large files
- ✅ **Balance reconciliation** and **portfolio** aggregation built in
- 🌍 **Runs anywhere** — one isomorphic build for browsers, Node, Deno and workers; Node I/O is opt-in

---

## Install

```sh
pnpm add libdegiro      # or: npm i libdegiro / yarn add libdegiro
```

ESM only.

### Entry points

| Import           | Contents                                                 | Requires          |
| ---------------- | -------------------------------------------------------- | ----------------- |
| `libdegiro`      | Parsing, classification, grouping, validation, portfolio | Node or a browser |
| `libdegiro/node` | File and stream helpers                                  | Node 18+          |

Anything touching `node:fs` or `node:stream` lives behind `libdegiro/node` — import it only where you have a filesystem.

`libdegiro` itself imports no Node builtin, and neither does anything it depends on. CSV tokenizing goes through [`papaparse`](https://github.com/mholt/PapaParse), which publishes a `browser` field pointing at an 18 KB build free of `Buffer` and `require`, so `dist/index.js` is a single isomorphic bundle: Vite, webpack and rollup substitute that build with no configuration, while Node, Deno and edge runtimes load the same file and the same parser. There is no second build, and no export condition anyone has to resolve.

The claim is tested rather than asserted: `test/entrypoints.test.ts` runs `dist/index.js` in a child process with `globalThis.Buffer` deleted and parses the full fixture.

## Quick start

```ts
import { parseDegiroCsv } from 'libdegiro';

const result = parseDegiroCsv(csvText);

console.log(result.movements.length); // one per statement row
console.log(result.transactions.length); // related rows grouped together
console.log(result.errors); // collected issues (lenient)

for (const tx of result.transactions) {
  if (tx.type === 'trade') {
    console.log(tx.side, tx.quantity, tx.product, tx.isin);
  }
}
```

### From a file (Node)

```ts
import { parseDegiroFile, parseDegiroFileSync } from 'libdegiro/node';

const result = await parseDegiroFile('./Account.csv');
const sync = parseDegiroFileSync('./Account.csv');
```

### From a stream (Node, large files)

```ts
import { createReadStream } from 'node:fs';
import { parseDegiroStream } from 'libdegiro/node';

const result = await parseDegiroStream(createReadStream('./Account.csv'));
```

## The result

`parseDegiroCsv` returns a `ParseResult`:

| Field                            | Description                                                   |
| -------------------------------- | ------------------------------------------------------------- |
| `dialect`                        | The dialect used to interpret the file                        |
| `records`                        | Normalised rows (`RawRecord[]`), in file order (newest first) |
| `movements`                      | One classified `Movement` per record                          |
| `transactions`                   | Composite `Transaction[]`, sorted newest first                |
| `issues` / `errors` / `warnings` | Collected `ParseIssue`s (lenient parsing)                     |

Parsing is **lenient**: a row with an unparseable date is dropped and reported as an `error`; a partially-parseable amount becomes a `warning`. The only thrown conditions are an empty input and a header that matches no dialect (`UnknownDialectError`).

## Supported exports

DEGIRO localizes the **header row** of `Account.csv` to the interface language, and a built-in dialect recognises it:

| Dialect          | `id` | Header                                                                            |
| ---------------- | ---- | --------------------------------------------------------------------------------- |
| `frenchDialect`  | `fr` | `Date,Heure,Date de,Produit,Code ISIN,Description,FX,Mouvements,,Solde,,ID Ordre` |
| `englishDialect` | `en` | `Date,Time,Value date,Product,ISIN,Description,FX,Change,,Balance,,Order Id`      |

Both share the positional column layout and `DD-MM-YYYY` dates. They differ in how they read numbers: `frenchDialect` expects space thousands separators and a comma decimal mark, while `englishDialect` accepts either that or the US `1,060.20` form — DEGIRO does **not** switch the body of the file to English number formatting when you switch the interface language, so an English export can carry either. When a value contains both `,` and `.`, the last one is the decimal mark; a lone separator is a decimal mark unless the value is a run of exact 3-digit groups (`1,060,200`).

Descriptions are a separate axis: switching the interface language rewrites the header but leaves the description text alone, so an English-header export from a French account still says `Frais DEGIRO de courtage`. The built-in matchers therefore recognise both languages regardless of which dialect read the header. Anything they do not recognise becomes an `unknown` movement — never a dropped row.

## Domain model

### Movements

Each row is classified into a `Movement` — a discriminated union on `kind`:

`buy` · `sell` · `dividend` · `dividendTax` · `capitalReturn` · `brokerageFee` · `connectivityFee` · `interest` · `fxCredit` · `fxDebit` · `fxTrade` · `cashSweep` · `cashTransfer` · `deposit` · `withdrawal` · `unknown`

```ts
for (const m of result.movements) {
  switch (m.kind) {
    case 'buy':
    case 'sell':
      console.log(m.side, m.quantity, '@', m.unitPrice?.toString());
      break;
    case 'dividend':
      console.log('dividend', m.amount?.toString(), m.isin);
      break;
    case 'fxTrade':
      console.log(m.pair, m.rate?.toString(), m.settlement);
      break;
  }
}
```

Unrecognised rows are never dropped — they classify as `unknown` and keep their `record`, so nothing is lost.

### Transactions

Related rows are grouped into a `Transaction` (discriminated union on `type`):

- **`trade`** — a security order: buy/sell legs + brokerage `fees` + `fxConversions`
- **`fxTrade`** — a currency-pair order (e.g. `EUR/CHF`)
- **`fxConversion`** — a standalone credit/debit conversion (no order id)
- **`cashSweep`** — a cash sweep paired with its transfer mirror
- **`single`** — a standalone movement (dividend, interest, deposit, …)
- **`composite`** — an order group that is neither a trade nor an FX trade

Grouping is primarily by DEGIRO **order id**, with heuristics for order-less FX conversion pairs and cash-sweep pairs.

> Amounts are intentionally **not** netted across currencies (fees are often in EUR while a trade settles in CHF). Use the legs for currency-aware maths.

## Money

`Money` wraps `big.js` for exact decimal arithmetic:

```ts
import { Money } from 'libdegiro';

const a = Money.of('0.1', 'EUR');
const b = Money.of('0.2', 'EUR');
a.add(b).toString(); // "0.3 EUR"   (no float drift)
a.add(b).amount; // Big instance
a.toNumber(); // 0.1 (lossy — prefer .amount)

a.add(Money.of('1', 'CHF')); // throws CurrencyMismatchError
```

## Balance reconciliation

Verify that each per-currency running balance (`Solde`) is internally consistent:

```ts
import { parseDegiroCsv, reconcileBalances } from 'libdegiro';

const { movements } = parseDegiroCsv(csvText);
const report = reconcileBalances(movements);

report.ok; // true when nothing beyond rounding failed to reconcile
report.exact; // true when every transition matched to the last decimal
report.rounding; // gaps the statement's own rounding explains
report.unexplained; // gaps it does not — the ones worth acting on
report.discrepancies; // both kinds, flattened across currencies
report.byCurrency; // per-currency opening/closing balances + checks
```

DEGIRO statements interleave **two** balance streams per currency: the DEGIRO trading account and the flatexDEGIRO **cash** account. The cash-transfer (`Virement … Compte Espèces`) rows report the cash account; the reconciler accounts for this automatically (`vers` adds, `depuis` subtracts).

**Not every gap is a bug.** A statement rounds `37 × 41,305 = 1528,285` down to `-1528,28` in its amount column and up to `-1528,29` in its balance column, so its two columns describe the same purchase one centime apart. Gaps no wider than `roundingTolerance` (default `0.01`) are classified `rounding` and leave `ok` true; set it to `0` to treat every gap as unexplained.

Each discrepancy carries the whole transition, not just the difference — both line numbers, the previous balance, what the amount column claimed, what the balance column actually applied, and `exactAmount` (quantity × unit price) when the row is a trade. That is what distinguishes a misclassified row from a statement quirk:

```ts
const [entry] = report.discrepancies;

entry.kind; // 'rounding' | 'unexplained'
entry.line; // 5
entry.previousLine; // 6
entry.previousBalance; // 28283.84 CHF
entry.statedMutation; // -1528.28 CHF — what the amount column says
entry.appliedMutation; // -1528.29 CHF — what the balance column did
entry.exactAmount; // -1528.285 CHF — quantity × unit price
entry.difference; // -0.01 CHF
```

## Portfolio summary

```ts
import { parseDegiroCsv, summarizePortfolio } from 'libdegiro';

const { movements } = parseDegiroCsv(csvText);
const summary = summarizePortfolio(movements);

summary.positions; // net quantity per ISIN
summary.cashByCurrency; // latest trading balance per currency
summary.dividends; // totals per currency
summary.fees; // brokerage + connectivity totals
summary.realizedPnl; // FIFO realized P/L per ISIN
summary.openCost; // cost basis of the shares still held, per ISIN
summary.invested; // the same, totalled per currency
summary.deposits; // money in from outside the account
summary.withdrawals; // money out to outside it, kept negative
summary.netExternalFlow; // deposits + withdrawals
```

Deposits and withdrawals are split by the **sign** of the mutation, not by the description: DEGIRO books a withdrawal as a negative `Versement de fonds` at least as often as it names it `Retrait de fonds`. Internal sweeps to the flatexDEGIRO cash account are excluded — they move money between two accounts you own.

Individual helpers (`computePositions`, `computeRealizedPnl`, `computeOpenCost`, `cashByCurrency`, `externalFlows`, `sumByCurrency`) are exported too.

`openCost` is what the unsold lots were bought for, not a valuation — no statement carries a current price. It is `null` under the same conditions as realized P/L.

> **FIFO realized P/L is best-effort.** It returns `null` for an instrument whose history is multi-currency, incomplete within the statement window, or missing a price — rather than guessing.

## Extensibility

Every stage is pluggable. You rarely need to fork the library to support a new export.

### Custom dialect (new locale / layout)

French and English are built in; here is a third locale — Dutch headers, dot thousands, comma decimals:

```ts
import { parseDegiroCsv, DEGIRO_COLUMNS, parseDegiroDateTime, type Dialect } from 'libdegiro';

const dutchDialect: Dialect = {
  id: 'nl',
  label: 'DEGIRO Dutch',
  columns: DEGIRO_COLUMNS, // the shared positional layout
  matches: (header) => header.includes('Omschrijving') && header.includes('Mutatie'),
  parseDecimal: (raw) => {
    const n = raw.trim().replace(/\./g, '').replace(',', '.'); // 1.060,20
    return /^-?\d+(\.\d+)?$/.test(n) ? n : null;
  },
  parseDateTime: parseDegiroDateTime,
  parseDate: (d) => parseDegiroDateTime(d),
};

parseDegiroCsv(csv, { dialects: [dutchDialect] });
// or force it, skipping detection:
parseDegiroCsv(csv, { dialect: dutchDialect });
```

A dialect registered through `dialects` replaces the built-ins; pass `createDefaultDialectRegistry().register(dutchDialect)` to keep them.

### Custom classifier (new movement description)

```ts
import { createDefaultClassifierRegistry, type Matcher } from 'libdegiro';

const referralMatcher: Matcher = {
  name: 'referral-bonus',
  priority: 100, // evaluated before built-ins
  match: ({ record }) =>
    /^Récompense de parrainage/i.test(record.description)
      ? { kind: 'deposit', amount: record.mutation, record }
      : null,
};

const classifier = createDefaultClassifierRegistry().register(referralMatcher);
parseDegiroCsv(csv, { classifier });
```

Matchers are evaluated by descending `priority`, then registration order; the first to return a movement wins. Records that match nothing become `unknown`.

### Custom grouping strategy

```ts
import { parseDegiroCsv, orderIdStrategy, singletonStrategy } from 'libdegiro';

parseDegiroCsv(csv, {
  groupingStrategies: [orderIdStrategy /* your strategy */, , singletonStrategy],
});
```

The built-in helpers — `tokenizeCsv`, `mapRow`, `parseTradeDescription`, `DialectRegistry`, `ClassifierRegistry`, the individual matchers and strategies — are all exported so you can compose your own pipeline.

## Example: a browser dashboard

[`examples/dashboard`](examples/dashboard) is a single-page app that turns an `Account.csv` into a dashboard of fees, cash, positions and income — running entirely in the browser, with a content security policy that blocks all network access. It is live at https://nyg.github.io/libdegiro/.

```sh
pnpm dashboard:dev
```

It consumes `libdegiro` as a workspace dependency through the published `exports` map, so it exercises the browser path the way a real consumer would.

## Notes & caveats

- The statement carries no timezone; times are parsed as **UTC** wall-clock for deterministic, machine-independent results.
- Rows are **newest-first** in the export; `records`/`movements` preserve that order, while `transactions` are sorted by booking date (newest first).
- Only `big.js` and `papaparse` are runtime dependencies. papaparse's Node stream API is reached only via `libdegiro/node`; browser bundlers pick up its 18 KB browser build on their own.

## Development

```sh
pnpm install
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # tsdown -> dist/ (ESM + .d.ts + sourcemaps)
```

### Test fixture

`test/fixtures/Account.csv` is a **synthetic** statement, not a real export. It mirrors the shape of a genuine French DEGIRO file — column layout, movement types, order-id grouping, French decimals with `U+202F` thousands separators, double-spaced product names — and its running balances reconcile exactly, but every figure, date, ISIN and order id is fabricated. `test/fixtures/Account-en.csv` is the same statement behind an English header, which is exactly what DEGIRO produces when you switch the interface language. Drop your own `Account.csv` at the repo root to try the library against real data; it is git-ignored.

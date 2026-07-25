# libdegiro

> Parse DEGIRO broker **Account.csv** exports into a typed, extensible domain model.

A modern, ESM-only TypeScript library that turns a DEGIRO account statement into
strongly-typed **movements** and grouped **transactions**, with exact-decimal
money, balance reconciliation, and portfolio roll-ups. Every stage of the
pipeline is pluggable, so new locales, movement types and grouping rules are easy
to add.

- 🧮 **Exact money** with [`big.js`](https://github.com/MikeMcl/big.js) — no float drift
- 🧩 **Extensible** dialects, classifiers and grouping strategies
- 🧠 **Typed domain model** — discriminated unions for movements & transactions
- 🪶 **Lenient parsing** — per-row problems are collected, never thrown
- 🌊 **Streaming** parser for very large files
- ✅ **Balance reconciliation** and **portfolio** aggregation built in

---

## Install

```sh
pnpm add libdegiro      # or: npm i libdegiro / yarn add libdegiro
```

Requires Node 18+. ESM only.

---

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

### From a file

```ts
import { parseDegiroFile, parseDegiroFileSync } from 'libdegiro';

const result = await parseDegiroFile('./Account.csv');
const sync = parseDegiroFileSync('./Account.csv');
```

### From a stream (large files)

```ts
import { createReadStream } from 'node:fs';
import { parseDegiroStream } from 'libdegiro';

const result = await parseDegiroStream(createReadStream('./Account.csv'));
```

---

## The result

`parseDegiroCsv` returns a `ParseResult`:

| Field                            | Description                                                   |
| -------------------------------- | ------------------------------------------------------------- |
| `dialect`                        | The dialect used to interpret the file                        |
| `records`                        | Normalised rows (`RawRecord[]`), in file order (newest first) |
| `movements`                      | One classified `Movement` per record                          |
| `transactions`                   | Composite `Transaction[]`, sorted newest first                |
| `issues` / `errors` / `warnings` | Collected `ParseIssue`s (lenient parsing)                     |

Parsing is **lenient**: a row with an unparseable date is dropped and reported as
an `error`; a partially-parseable amount becomes a `warning`. The only thrown
conditions are an empty input and a header that matches no dialect
(`UnknownDialectError`).

---

## Domain model

### Movements

Each row is classified into a `Movement` — a discriminated union on `kind`:

`buy` · `sell` · `dividend` · `dividendTax` · `capitalReturn` · `brokerageFee` ·
`connectivityFee` · `interest` · `fxCredit` · `fxDebit` · `fxTrade` · `cashSweep` ·
`cashTransfer` · `deposit` · `unknown`

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

Unrecognised rows are never dropped — they classify as `unknown` and keep their
`record`, so nothing is lost.

### Transactions

Related rows are grouped into a `Transaction` (discriminated union on `type`):

- **`trade`** — a security order: buy/sell legs + brokerage `fees` + `fxConversions`
- **`fxTrade`** — a currency-pair order (e.g. `EUR/CHF`)
- **`fxConversion`** — a standalone credit/debit conversion (no order id)
- **`cashSweep`** — a cash sweep paired with its transfer mirror
- **`single`** — a standalone movement (dividend, interest, deposit, …)
- **`composite`** — an order group that is neither a trade nor an FX trade

Grouping is primarily by DEGIRO **order id**, with heuristics for order-less FX
conversion pairs and cash-sweep pairs.

> Amounts are intentionally **not** netted across currencies (fees are often in
> EUR while a trade settles in CHF). Use the legs for currency-aware maths.

---

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

---

## Balance reconciliation

Verify that each per-currency running balance (`Solde`) is internally consistent:

```ts
import { parseDegiroCsv, reconcileBalances } from 'libdegiro';

const { movements } = parseDegiroCsv(csvText);
const report = reconcileBalances(movements);

report.ok; // true when everything reconciles
report.discrepancies; // [{ currency, line, expected, actual, difference }]
report.byCurrency; // per-currency opening/closing balances + checks
```

DEGIRO statements interleave **two** balance streams per currency: the DEGIRO
trading account and the flatexDEGIRO **cash** account. The cash-transfer
(`Virement … Compte Espèces`) rows report the cash account; the reconciler
accounts for this automatically (`vers` adds, `depuis` subtracts).

---

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
```

Individual helpers (`computePositions`, `computeRealizedPnl`, `cashByCurrency`,
`sumByCurrency`) are exported too.

> **FIFO realized P/L is best-effort.** It returns `null` for an instrument whose
> history is multi-currency, incomplete within the statement window, or missing a
> price — rather than guessing.

---

## Extensibility

Every stage is pluggable. You rarely need to fork the library to support a new
export.

### Custom dialect (new locale / layout)

```ts
import { parseDegiroCsv, frenchDialect, parseFrenchDateTime, type Dialect } from 'libdegiro';

const englishDialect: Dialect = {
  id: 'en',
  label: 'DEGIRO English',
  columns: frenchDialect.columns, // same positional layout
  matches: (header) => header.includes('Change') && header.includes('Balance'),
  parseDecimal: (raw) => {
    const n = raw.trim().replace(/,/g, ''); // US thousands
    return /^-?\d+(\.\d+)?$/.test(n) ? n : null;
  },
  parseDateTime: parseFrenchDateTime,
  parseDate: (d) => parseFrenchDateTime(d),
};

parseDegiroCsv(csv, { dialects: [englishDialect] });
// or force it, skipping detection:
parseDegiroCsv(csv, { dialect: englishDialect });
```

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

Matchers are evaluated by descending `priority`, then registration order; the
first to return a movement wins. Records that match nothing become `unknown`.

### Custom grouping strategy

```ts
import { parseDegiroCsv, orderIdStrategy, singletonStrategy } from 'libdegiro';

parseDegiroCsv(csv, {
  groupingStrategies: [orderIdStrategy /* your strategy */, , singletonStrategy],
});
```

The built-in helpers — `tokenizeCsv`, `mapRow`, `parseTradeDescription`,
`DialectRegistry`, `ClassifierRegistry`, the individual matchers and strategies —
are all exported so you can compose your own pipeline.

---

## Notes & caveats

- The statement carries no timezone; times are parsed as **UTC** wall-clock for
  deterministic, machine-independent results.
- Rows are **newest-first** in the export; `records`/`movements` preserve that
  order, while `transactions` are sorted by booking date (newest first).
- Only `big.js` and `csv-parse` are runtime dependencies.

---

## Development

```sh
pnpm install
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm build        # tsup -> dist/ (ESM + .d.ts + sourcemaps)
```

### Test fixture

`test/fixtures/Account.csv` is a **synthetic** statement, not a real export. It
mirrors the shape of a genuine French DEGIRO file — column layout, movement
types, order-id grouping, French decimals with `U+202F` thousands separators,
double-spaced product names — and its running balances reconcile exactly, but
every figure, date, ISIN and order id is fabricated. Drop your own `Account.csv`
at the repo root to try the library against real data; it is git-ignored.

## License

MIT

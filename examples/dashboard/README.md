# DEGIRO statement dashboard

A single-page dashboard for a DEGIRO `Account.csv`, built on
[libdegiro](../../README.md). Drop in a statement and get your fees, cash,
positions, income and activity — **entirely in the browser**.

Live at **https://nyg.github.io/libdegiro/**.

---

## Nothing leaves your browser

This is enforced, not just promised:

- The production build ships a `Content-Security-Policy` meta tag with
  `default-src 'none'` and **`connect-src 'none'`**, which blocks every fetch,
  XHR, WebSocket and beacon the page could attempt. Open the Network tab: after
  the page's own HTML, JS and CSS load, there is nothing.
- There is no backend. GitHub Pages serves static files and receives no data.
- The sample statement is inlined at build time rather than fetched.
- In development the CSP would break HMR, so instead `main.tsx` replaces
  `fetch`, `XMLHttpRequest` and `sendBeacon` with functions that throw. Any
  dependency that tries to phone home fails on the first dev run.

Two honest limitations: `frame-ancestors` cannot be set from a meta tag and
Pages cannot send headers, so this page has no clickjacking protection; and a
CSP constrains the page, not a browser extension.

**Storage is opt-in.** Nothing is written unless you tick "Remember on this
device", which stores the raw CSV text in IndexedDB and restores it next visit.
Untick it, or press Forget, and it is deleted immediately.

---

## What it shows

**Fees** is the centrepiece — per-currency totals split into brokerage and
annual exchange connectivity, a plain-English summary, monthly and cumulative
charts, cost by instrument, and a table matching **every** fee to the order that
caused it.

Also: an overview of cash, deposits, dividends and interest; cash balance over
time per currency; positions with FIFO realised P/L; income year by year;
a filterable activity log where a trade appears with its fee and FX legs
attached; and a parse-health panel with balance reconciliation.

### What it deliberately does not show

- **No unrealised profit or loss, and no portfolio value.** An account statement
  records cash movements, not market prices. Showing a current value would mean
  fetching prices, which would break the promise above.
- **No cross-currency totals.** DEGIRO books fees in EUR against trades that
  settle in CHF, and libdegiro never nets across currencies. Neither does this
  app: every total is per currency, and a fee-as-percent-of-trade is shown only
  when both sides share a currency. Otherwise you get a dash and an explanation
  rather than a number derived from a rate we do not have.

---

## Running it

```bash
pnpm install
pnpm dev
```

From **this directory** (`examples/dashboard`):

```bash
pnpm dev          # dev server
pnpm build        # production build -> dist/
pnpm preview      # serve the production build
pnpm test         # analytics unit tests
pnpm typecheck
```

The same things are reachable from the **repo root** under a `dashboard:`
prefix, since the root package has its own `dev`, `build` and `test`:

```bash
pnpm dashboard:dev
pnpm dashboard:build
pnpm dashboard:test
pnpm dashboard:typecheck
```

`dev` and `build` build `libdegiro` first, so a stale or missing `dist/` cannot
break the app.

The app depends on `libdegiro` as a workspace package and resolves it through
the published `exports` map — not through a source alias. That is deliberate: it
means the example exercises the `browser` export condition exactly as a real
consumer would. A source alias would have hidden the `Buffer` bug that made the
library unusable in browsers.

### Deploying

Pushing to `master` triggers `.github/workflows/pages.yml`. **One manual step is
required once**: repo Settings → Pages → Source → **GitHub Actions**. Without
it the first deploy fails with an unhelpful "Not Found".

---

## Design notes

Some decisions that look like they could be simplified, but should not be:

- **Parsing does not run in a Web Worker.** `Money` wraps `Big`, and
  `structuredClone` across `postMessage` strips class prototypes — the worker
  would return `{s, e, c}` objects with no `.add()`. The sample parses in a few
  milliseconds.
- **IndexedDB stores the raw CSV, never the parsed result**, for the same
  reason: structured clone would destroy every `Money`.
- **`Money` never enters a Recharts `data` array.** Recharts serialises and
  diffs its data, and `Big` has no `toJSON`. Charts take plain numbers from an
  adapter; the exact values stay in the analytics layer.
- **All dates are UTC.** The statement carries no timezone and libdegiro builds
  dates with `Date.UTC`. A single `getMonth()` instead of `getUTCMonth()` would
  move fees booked early on the 1st into the previous month for anyone west of
  UTC-10. Everything goes through `lib/format.ts`.
- **`src/lib/analytics/**` imports nothing from React**, which is what lets the
  whole layer be tested headlessly.

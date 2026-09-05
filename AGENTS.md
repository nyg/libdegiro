# AGENTS.md

`libdegiro` is an ESM-only TypeScript library that parses DEGIRO `Account.csv` account statements into typed movements and grouped transactions. `examples/dashboard` is a React SPA that consumes the published package the way a real consumer would. This file is the working brief for agents; `README.md` is the user-facing documentation and stays authoritative on the public API.

## Setup

pnpm workspace, pnpm 11.x, Node 26.x (CI pins 11.22.0 / 26.7.0). No `engines` field, so nothing enforces this locally.

```sh
pnpm install
```

## Commands

| Command                    | What it does                                            |
| -------------------------- | ------------------------------------------------------- |
| `pnpm test`                | `pnpm build` then `vitest run` over `test/**`           |
| `pnpm typecheck`           | `tsc --noEmit` over `src`, `test`, root `*.ts`          |
| `pnpm lint`                | ESLint over the whole workspace, dashboard included     |
| `pnpm build`               | Clean `dist/`, then tsdown → ESM + `.d.ts` + sourcemaps |
| `pnpm format`              | Prettier write                                          |
| `pnpm dashboard:dev`       | Build the library, then the Vite dev server             |
| `pnpm dashboard:build`     | Build the library, then the production SPA bundle       |
| `pnpm dashboard:test`      | Dashboard analytics tests (separate vitest project)     |
| `pnpm dashboard:typecheck` | `tsc --noEmit` inside `examples/dashboard`              |

Run `pnpm lint && pnpm typecheck && pnpm test` before proposing a change; that is exactly what CI runs, plus `pnpm build` and the two `dashboard:` checks. The root test run does not cover `examples/dashboard`, so run `dashboard:typecheck` and `dashboard:test` too whenever a change touches it.

`pnpm test` builds first on purpose: `test/entrypoints.test.ts` executes `dist/index.js` in a child process with `globalThis.Buffer` deleted, so it asserts against the built artefact, not the sources.

## Layout

```
src/
  csv/         tokenizer (papaparse) + Node row stream + shared options
  dialects/    Dialect interface, French/English/layout-fallback dialects, DialectRegistry
  records/     RawRecord — a normalised, dialect-agnostic row
  classify/    Matcher registry + matchers (trade, fx, dividend, fees, interest, cash, structural)
  group/       GroupingStrategy pipeline + Transaction union
  validate/    per-currency balance reconciliation
  portfolio/   positions, FIFO realized P/L, cash and fee roll-ups
  money/       Money — big.js wrapper, exact decimals
  fx/          RateTable + convert + an ECB daily-rate table, pure, no I/O
  io/          file helpers (Node only)
  index.ts     browser-safe entry
  node.ts      `libdegiro/node` entry — everything touching node: builtins
  internal.ts  ParseOptions/ParseResult + shared assembly, not exported publicly
test/          vitest suites + synthetic fixture
examples/dashboard/
  src/lib/analytics/   pure, React-free analytics — where the logic lives
  src/components/      app shell, sections, charts, shadcn `ui/` primitives
  src/state/           statement context and provider
  test/                analytics unit tests
```

The pipeline is `tokenizeCsv` → `mapRow` (dialect) → `ClassifierRegistry.classify` → `groupMovements` (strategy list) → optional `reconcileBalances` / `summarizePortfolio`. Every stage is swappable through `ParseOptions`; adding a locale, a description or a grouping rule should mean registering something, never editing a `switch`.

Header language, number format and description language are three independent axes of a DEGIRO export — changing the interface language rewrites line 1 and nothing else. Keep them independent in code: dialects own the header and the number/date formats, matchers own the wording, and neither may assume the other. `genericDialect` closes the set by matching the column layout alone; anything heuristic sets `heuristic: true` so `ParseResult.warnings` can say so.

## Rules that are load-bearing

- **The root entry imports no Node builtin.** `src/index.ts` and everything it reaches must stay free of `node:*`; anything needing a filesystem or streams goes behind `src/node.ts`. `test/entrypoints.test.ts` guards this and has caught a regression before.
- **Parsing is lenient.** Per-row problems become `ParseIssue`s on `errors`/`warnings`. Only an empty input and an unmatched header throw. Do not add throws to the row path.
- **Never net amounts across currencies.** DEGIRO books fees in EUR against trades settled in CHF. Totals are per currency, everywhere, including the dashboard. The one exception is explicit and opt-in: given a `RateTable`, the FIFO walk and the fee ratio convert each leg on its own booking date, and every figure that came out of a rate is flagged `converted` and marked `≈` in the UI. A converted figure never replaces a booked one — it only fills a cell that would otherwise read `n/a`.
- **All dates are UTC.** The statement carries no timezone; `Date.UTC` is used deliberately. In the dashboard, use `getUTC*` — a bare `getMonth()` shifts fees across month boundaries for anyone west of UTC.
- **`Money` never crosses a structured-clone boundary.** No Web Worker, no `postMessage`, and IndexedDB stores raw CSV text rather than a parsed result — cloning strips the class prototype and leaves inert `Big` internals. Charts receive plain numbers from an adapter.
- **The dashboard talks to exactly one host, and never about a statement.** The production build injects a CSP whose `connect-src` names `https://api.frankfurter.dev` and nothing else; dev mode replaces `fetch` with a stub that throws for every other URL, and `XMLHttpRequest` and `sendBeacon` with stubs that always throw. That one request carries a date range and a list of currency codes — never an ISIN, an amount or a holding — and only when the FX setting is on. Widening `connect-src`, or sending anything statement-derived to it, breaks the app's central promise.
- **The dashboard resolves `libdegiro` through the exports map**, not a source alias. Keep it that way; the alias would hide browser-compat bugs. Rebuild the library after changing `src/` before checking the app.

## Conventions

- TypeScript is strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Type-only imports must use `import type` — `@typescript-eslint/consistent-type-imports` is an error, not a warning.
- Prettier: single quotes, semicolons, trailing commas, 100 columns. `.csv` fixtures and `CHANGELOG.md` are excluded and must not be reformatted.
- `examples/**/components/ui/**` is generated by the shadcn CLI and kept verbatim so it stays upgradable; two lint rules are disabled there. Do not hand-edit those files.
- `test/fixtures/Account.csv` is synthetic but byte-sensitive: French decimals, `U+202F` thousands separators, double-spaced product names, and running balances that reconcile exactly. Editing it usually means fixing the balances too. `test/fixtures/Account-en.csv` is the same body behind the English header; keep the two bodies identical, since a test asserts they classify the same. Both are unignored by name in `.gitignore`. A real `Account.csv` at the repo root is git-ignored.
- New behaviour needs a test in `test/` (library) or `examples/dashboard/test/` (analytics). The analytics layer imports nothing from React precisely so it stays testable headlessly.

## Git and PRs

- Conventional commits, since `git-cliff` builds `CHANGELOG.md` from them. Recognised types: `security`, `feat`, `fix`, `refactor`, `doc`, `perf`, `style`, `test`, `chore`, `ci`, `build`, `revert`. Scope commits that touch the example with `(dashboard)`.
- Squash-merge to `master`, so the **PR title** is the commit message that reaches the changelog. Write it accordingly.
- Releases are manual: the `Release` workflow is `workflow_dispatch` only, runs from `master`, bumps the version, regenerates the changelog, tags, and publishes to npm. Never bump `version` in `package.json` by hand.
- Pushing to `master` redeploys the dashboard to GitHub Pages when it touches `examples/dashboard/**`, `src/**`, the fixture, or the build config.

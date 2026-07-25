import { defineConfig, type Options } from 'tsup';

// `clean` is deliberately unset on both configs: tsup builds an array of configs
// in parallel, so a clean in one would race the other's output. `pnpm build`
// clears dist/ first instead.
const shared = {
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  treeshake: true,
  minify: false,
} satisfies Options;

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts', 'src/node.ts'],
    dts: true,
    // Share the parsing core between the two entries instead of duplicating it.
    splitting: true,
  },
  {
    ...shared,
    // Browser build of the root entry. `csv-parse/sync` imports no Node builtin
    // but uses the `Buffer` global -- csv-parse/lib/api/index.js evaluates
    // `Buffer.from(...)` at module scope, so it throws on import in a browser.
    // The browser build csv-parse ships inlines a buffer shim instead.
    entry: { 'index.browser': 'src/index.ts' },
    // dist/index.d.ts already describes this entry.
    dts: false,
    splitting: false,
    // Stops tsup's own `external` plugin from claiming the specifier, so the
    // plugin below gets a turn at resolving it. (`esbuildOptions.alias` does not
    // work here for the same reason: the external plugin resolves first.)
    noExternal: [/^csv-parse\/sync$/],
    esbuildPlugins: [
      {
        name: 'csv-parse-browser',
        setup(build) {
          // Rewrite the specifier, keeping the package external so it stays a
          // peer of the consumer's own csv-parse rather than being inlined.
          build.onResolve({ filter: /^csv-parse\/sync$/ }, () => ({
            path: 'csv-parse/browser/esm/sync',
            external: true,
          }));
        },
      },
    ],
  },
]);

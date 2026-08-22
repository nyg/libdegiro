import { defineConfig, type UserConfig } from 'tsdown';

const shared = {
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  treeshake: true,
  minify: false,
  fixedExtension: false,
  clean: false,
} satisfies UserConfig;

export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts', 'src/node.ts'],
    platform: 'node',
    dts: { sourcemap: false },
  },
  {
    ...shared,
    entry: { 'index.browser': 'src/index.ts' },
    platform: 'browser',
    dts: false,
    deps: { alwaysBundle: [/^csv-parse\/sync$/] },
    plugins: [
      {
        name: 'csv-parse-browser',
        resolveId(id) {
          if (id === 'csv-parse/sync') {
            return { id: 'csv-parse/browser/esm/sync', external: true };
          }
        },
      },
    ],
  },
]);

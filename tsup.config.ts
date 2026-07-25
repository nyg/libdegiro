import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/node.ts'],
  format: ['esm'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Share the parsing core between the two entries instead of duplicating it.
  splitting: true,
  minify: false,
});

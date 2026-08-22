import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/node.ts'],
  platform: 'node',
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  treeshake: true,
  minify: false,
  fixedExtension: false,
  clean: false,
  dts: { sourcemap: false },
});

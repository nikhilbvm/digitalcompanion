import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @companion/core is TypeScript source in the workspace; bundle it so the
  // built API can run under plain node without a TS loader.
  noExternal: ['@companion/core'],
});

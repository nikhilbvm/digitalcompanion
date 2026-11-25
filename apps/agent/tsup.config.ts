import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @companion/core is TypeScript source in the workspace; bundle it so the
  // worker's forked job processes can run under plain node.
  noExternal: ['@companion/core'],
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

// The monorepo keeps one root .env. Next only auto-loads files inside this app,
// so load the root env here before the public variables are inlined.
// A local apps/web/.env.local (or platform env) still wins.
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(here, '.env.local'), override: true, quiet: true });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@companion/core'],
};

export default nextConfig;

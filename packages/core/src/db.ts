import { readFileSync } from 'node:fs';
import { Pool, type PoolConfig } from 'pg';

export interface DbConfig {
  /** Defaults to DATABASE_URL. */
  connectionString?: string;
  /** Defaults to DATABASE_SSL === 'true'. */
  ssl?: boolean;
  /** Optional path to an RDS CA bundle; enables certificate verification. */
  sslCaPath?: string;
  max?: number;
}

/**
 * Server-only Postgres pool for local Postgres or Amazon RDS/Aurora.
 * The browser never connects to the database.
 */
export function createDbPool(config: DbConfig = {}): Pool {
  const connectionString = config.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const sslEnabled = config.ssl ?? process.env.DATABASE_SSL === 'true';
  const sslCaPath = config.sslCaPath ?? process.env.DATABASE_SSL_CA;
  let ssl: PoolConfig['ssl'];
  if (sslEnabled) {
    ssl = sslCaPath
      ? { ca: readFileSync(sslCaPath, 'utf8'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }

  return new Pool({
    connectionString,
    ssl,
    max: config.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export type DbPool = Pool;

import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

import {
  databaseSslMode,
  databaseUrl,
  directDatabaseUrl,
} from "../config/app-config.ts";

let runtimePool: Pool | null = null;
let directPool: Pool | null = null;

export async function queryRuntimeDatabase<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getRuntimePool().query<T>(text, params);
}

export async function queryDirectDatabase<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getDirectPool().query<T>(text, params);
}

export function getRuntimePool() {
  if (!runtimePool) {
    runtimePool = createPool(databaseUrl, "DATABASE_URL");
  }

  return runtimePool;
}

export function getDirectPool() {
  if (!directPool) {
    directPool = createPool(
      directDatabaseUrl,
      "DIRECT_DATABASE_URL",
    );
  }

  return directPool;
}

export async function closeDatabasePools() {
  await Promise.all([
    runtimePool?.end(),
    directPool?.end(),
  ]);
  runtimePool = null;
  directPool = null;
}

function createPool(connectionString: string | null, envVarName: string) {
  if (!connectionString) {
    throw new Error(
      `Database is not configured. Set ${envVarName} in backend/.env.`,
    );
  }

  const config: PoolConfig = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  };

  if (databaseSslMode === "require") {
    config.ssl = { rejectUnauthorized: false };
  }

  return new Pool(config);
}

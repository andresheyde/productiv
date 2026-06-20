import "dotenv/config";

import { closeDatabasePools, getDirectPool } from "../shared/db/postgres.ts";
import { runDatabaseMigrations } from "../shared/db/migrate.ts";
import { directDatabaseUrl } from "../shared/config/app-config.ts";

try {
  assertLocalDatabaseUrl(directDatabaseUrl);

  const pool = getDirectPool();

  console.log("[DB] Resetting local database schema...");
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await pool.query("grant all on schema public to public");
  await runDatabaseMigrations();
  console.log("[DB] Local database reset complete.");
} finally {
  await closeDatabasePools();
}

function assertLocalDatabaseUrl(connectionString: string | null) {
  if (!connectionString) {
    throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required.");
  }

  const parsedUrl = new URL(connectionString);
  const databaseName = parsedUrl.pathname.replace(/^\//u, "");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(parsedUrl.hostname)) {
    throw new Error(
      `Refusing to reset non-local database host: ${parsedUrl.hostname}`,
    );
  }

  if (!/^productiv_(local|test)(?:_|$)/u.test(databaseName)) {
    throw new Error(
      `Refusing to reset database "${databaseName}". Use a productiv_local* or productiv_test* database.`,
    );
  }
}

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDirectPool } from "./postgres.ts";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const migrationsDirPath = path.join(currentDirPath, "migrations");

type MigrationFile = {
  name: string;
  sql: string;
};

export async function runDatabaseMigrations() {
  const pool = getDirectPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const appliedVersions = await listAppliedVersions();
  const pendingMigrations = (await loadMigrationFiles()).filter(
    (migration) => !appliedVersions.has(migration.name),
  );

  for (const migration of pendingMigrations) {
    const migrationClient = await pool.connect();

    try {
      await migrationClient.query("begin");
      await migrationClient.query(migration.sql);
      await migrationClient.query(
        "insert into schema_migrations (version) values ($1)",
        [migration.name],
      );
      await migrationClient.query("commit");
      console.log(`[DB] Applied migration ${migration.name}`);
    } catch (error) {
      await migrationClient.query("rollback");
      throw new Error(
        `Failed while applying migration ${migration.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      migrationClient.release();
    }
  }

  if (pendingMigrations.length === 0) {
    console.log("[DB] No pending migrations.");
  }
}

async function listAppliedVersions() {
  const pool = getDirectPool();
  const result = await pool.query<{ version: string }>(
    "select version from schema_migrations order by version asc",
  );

  return new Set(result.rows.map((row: { version: string }) => row.version));
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const migrationNames = (await readdir(migrationsDirPath))
    .filter((entry) => entry.endsWith(".sql"))
    .sort();

  return Promise.all(
    migrationNames.map(async (name) => ({
      name,
      sql: await readFile(path.join(migrationsDirPath, name), "utf8"),
    })),
  );
}

import "dotenv/config";

import { closeDatabasePools, queryRuntimeDatabase } from "../shared/db/postgres.ts";

type DatabasePingRow = {
  connected_database: string;
  current_time: string;
};

try {
  const result = await queryRuntimeDatabase<DatabasePingRow>(`
    select
      current_database() as connected_database,
      timezone('utc', now())::text as current_time
  `);

  const row = result.rows[0];

  if (!row) {
    throw new Error("Database ping returned no rows.");
  }

  console.log(
    `[DB] Connected to ${row.connected_database} at ${row.current_time}`,
  );
} finally {
  await closeDatabasePools();
}

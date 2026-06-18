import "dotenv/config";

import { closeDatabasePools } from "../shared/db/postgres.ts";
import { runDatabaseMigrations } from "../shared/db/migrate.ts";

try {
  await runDatabaseMigrations();
} finally {
  await closeDatabasePools();
}

import type { DatabaseSync } from "node:sqlite";

// Runs `work` as one transaction: either every write inside it happens, or none do.
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

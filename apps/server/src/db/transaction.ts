import type { DatabaseSync } from "node:sqlite";

// Runs `work` as one transaction: either every write inside it happens, or none do.
// Uses a savepoint, so calls can nest: an inner call that fails undoes only its own writes
// (and throws), and the outermost one decides whether everything is kept.
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("SAVEPOINT work");
  try {
    const result = work();
    db.exec("RELEASE work");
    return result;
  } catch (err) {
    db.exec("ROLLBACK TO work");
    db.exec("RELEASE work");
    throw err;
  }
}

import { Database } from './models/Database.js';
import { execute, isMutating } from './services/executor.js';
import type { QueryResult, TableSchema, ToySQLOptions, PersistenceAdapter } from './models/types.js';

export { LocalStorageAdapter } from './persistence/LocalStorageAdapter.js';
export { FileStorageAdapter } from './persistence/FileStorageAdapter.js';
export type { QueryResult, ToySQLOptions, PersistenceAdapter, TableSchema, Row } from './models/types.js';

/**
 * ToySQL — A lightweight in-memory SQL engine with optional persistence.
 *
 * @example Basic usage
 * ```ts
 * import { ToySQL } from 'toysql';
 *
 * const db = new ToySQL();
 * db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
 * db.execute("INSERT INTO users VALUES (1, 'Alice')");
 * const [result] = db.execute('SELECT * FROM users');
 * // result.rows → [{ id: 1, name: 'Alice' }]
 * ```
 *
 * @example With browser persistence
 * ```ts
 * import { ToySQL, LocalStorageAdapter } from 'toysql';
 *
 * const db = new ToySQL({ persistence: new LocalStorageAdapter() });
 * // Data is automatically saved after every mutating query
 * // and restored on the next page load.
 * ```
 *
 * @example With Node.js file persistence
 * ```ts
 * import { ToySQL, FileStorageAdapter } from 'toysql';
 *
 * const db = new ToySQL({ persistence: new FileStorageAdapter('./data/mydb.json') });
 * ```
 */
export class ToySQL {
  private readonly db: Database;
  private readonly persistence?: PersistenceAdapter;
  private readonly storageKey: string;

  constructor(options: ToySQLOptions = {}) {
    this.db = new Database();
    this.persistence = options.persistence;
    this.storageKey = options.storageKey ?? 'toysql_db';

    // Attempt to restore state from persistence on construction
    if (this.persistence) {
      const saved = this.persistence.load(this.storageKey);
      if (saved) {
        const ok = this.db.deserialize(saved);
        if (!ok) {
          console.warn('[ToySQL] Failed to restore database from storage. Starting fresh.');
        }
      }
    }
  }

  // ─── Core Query API ───────────────────────────────────────────────────────

  /**
   * Execute one or more semicolon-separated SQL statements.
   *
   * After any mutating statements (CREATE, INSERT, UPDATE, DELETE, DROP),
   * the database state is automatically persisted if a persistence adapter
   * was provided.
   *
   * @returns An array of results — one per statement.
   */
  execute(sql: string): QueryResult[] {
    const results = execute(sql, this.db);

    if (this.persistence && isMutating(results)) {
      this.save();
    }

    return results;
  }

  // ─── Persistence Controls ─────────────────────────────────────────────────

  /**
   * Manually trigger a save to the configured persistence adapter.
   * This is called automatically after every mutating query, but you
   * can call it explicitly if needed.
   */
  save(): void {
    if (!this.persistence) {
      console.warn('[ToySQL] save() called but no persistence adapter was configured.');
      return;
    }
    this.persistence.save(this.storageKey, this.db.serialize());
  }

  /**
   * Manually reload the database state from the persistence adapter.
   * Useful if the underlying storage was modified externally.
   */
  reload(): boolean {
    if (!this.persistence) return false;
    const saved = this.persistence.load(this.storageKey);
    if (!saved) return false;
    return this.db.deserialize(saved);
  }

  /**
   * Clear all data from both the in-memory database and the persistence store.
   */
  clearAll(): void {
    this.db.clear();
    this.persistence?.remove(this.storageKey);
  }

  // ─── Introspection API ────────────────────────────────────────────────────

  /** Returns the full schema object for all tables. */
  getSchema(): Record<string, TableSchema> {
    return this.db.tables;
  }

  /** Returns the names of all tables in the database. */
  getTableNames(): string[] {
    return this.db.getTableNames();
  }

  /** Returns the total number of rows across all tables. */
  getTotalRows(): number {
    return this.db.getTotalRows();
  }

  /**
   * Returns an estimated size of the database in bytes
   * (based on JSON serialization length).
   */
  getMemoryEstimate(): number {
    return this.db.getMemoryEstimate();
  }
}

export default ToySQL;

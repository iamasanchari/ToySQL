import type { Column, TableSchema, Row, DatabaseSnapshot } from './types.js';

/**
 * Manages all in-memory table state.
 * Acts as the single source of truth for all table schemas and rows.
 */
export class Database {
  /** All table schemas and their row data */
  public tables: Record<string, TableSchema> = {};

  /** Auto-increment sequences per table */
  public sequence: Record<string, number> = {};

  // ─── Table Existence ────────────────────────────────────────────────────────

  public hasTable(name: string): boolean {
    return name in this.tables;
  }

  /**
   * Get a table by name. Throws a descriptive error if not found.
   */
  public getTable(name: string): TableSchema {
    const table = this.tables[name];
    if (!table) throw new Error(`Table '${name}' does not exist`);
    return table;
  }

  // ─── DDL Operations ─────────────────────────────────────────────────────────

  /**
   * Create a new table. Throws if a table with that name already exists.
   */
  public createTable(name: string, columns: Column[], pk: string | null): void {
    if (this.tables[name]) throw new Error(`Table '${name}' already exists`);
    this.tables[name] = { columns, rows: [], pk };
    this.sequence[name] = 1;
  }

  /**
   * Drop a table by name. Throws if the table does not exist.
   */
  public dropTable(name: string): void {
    if (!this.tables[name]) throw new Error(`Table '${name}' does not exist`);
    delete this.tables[name];
    delete this.sequence[name];
  }

  // ─── DML Operations ─────────────────────────────────────────────────────────

  /**
   * Insert a validated row into a table.
   */
  public insertRow(tableName: string, row: Row): void {
    const table = this.getTable(tableName);

    if (table.pk) {
      const pkVal = row[table.pk];
      if (table.rows.some((r) => r[table.pk!] === pkVal)) {
        throw new Error(`Duplicate PRIMARY KEY value: ${String(pkVal)}`);
      }
    }

    table.rows.push(row);
  }

  // ─── Introspection ──────────────────────────────────────────────────────────

  public getTableNames(): string[] {
    return Object.keys(this.tables);
  }

  public getTotalRows(): number {
    return Object.values(this.tables).reduce((sum, t) => sum + t.rows.length, 0);
  }

  public getMemoryEstimate(): number {
    try {
      return JSON.stringify(this.tables).length;
    } catch {
      return 0;
    }
  }

  // ─── Serialization ──────────────────────────────────────────────────────────

  /**
   * Serialize the entire database state to a JSON string for persistence.
   */
  public serialize(): string {
    const snapshot: DatabaseSnapshot = {
      version: 1,
      tables: this.tables,
      sequence: this.sequence,
    };
    return JSON.stringify(snapshot);
  }

  /**
   * Restore the database state from a previously serialized JSON string.
   * Silently returns false on any parse or validation failure.
   */
  public deserialize(json: string): boolean {
    try {
      const snapshot = JSON.parse(json) as DatabaseSnapshot;
      if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 1) {
        return false;
      }
      this.tables = snapshot.tables ?? {};
      this.sequence = snapshot.sequence ?? {};
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wipe all tables and sequences — effectively resets to a blank database.
   */
  public clear(): void {
    this.tables = {};
    this.sequence = {};
  }
}

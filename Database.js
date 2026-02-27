/**
 * In-memory database state model.
 * Holds all table schemas and row data.
 */
export class Database {
  constructor() {
    /** @type {Record<string, import('./types.js').TableSchema>} */
    this.tables = {};

    /** @type {Record<string, number>} */
    this.sequence = {};
  }

  /**
   * Check if a table exists.
   * @param {string} name
   * @returns {boolean}
   */
  hasTable(name) {
    return name in this.tables;
  }

  /**
   * Get a table by name, or throw if it doesn't exist.
   * @param {string} name
   * @returns {import('./types.js').TableSchema}
   */
  getTable(name) {
    if (!this.tables[name]) {
      throw new Error(`Table '${name}' does not exist`);
    }
    return this.tables[name];
  }

  /**
   * Create a new table.
   * @param {string} name
   * @param {import('./types.js').Column[]} columns
   * @param {string | null} pk
   */
  createTable(name, columns, pk) {
    if (this.tables[name]) {
      throw new Error(`Table '${name}' already exists`);
    }
    this.tables[name] = { columns, rows: [], pk };
    this.sequence[name] = 1;
  }

  /**
   * Drop a table by name.
   * @param {string} name
   */
  dropTable(name) {
    if (!this.tables[name]) {
      throw new Error(`Table '${name}' does not exist`);
    }
    delete this.tables[name];
    delete this.sequence[name];
  }

  /**
   * Get all table names.
   * @returns {string[]}
   */
  getTableNames() {
    return Object.keys(this.tables);
  }

  /**
   * Count all rows across all tables.
   * @returns {number}
   */
  getTotalRows() {
    return Object.values(this.tables).reduce((sum, t) => sum + t.rows.length, 0);
  }

  /**
   * Estimate memory usage in bytes (via JSON serialization).
   * @returns {number}
   */
  getMemoryEstimate() {
    try {
      return JSON.stringify(this.tables).length;
    } catch {
      return 0;
    }
  }
}

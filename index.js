import { Database } from './models/Database.js';
import { execute } from './services/executor.js';

/**
 * ToySQL — A lightweight in-memory SQL engine.
 *
 * @example
 * import { ToySQL } from 'toysql';
 *
 * const db = new ToySQL();
 * db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
 * db.execute("INSERT INTO users VALUES (1, 'Alice')");
 * const results = db.execute('SELECT * FROM users');
 * console.log(results[0].rows); // [{ id: 1, name: 'Alice' }]
 */
export class ToySQL {
  constructor() {
    this._db = new Database();
  }

  /**
   * Execute one or more SQL statements (semicolon-separated).
   * @param {string} sql
   * @returns {import('./models/types.js').QueryResult[]}
   */
  execute(sql) {
    return execute(sql, this._db);
  }

  /**
   * Get the full schema of all tables.
   * @returns {Record<string, import('./models/types.js').TableSchema>}
   */
  getSchema() {
    return this._db.tables;
  }

  /**
   * Get the names of all tables.
   * @returns {string[]}
   */
  getTableNames() {
    return this._db.getTableNames();
  }

  /**
   * Get the total number of rows across all tables.
   * @returns {number}
   */
  getTotalRows() {
    return this._db.getTotalRows();
  }

  /**
   * Get an estimate of memory usage in bytes.
   * @returns {number}
   */
  getMemoryEstimate() {
    return this._db.getMemoryEstimate();
  }
}

export default ToySQL;

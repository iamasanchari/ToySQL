import type { PersistenceAdapter } from '../models/types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Persistence adapter that stores data in a JSON file on disk.
 * Designed for Node.js environments.
 *
 * @example
 * import { ToySQL, FileStorageAdapter } from 'toysql';
 *
 * const db = new ToySQL({
 *   persistence: new FileStorageAdapter('./mydb.json'),
 * });
 *
 * db.execute("CREATE TABLE logs (id INT PRIMARY KEY, msg TEXT)");
 * db.execute("INSERT INTO logs VALUES (1, 'Hello')");
 * // Data is written to ./mydb.json after each mutating query
 */
export class FileStorageAdapter implements PersistenceAdapter {
  private readonly filePath: string;

  /**
   * @param filePath Path to the JSON file where the database will be stored.
   *                 Defaults to `"./toysql_db.json"`.
   */
  constructor(filePath: string = './toysql_db.json') {
    this.filePath = path.resolve(filePath);

    // Ensure the parent directory exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  save(key: string, data: string): void {
    try {
      // We store each key as its own file with the key embedded in the filename
      const file = this.keyedPath(key);
      fs.writeFileSync(file, data, 'utf8');
    } catch (err) {
      console.warn(`[ToySQL] Failed to write to file (key="${key}"):`, err);
    }
  }

  load(key: string): string | null {
    try {
      const file = this.keyedPath(key);
      if (!fs.existsSync(file)) return null;
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  }

  remove(key: string): void {
    try {
      const file = this.keyedPath(key);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // Silently ignore remove failures
    }
  }

  /**
   * Build the file path for a given storage key.
   * When the storage key is the default, use the configured filePath directly.
   * Otherwise, append the key as a suffix.
   */
  private keyedPath(key: string): string {
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(this.filePath);
    const base = this.filePath.slice(0, this.filePath.length - ext.length);
    return `${base}_${sanitized}${ext}`;
  }
}

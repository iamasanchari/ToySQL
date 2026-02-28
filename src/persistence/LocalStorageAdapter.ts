import type { PersistenceAdapter } from '../models/types.js';

/**
 * Persistence adapter that stores data in the browser's `localStorage`.
 *
 * @example
 * import { ToySQL, LocalStorageAdapter } from 'toysql';
 *
 * const db = new ToySQL({
 *   persistence: new LocalStorageAdapter(),
 *   storageKey: 'my_app_db',
 * });
 *
 * // Data is automatically saved after every mutating query
 * db.execute("INSERT INTO users VALUES (1, 'Alice')");
 *
 * // On next page load, the data is automatically restored
 * const db2 = new ToySQL({ persistence: new LocalStorageAdapter() });
 * db2.execute('SELECT * FROM users'); // returns Alice's row
 */
export class LocalStorageAdapter implements PersistenceAdapter {
  private readonly storage: Storage;

  constructor() {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error(
        'LocalStorageAdapter requires a browser environment with localStorage support. ' +
        'For Node.js, use FileStorageAdapter instead.'
      );
    }
    this.storage = window.localStorage;
  }

  save(key: string, data: string): void {
    try {
      this.storage.setItem(key, data);
    } catch (err) {
      console.warn(`[ToySQL] Failed to save to localStorage (key="${key}"):`, err);
    }
  }

  load(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  remove(key: string): void {
    try {
      this.storage.removeItem(key);
    } catch {
      // Silently ignore remove failures
    }
  }
}

# ToySQL (TypeScript)

A lightweight **in-memory SQL engine** written in TypeScript — with full type safety, clean modular architecture, and **optional persistence** via pluggable storage adapters (browser `localStorage` or Node.js file system).

---

## Install

```bash
npm install toysql
```

---

## Quick Start

```ts
import { ToySQL } from 'toysql';

const db = new ToySQL();

db.execute(`
  CREATE TABLE users (
    id   INT PRIMARY KEY,
    name TEXT NOT NULL,
    age  INT
  )
`);

db.execute(`
  INSERT INTO users VALUES (1, 'Alice', 29), (2, 'Bob', 34)
`);

const [result] = db.execute('SELECT * FROM users WHERE age > 30');
if (result.type === 'rows') {
  console.log(result.rows); // [{ id: 2, name: 'Bob', age: 34 }]
}
```

---

## Persistence

ToySQL supports pluggable persistence so your data survives page reloads or process restarts.

### Browser — `localStorage`

```ts
import { ToySQL, LocalStorageAdapter } from 'toysql';

const db = new ToySQL({
  persistence: new LocalStorageAdapter(),
  storageKey: 'my_app_db',   // optional, defaults to "toysql_db"
});

// After every mutating query (CREATE, INSERT, UPDATE, DELETE, DROP),
// the database is automatically saved to localStorage.
db.execute("INSERT INTO users VALUES (1, 'Alice', 29)");

// On the next page load, the data is automatically restored.
const db2 = new ToySQL({ persistence: new LocalStorageAdapter() });
db2.execute('SELECT * FROM users'); // returns Alice's row
```

### Node.js — File System

```ts
import { ToySQL, FileStorageAdapter } from 'toysql';

const db = new ToySQL({
  persistence: new FileStorageAdapter('./data/mydb.json'),
});

db.execute("CREATE TABLE logs (id INT PRIMARY KEY, msg TEXT)");
db.execute("INSERT INTO logs VALUES (1, 'Server started')");
// Written to disk after each mutating query
```

### Custom Adapter

Implement the `PersistenceAdapter` interface for any storage backend:

```ts
import type { PersistenceAdapter } from 'toysql';

class RedisAdapter implements PersistenceAdapter {
  save(key: string, data: string): void { /* redis.set(key, data) */ }
  load(key: string): string | null      { /* return redis.get(key) */ }
  remove(key: string): void             { /* redis.del(key) */ }
}

const db = new ToySQL({ persistence: new RedisAdapter() });
```

---

## Supported SQL

| Statement | Example |
|-----------|---------|
| `CREATE TABLE` | `CREATE TABLE t (id INT PRIMARY KEY, name TEXT NOT NULL, age INT DEFAULT 18)` |
| `INSERT INTO` | `INSERT INTO t VALUES (1, 'foo')` or `INSERT INTO t (id) VALUES (1)` |
| `SELECT` | `SELECT name, age FROM t WHERE age > 20 ORDER BY age DESC LIMIT 5` |
| `UPDATE` | `UPDATE t SET name = 'bar' WHERE id = 1` |
| `DELETE` | `DELETE FROM t WHERE id = 1` |
| `DROP TABLE` | `DROP TABLE t` |
| `SHOW TABLES` | `SHOW TABLES` |
| `DESCRIBE` | `DESCRIBE t` |

### SELECT Features

| Feature | Example |
|---------|---------|
| Column alias | `SELECT name AS username FROM t` |
| `DISTINCT` | `SELECT DISTINCT status FROM orders` |
| `WHERE` with `AND`/`OR`/`NOT` | `WHERE age > 20 AND active = 1` |
| `LIKE` | `WHERE name LIKE 'Ali%'` |
| `IN` | `WHERE status IN ('shipped', 'delivered')` |
| `BETWEEN` | `WHERE age BETWEEN 18 AND 30` |
| `IS NULL` / `IS NOT NULL` | `WHERE note IS NOT NULL` |
| `GROUP BY` + aggregates | `SELECT dept, COUNT(*) FROM emp GROUP BY dept` |
| Aggregates | `COUNT`, `SUM`, `AVG`, `MIN`, `MAX` |
| `ORDER BY` (multi-column) | `ORDER BY dept ASC, salary DESC` |
| `LIMIT` / `OFFSET` | `LIMIT 10 OFFSET 20` |
| `INNER JOIN` / `LEFT JOIN` | `FROM u JOIN o ON u.id = o.user_id` |
| Table-qualified columns | `ON u.id = o.user_id` |

---

## API

### `new ToySQL(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `persistence` | `PersistenceAdapter` | `undefined` | Storage backend for auto-save/restore |
| `storageKey` | `string` | `"toysql_db"` | Key used for persistence storage |

### `db.execute(sql: string): QueryResult[]`

Returns one `QueryResult` per statement (discriminated union):

```ts
type QueryResult =
  | { type: 'rows';  columns: string[]; rows: Row[]; affected: number }
  | { type: 'ok';    message: string;   affected: number }
  | { type: 'empty' }
```

### Other Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `db.save()` | `void` | Manually persist current state |
| `db.reload()` | `boolean` | Reload state from storage |
| `db.clearAll()` | `void` | Wipe memory + storage |
| `db.getSchema()` | `Record<string, TableSchema>` | Full schema map |
| `db.getTableNames()` | `string[]` | All table names |
| `db.getTotalRows()` | `number` | Row count across all tables |
| `db.getMemoryEstimate()` | `number` | Estimated size in bytes |

---

## Project Structure

```
src/
├── index.ts                        ← Public ToySQL class + re-exports
├── models/
│   ├── types.ts                    ← All TypeScript types & interfaces
│   └── Database.ts                 ← In-memory state (tables, sequences)
├── services/
│   ├── tokenizer.ts                ← SQL lexer → Token[]
│   ├── parser.ts                   ← Token cursor with typed helpers
│   ├── condition.ts                ← WHERE/ON parser & evaluator
│   └── executor.ts                 ← All SQL statement handlers
└── persistence/
    ├── LocalStorageAdapter.ts      ← Browser localStorage backend
    └── FileStorageAdapter.ts       ← Node.js file system backend
```

---

## License

MIT

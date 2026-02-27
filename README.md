# ToySQL

A lightweight **in-memory SQL engine** for JavaScript. No dependencies, no setup — just import and query.

## Install

```bash
npm install toysql
```

## Quick Start

```js
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
  INSERT INTO users VALUES
    (1, 'Alice', 29),
    (2, 'Bob',   34)
`);

const [result] = db.execute('SELECT * FROM users WHERE age > 30');
console.log(result.rows);
// [{ id: 2, name: 'Bob', age: 34 }]
```

## Supported SQL

| Statement | Example |
|-----------|---------|
| `CREATE TABLE` | `CREATE TABLE t (id INT PRIMARY KEY, name TEXT)` |
| `INSERT INTO` | `INSERT INTO t VALUES (1, 'foo')` |
| `SELECT` | `SELECT name, age FROM t WHERE age > 20 ORDER BY age DESC LIMIT 5` |
| `UPDATE` | `UPDATE t SET name = 'bar' WHERE id = 1` |
| `DELETE` | `DELETE FROM t WHERE id = 1` |
| `DROP TABLE` | `DROP TABLE t` |
| `SHOW TABLES` | `SHOW TABLES` |
| `DESCRIBE` | `DESCRIBE t` |

### SELECT Features

- `WHERE` with `AND`, `OR`, `NOT`
- `LIKE`, `IN`, `BETWEEN`, `IS NULL`, `IS NOT NULL`
- `GROUP BY` with `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`
- `ORDER BY` (multiple columns, `ASC`/`DESC`)
- `LIMIT` / `OFFSET`
- `DISTINCT`
- `INNER JOIN` / `LEFT JOIN`
- Column aliases with `AS`

### Column Types

| SQL Type | Normalized To |
|----------|---------------|
| `INT`, `INTEGER` | `INT` |
| `REAL`, `FLOAT`, `NUMERIC`, `DOUBLE` | `REAL` |
| `BOOL`, `BOOLEAN` | `BOOLEAN` |
| `TEXT`, `VARCHAR`, anything else | `TEXT` |

### Column Constraints

- `PRIMARY KEY`
- `NOT NULL`
- `DEFAULT <value>`
- `UNIQUE` _(parsed, not enforced)_
- `AUTO_INCREMENT` _(parsed, not enforced)_

## API

### `new ToySQL()`
Create a new isolated in-memory database instance.

### `db.execute(sql: string): QueryResult[]`
Run one or more semicolon-separated SQL statements. Returns an array of results (one per statement).

**QueryResult shape:**
```ts
{
  type: 'rows' | 'ok' | 'empty',
  columns?: string[],   // present when type === 'rows'
  rows?: object[],      // present when type === 'rows'
  message?: string,     // present when type === 'ok'
  affected?: number,    // rows affected or returned
}
```

### `db.getSchema(): Record<string, TableSchema>`
Returns the full schema of all tables.

### `db.getTableNames(): string[]`
Returns an array of all table names.

### `db.getTotalRows(): number`
Returns the total number of rows across all tables.

### `db.getMemoryEstimate(): number`
Returns an estimated memory usage in bytes.

## Multiple statements

`execute()` accepts multiple semicolon-separated statements and returns one result per statement:

```js
const results = db.execute(`
  INSERT INTO users VALUES (3, 'Carol', 22);
  SELECT * FROM users ORDER BY age;
`);
// results[0] → insert result
// results[1] → select result
```

## License

MIT

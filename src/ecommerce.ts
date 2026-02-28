import { ToySQL, FileStorageAdapter } from './index';
import type { RowsResult } from './models/types';

// ─── Setup ────────────────────────────────────────────────────────────────────

// Use file persistence so the database survives restarts.
// Remove the file to start fresh: rm ./data/shop_db_toysql_db.json
const db = new ToySQL({
  persistence: new FileStorageAdapter('./data/shop_db.json'),
  storageKey: 'toysql_db',
});

const schema = db.getSchema();
const isFirstRun = Object.keys(schema).length === 0;

if (isFirstRun) {
  console.log('🚀 First run — creating and seeding the database...\n');

  db.execute(`
    CREATE TABLE users (
      id   INT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      age  INT
    );

    CREATE TABLE products (
      id    INT PRIMARY KEY,
      name  TEXT,
      price REAL,
      stock INT
    );

    CREATE TABLE orders (
      id         INT PRIMARY KEY,
      user_id    INT,
      product_id INT,
      quantity   INT,
      status     TEXT
    );
  `);

  db.execute(`
    INSERT INTO users VALUES
      (1, 'Alice Nguyen',  'alice@email.com',  29),
      (2, 'Bob Sharma',    'bob@email.com',    34),
      (3, 'Carmen Lopez',  'carmen@email.com', 27),
      (4, 'Derek Wu',      'derek@email.com',  42);

    INSERT INTO products VALUES
      (1, 'Mechanical Keyboard', 129.99, 50),
      (2, 'USB-C Hub',            49.99, 200),
      (3, 'Monitor Stand',        79.99, 75),
      (4, 'Webcam 4K',           199.99, 30);

    INSERT INTO orders VALUES
      (1, 1, 2, 1, 'shipped'),
      (2, 1, 1, 2, 'delivered'),
      (3, 2, 3, 1, 'pending'),
      (4, 3, 4, 1, 'shipped'),
      (5, 4, 2, 3, 'delivered'),
      (6, 2, 1, 1, 'cancelled');
  `);

  console.log('✅ Database created and persisted to disk.\n');
} else {
  console.log(`♻️  Restored database from disk (${db.getTableNames().join(', ')}).\n`);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

function printResult(title: string, sql: string): void {
  console.log(`=== ${title} ===`);
  const [result] = db.execute(sql);
  if (result.type === 'rows') {
    console.table((result as RowsResult).rows);
  } else if (result.type === 'ok') {
    console.log(result.message);
  }
  console.log();
}

printResult('All Users', 'SELECT * FROM users ORDER BY name');

printResult(
  'Products under $100',
  'SELECT name, price FROM products WHERE price < 100 ORDER BY price ASC'
);

printResult(
  'Order count per user',
  'SELECT user_id, COUNT(*) AS total_orders FROM orders GROUP BY user_id ORDER BY total_orders DESC'
);

printResult(
  'Shipped or delivered orders',
  "SELECT * FROM orders WHERE status IN ('shipped', 'delivered')"
);

printResult(
  'Average user age',
  'SELECT AVG(age) AS avg_age, MIN(age) AS youngest, MAX(age) AS oldest FROM users'
);

// ─── Stats ────────────────────────────────────────────────────────────────────

console.log('─'.repeat(50));
console.log(`Tables:         ${db.getTableNames().join(', ')}`);
console.log(`Total rows:     ${db.getTotalRows()}`);
console.log(`Memory:         ${db.getMemoryEstimate()} bytes`);

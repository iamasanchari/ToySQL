import { ToySQL } from '../src/index.js';

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

function test(name, fn) {
  console.log(`\n${name}`);
  try {
    fn();
  } catch (err) {
    console.error(`  ❌ Threw unexpected error: ${err.message}`);
    failed++;
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('CREATE TABLE', () => {
  const db = new ToySQL();
  const result = db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT)');
  assert('returns ok type', result[0].type === 'ok');
  assert('table is in schema', db.getTableNames().includes('users'));
  assert('has 3 columns', db.getSchema().users.columns.length === 3);
});

test('INSERT INTO', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
  const result = db.execute("INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob')");
  assert('affected count is 2', result[0].affected === 2);
  assert('total rows is 2', db.getTotalRows() === 2);
});

test('SELECT *', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
  db.execute("INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob')");
  const result = db.execute('SELECT * FROM users');
  assert('returns rows type', result[0].type === 'rows');
  assert('returns 2 rows', result[0].rows.length === 2);
  assert('has id column', result[0].columns.includes('id'));
});

test('SELECT with WHERE', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT)');
  db.execute("INSERT INTO users VALUES (1, 'Alice', 30), (2, 'Bob', 25)");
  const result = db.execute('SELECT * FROM users WHERE age > 28');
  assert('returns 1 row', result[0].rows.length === 1);
  assert('correct row returned', result[0].rows[0].name === 'Alice');
});

test('SELECT with ORDER BY and LIMIT', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE p (id INT PRIMARY KEY, price REAL)');
  db.execute('INSERT INTO p VALUES (1, 50), (2, 10), (3, 30)');
  const result = db.execute('SELECT * FROM p ORDER BY price ASC LIMIT 2');
  assert('returns 2 rows', result[0].rows.length === 2);
  assert('first row is cheapest', result[0].rows[0].price === 10);
});

test('SELECT with GROUP BY and COUNT', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE orders (id INT PRIMARY KEY, status TEXT)');
  db.execute("INSERT INTO orders VALUES (1,'shipped'),(2,'shipped'),(3,'pending')");
  const result = db.execute("SELECT status, COUNT(*) AS cnt FROM orders GROUP BY status ORDER BY cnt DESC");
  assert('returns 2 groups', result[0].rows.length === 2);
  assert('shipped count is 2', result[0].rows[0].cnt === 2);
});

test('UPDATE', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
  db.execute("INSERT INTO users VALUES (1, 'Alice')");
  const result = db.execute("UPDATE users SET name = 'Alicia' WHERE id = 1");
  assert('affected 1 row', result[0].affected === 1);
  const rows = db.execute('SELECT * FROM users').at(0).rows;
  assert('name was updated', rows[0].name === 'Alicia');
});

test('DELETE', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
  db.execute("INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob')");
  const result = db.execute('DELETE FROM users WHERE id = 1');
  assert('affected 1 row', result[0].affected === 1);
  assert('1 row remains', db.getTotalRows() === 1);
});

test('DROP TABLE', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE tmp (id INT)');
  db.execute('DROP TABLE tmp');
  assert('table is gone', !db.getTableNames().includes('tmp'));
});

test('SHOW TABLES', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE a (x INT)');
  db.execute('CREATE TABLE b (y INT)');
  const result = db.execute('SHOW TABLES');
  assert('returns 2 tables', result[0].rows.length === 2);
});

test('DESCRIBE', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL)');
  const result = db.execute('DESCRIBE users');
  assert('returns 2 columns', result[0].rows.length === 2);
  assert('pk column flagged', result[0].rows.find(r => r.column_name === 'id').primary_key === 'YES');
  assert('not null flagged', result[0].rows.find(r => r.column_name === 'name').not_null === 'YES');
});

test('Error on duplicate PK', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT)');
  db.execute("INSERT INTO users VALUES (1, 'Alice')");
  let threw = false;
  try { db.execute("INSERT INTO users VALUES (1, 'Bob')"); } catch { threw = true; }
  assert('throws on duplicate PK', threw);
});

test('LIKE operator', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE u (id INT, name TEXT)');
  db.execute("INSERT INTO u VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Alicia')");
  const result = db.execute("SELECT * FROM u WHERE name LIKE 'Ali%'");
  assert('matches 2 rows', result[0].rows.length === 2);
});

test('IN operator', () => {
  const db = new ToySQL();
  db.execute('CREATE TABLE u (id INT, status TEXT)');
  db.execute("INSERT INTO u VALUES (1,'active'),(2,'inactive'),(3,'active')");
  const result = db.execute("SELECT * FROM u WHERE status IN ('active')");
  assert('returns 2 active rows', result[0].rows.length === 2);
});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

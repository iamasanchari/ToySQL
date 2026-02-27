import { ToySQL } from '../src/index.js';

const db = new ToySQL();

// Create tables
db.execute(`
  CREATE TABLE users (
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    age INT
  );

  CREATE TABLE products (
    id INT PRIMARY KEY,
    name TEXT,
    price REAL,
    stock INT
  );

  CREATE TABLE orders (
    id INT PRIMARY KEY,
    user_id INT,
    product_id INT,
    quantity INT,
    status TEXT
  );
`);

// Seed data
db.execute(`
  INSERT INTO users VALUES
    (1, 'Alice Nguyen', 'alice@email.com', 29),
    (2, 'Bob Sharma', 'bob@email.com', 34),
    (3, 'Carmen Lopez', 'carmen@email.com', 27),
    (4, 'Derek Wu', 'derek@email.com', 42);

  INSERT INTO products VALUES
    (1, 'Mechanical Keyboard', 129.99, 50),
    (2, 'USB-C Hub', 49.99, 200),
    (3, 'Monitor Stand', 79.99, 75),
    (4, 'Webcam 4K', 199.99, 30);

  INSERT INTO orders VALUES
    (1, 1, 2, 1, 'shipped'),
    (2, 1, 1, 2, 'delivered'),
    (3, 2, 3, 1, 'pending'),
    (4, 3, 4, 1, 'shipped'),
    (5, 4, 2, 3, 'delivered'),
    (6, 2, 1, 1, 'cancelled');
`);

// Query examples
console.log('=== All Users ===');
const users = db.execute('SELECT * FROM users');
console.table(users[0].rows);

console.log('\n=== Products under $100 ===');
const cheap = db.execute("SELECT name, price FROM products WHERE price < 100 ORDER BY price ASC");
console.table(cheap[0].rows);

console.log('\n=== Orders per user ===');
const orderCount = db.execute(`
  SELECT user_id, COUNT(*) AS total_orders
  FROM orders
  GROUP BY user_id
  ORDER BY total_orders DESC
`);
console.table(orderCount[0].rows);

console.log('\n=== Shipped or delivered orders ===');
const active = db.execute("SELECT * FROM orders WHERE status IN ('shipped', 'delivered')");
console.table(active[0].rows);

console.log(`\nTotal rows in DB: ${db.getTotalRows()}`);
console.log(`Memory estimate: ${db.getMemoryEstimate()} bytes`);
console.log(`Tables: ${db.getTableNames().join(', ')}`);

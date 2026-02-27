import { Parser } from './parser.js';
import { tokenize } from './tokenizer.js';
import { parseCondition, parseValue, evalCondition } from './condition.js';

/**
 * Split a SQL string into individual statements by semicolons,
 * respecting string literals.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitStatements(sql) {
  const stmts = [];
  let current = '';
  let inStr = false;
  let strChar = '';

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!inStr && (c === "'" || c === '"')) {
      inStr = true;
      strChar = c;
      current += c;
    } else if (inStr && c === strChar) {
      if (sql[i + 1] === strChar) {
        current += c + sql[++i];
      } else {
        inStr = false;
        current += c;
      }
    } else if (!inStr && c === ';') {
      stmts.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }

  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

/**
 * Execute all statements in a SQL string against the given database.
 * @param {string} sql
 * @param {import('../models/Database.js').Database} db
 * @returns {import('../models/types.js').QueryResult[]}
 */
export function execute(sql, db) {
  const results = [];
  const stmts = splitStatements(sql);
  for (const stmt of stmts) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    results.push(executeOne(trimmed, db));
  }
  return results;
}

/**
 * Execute a single SQL statement.
 * @param {string} sql
 * @param {import('../models/Database.js').Database} db
 * @returns {import('../models/types.js').QueryResult}
 */
function executeOne(sql, db) {
  const tokens = tokenize(sql);
  if (!tokens.length) return { type: 'empty' };
  const p = new Parser(tokens);
  const firstKw = tokens[0].upper || tokens[0].value.toUpperCase();

  if (firstKw === 'CREATE') return execCreate(p, db);
  if (firstKw === 'INSERT') return execInsert(p, db);
  if (firstKw === 'SELECT') return execSelect(p, db);
  if (firstKw === 'UPDATE') return execUpdate(p, db);
  if (firstKw === 'DELETE') return execDelete(p, db);
  if (firstKw === 'DROP') return execDrop(p, db);
  if (firstKw === 'SHOW') return execShow(p, db);
  if (firstKw === 'DESCRIBE' || firstKw === 'DESC') return execDescribe(p, db);

  throw new Error(`Unknown statement: '${tokens[0].value}'`);
}

// ─── Statement Executors ───────────────────────────────────────────────────────

/**
 * CREATE TABLE
 */
function execCreate(p, db) {
  p.expect('CREATE');
  p.expect('TABLE');
  const name = p.ident().toLowerCase();

  if (db.hasTable(name)) throw new Error(`Table '${name}' already exists`);

  p.expect('(');
  const columns = [];
  let pk = null;

  while (true) {
    const colName = p.ident().toLowerCase();
    const typeToken = p.next();
    const colType = typeToken ? typeToken.value.toUpperCase() : 'TEXT';

    const normalType =
      ['INT', 'INTEGER'].includes(colType) ? 'INT' :
      ['REAL', 'FLOAT', 'NUMERIC', 'DOUBLE'].includes(colType) ? 'REAL' :
      ['BOOL', 'BOOLEAN'].includes(colType) ? 'BOOLEAN' :
      'TEXT';

    let isPk = false, isNotNull = false, defaultVal = undefined;

    while (true) {
      const t = p.peek();
      if (!t || t.value === ',' || t.value === ')') break;
      const tu = t.upper || t.value.toUpperCase();
      if (tu === 'PRIMARY') { p.next(); p.expect('KEY'); isPk = true; pk = colName; }
      else if (tu === 'NOT') { p.next(); p.next(); isNotNull = true; }
      else if (tu === 'DEFAULT') { p.next(); defaultVal = resolveValue(p.next()); }
      else if (tu === 'UNIQUE' || tu === 'AUTO_INCREMENT') { p.next(); }
      else break;
    }

    columns.push({ name: colName, type: normalType, pk: isPk, notNull: isNotNull, default: defaultVal });
    if (!p.match(',')) break;
  }

  p.expect(')');
  db.createTable(name, columns, pk);
  return { type: 'ok', message: `Table '${name}' created (${columns.length} columns)`, affected: 0 };
}

/**
 * INSERT INTO
 */
function execInsert(p, db) {
  p.expect('INSERT');
  p.expect('INTO');
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);
  let colNames = null;

  if (p.peek() && p.peek().value === '(') {
    const saved = p.pos;
    p.next();
    const maybeIdent = p.peek();
    if (
      maybeIdent &&
      (maybeIdent.type === 'IDENT' || maybeIdent.type === 'KW') &&
      (maybeIdent.upper || maybeIdent.value).toUpperCase() !== 'VALUES'
    ) {
      colNames = [];
      while (true) {
        colNames.push(p.ident().toLowerCase());
        if (!p.match(',')) break;
      }
      p.expect(')');
    } else {
      p.pos = saved;
    }
  }

  p.expect('VALUES');
  let rowsInserted = 0;

  do {
    p.expect('(');
    const vals = [];
    while (true) {
      vals.push(parseValue(p));
      if (!p.match(',')) break;
    }
    p.expect(')');

    const row = {};
    if (colNames) {
      if (colNames.length !== vals.length) {
        throw new Error(`Column count (${colNames.length}) doesn't match value count (${vals.length})`);
      }
      colNames.forEach((c, i) => (row[c] = vals[i]));
      tbl.columns.forEach((col) => {
        if (!(col.name in row)) row[col.name] = col.default !== undefined ? col.default : null;
      });
    } else {
      if (vals.length !== tbl.columns.length) {
        throw new Error(`Value count (${vals.length}) doesn't match column count (${tbl.columns.length})`);
      }
      tbl.columns.forEach((col, i) => (row[col.name] = vals[i]));
    }

    if (tbl.pk) {
      const pkVal = row[tbl.pk];
      if (tbl.rows.some((r) => r[tbl.pk] === pkVal)) {
        throw new Error(`Duplicate PRIMARY KEY value: ${pkVal}`);
      }
    }

    tbl.rows.push(row);
    rowsInserted++;
  } while (p.match(','));

  return { type: 'ok', message: `${rowsInserted} row(s) inserted into '${name}'`, affected: rowsInserted };
}

/**
 * SELECT
 */
function execSelect(p, db) {
  p.expect('SELECT');
  let distinct = p.match('DISTINCT');

  // Parse select list
  const selectCols = [];
  while (true) {
    if (p.peek() && p.peek().value === '*') {
      p.next();
      selectCols.push({ type: 'star' });
    } else {
      const t = p.peek();
      const upper = t ? (t.upper || t.value.toUpperCase()) : '';

      if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(upper)) {
        p.next();
        p.expect('(');
        let arg = '*';
        if (p.peek() && p.peek().value === '*') {
          p.next(); // consume '*'
        } else if (p.peek() && p.peek().value !== ')') {
          arg = p.ident().toLowerCase();
        }
        p.expect(')');
        let alias = `${upper}(${arg})`;
        if (p.match('AS')) alias = p.ident();
        selectCols.push({ type: 'agg', fn: upper, arg, alias });
      } else {
        const col = p.ident().toLowerCase();
        let alias = col;
        if (p.match('AS')) alias = p.ident().toLowerCase();
        selectCols.push({ type: 'col', name: col, alias });
      }
    }
    if (!p.match(',')) break;
  }

  // FROM
  let tblName = null;
  if (p.match('FROM')) {
    tblName = p.ident().toLowerCase();
    if (p.peek() && p.peek().type === 'IDENT') p.ident(); // alias (unused)
  }

  // JOIN
  let joinTable = null, joinOn = null;
  if (tblName && (p.match('JOIN') || (p.match('INNER') && p.match('JOIN')) || (p.match('LEFT') && p.match('JOIN')))) {
    joinTable = p.ident().toLowerCase();
    p.expect('ON');
    joinOn = parseCondition(p);
  }

  // WHERE
  let whereClause = null;
  if (p.match('WHERE')) whereClause = parseCondition(p);

  // GROUP BY
  let groupBy = null;
  if (p.match('GROUP')) {
    p.expect('BY');
    groupBy = [];
    while (true) {
      groupBy.push(p.ident().toLowerCase());
      if (!p.match(',')) break;
    }
  }

  // ORDER BY
  let orderBy = null;
  if (p.match('ORDER')) {
    p.expect('BY');
    orderBy = [];
    while (true) {
      const col = p.ident().toLowerCase();
      let dir = 'ASC';
      if (p.match('DESC')) dir = 'DESC';
      else p.match('ASC');
      orderBy.push({ col, dir });
      if (!p.match(',')) break;
    }
  }

  // LIMIT / OFFSET
  let limit = null, offset = 0;
  if (p.match('LIMIT')) limit = p.next().value;
  if (p.match('OFFSET')) offset = p.next().value;

  if (!tblName) {
    return { type: 'rows', columns: ['result'], rows: [{ result: 'OK' }], affected: 1 };
  }

  const table = db.getTable(tblName);
  let rows = table.rows.map((r) => ({ ...r }));

  // JOIN
  if (joinTable) {
    const jt = db.getTable(joinTable);
    const joined = [];
    for (const row of rows) {
      for (const jr of jt.rows) {
        const merged = { ...row, ...jr };
        if (evalCondition(joinOn, merged)) joined.push(merged);
      }
    }
    rows = joined;
  }

  // WHERE
  if (whereClause) rows = rows.filter((r) => evalCondition(whereClause, r));

  // GROUP BY + aggregations
  const hasAgg = selectCols.some((c) => c.type === 'agg');
  if (hasAgg || groupBy) {
    const groups = {};
    const groupKey = (row) => groupBy ? groupBy.map((c) => row[c]).join('::') : '__all__';
    for (const row of rows) {
      const k = groupKey(row);
      if (!groups[k]) groups[k] = [];
      groups[k].push(row);
    }
    rows = Object.values(groups).map((grp) => {
      const out = {};
      if (groupBy) groupBy.forEach((c) => (out[c] = grp[0][c]));
      for (const sc of selectCols) {
        if (sc.type === 'agg') {
          const vals = grp
            .map((r) => r[sc.arg === '*' ? Object.keys(r)[0] : sc.arg])
            .filter((v) => v !== null);
          if (sc.fn === 'COUNT') out[sc.alias] = sc.arg === '*' ? grp.length : vals.length;
          else if (sc.fn === 'SUM') out[sc.alias] = vals.reduce((a, b) => a + Number(b), 0);
          else if (sc.fn === 'AVG') out[sc.alias] = vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null;
          else if (sc.fn === 'MIN') out[sc.alias] = vals.length ? Math.min(...vals.map(Number)) : null;
          else if (sc.fn === 'MAX') out[sc.alias] = vals.length ? Math.max(...vals.map(Number)) : null;
        } else if (sc.type === 'col') {
          out[sc.alias] = grp[0][sc.name];
        }
      }
      return out;
    });
  }

  // ORDER BY
  if (orderBy) {
    rows.sort((a, b) => {
      for (const { col, dir } of orderBy) {
        const av = a[col], bv = b[col];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        if (cmp !== 0) return dir === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  // OFFSET / LIMIT
  if (offset) rows = rows.slice(offset);
  if (limit !== null) rows = rows.slice(0, limit);

  // DISTINCT
  if (distinct) {
    const seen = new Set();
    rows = rows.filter((r) => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // Projection
  let cols;
  if (selectCols.length === 1 && selectCols[0].type === 'star') {
    cols = table.columns.map((c) => c.name);
    if (joinTable) {
      const jt = db.getTable(joinTable);
      jt.columns.forEach((c) => { if (!cols.includes(c.name)) cols.push(c.name); });
    }
  } else {
    cols = selectCols.filter((s) => s.type !== 'star').map((s) => s.alias || s.name);
    rows = rows.map((row) => {
      const out = {};
      for (const sc of selectCols) {
        if (sc.type === 'star') Object.assign(out, row);
        else if (sc.type === 'col') out[sc.alias] = row[sc.name] !== undefined ? row[sc.name] : null;
        else if (sc.type === 'agg') out[sc.alias] = row[sc.alias];
      }
      return out;
    });
  }

  return { type: 'rows', columns: cols, rows, affected: rows.length };
}

/**
 * UPDATE
 */
function execUpdate(p, db) {
  p.expect('UPDATE');
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);
  p.expect('SET');

  const assignments = [];
  while (true) {
    const col = p.ident().toLowerCase();
    p.expect('=');
    const val = parseValue(p);
    assignments.push({ col, val });
    if (!p.match(',')) break;
  }

  let whereClause = null;
  if (p.match('WHERE')) whereClause = parseCondition(p);

  let count = 0;
  for (const row of tbl.rows) {
    if (!whereClause || evalCondition(whereClause, row)) {
      assignments.forEach(({ col, val }) => (row[col] = val));
      count++;
    }
  }

  return { type: 'ok', message: `${count} row(s) updated in '${name}'`, affected: count };
}

/**
 * DELETE
 */
function execDelete(p, db) {
  p.expect('DELETE');
  p.expect('FROM');
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);

  let whereClause = null;
  if (p.match('WHERE')) whereClause = parseCondition(p);

  const before = tbl.rows.length;
  tbl.rows = whereClause ? tbl.rows.filter((r) => !evalCondition(whereClause, r)) : [];
  const count = before - tbl.rows.length;

  return { type: 'ok', message: `${count} row(s) deleted from '${name}'`, affected: count };
}

/**
 * DROP TABLE
 */
function execDrop(p, db) {
  p.expect('DROP');
  p.expect('TABLE');
  const name = p.ident().toLowerCase();
  db.dropTable(name);
  return { type: 'ok', message: `Table '${name}' dropped`, affected: 0 };
}

/**
 * SHOW TABLES
 */
function execShow(p, db) {
  p.expect('SHOW');
  p.expect('TABLES');
  const rows = Object.keys(db.tables).map((n) => ({
    table_name: n,
    rows: db.tables[n].rows.length,
    columns: db.tables[n].columns.length,
  }));
  return { type: 'rows', columns: ['table_name', 'rows', 'columns'], rows, affected: rows.length };
}

/**
 * DESCRIBE / DESC
 */
function execDescribe(p, db) {
  p.next(); // consume DESC or DESCRIBE
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);
  const rows = tbl.columns.map((c) => ({
    column_name: c.name,
    type: c.type,
    primary_key: c.pk ? 'YES' : 'NO',
    not_null: c.notNull ? 'YES' : 'NO',
    default: c.default !== undefined ? String(c.default) : 'NULL',
  }));
  return {
    type: 'rows',
    columns: ['column_name', 'type', 'primary_key', 'not_null', 'default'],
    rows,
    affected: rows.length,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveValue(t) {
  if (!t) return null;
  if (t.type === 'STRING') return t.value;
  if (t.type === 'NUMBER') return t.value;
  return null;
}

import type {
  QueryResult, Row, Column, ColumnType,
  SelectCol, AggSelectCol, ColSelectCol, OrderByClause,
} from '../models/types.js';
import type { Database } from '../models/Database.js';
import { Parser } from './parser.js';
import { tokenize } from './tokenizer.js';
import { parseCondition, parseValue, evalCondition, parseExpr } from './condition.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split a SQL string on semicolons, respecting string literals.
 */
export function splitStatements(sql: string): string[] {
  const stmts: string[] = [];
  let current = '';
  let inStr = false;
  let strChar = '';

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!inStr && (c === "'" || c === '"')) {
      inStr = true; strChar = c; current += c;
    } else if (inStr && c === strChar) {
      if (sql[i + 1] === strChar) { current += c + sql[++i]; }
      else { inStr = false; current += c; }
    } else if (!inStr && c === ';') {
      stmts.push(current.trim()); current = '';
    } else {
      current += c;
    }
  }

  if (current.trim()) stmts.push(current.trim());
  return stmts;
}

/**
 * Execute all SQL statements in `sql` against the given database instance.
 * Returns one `QueryResult` per statement.
 */
export function execute(sql: string, db: Database): QueryResult[] {
  const results: QueryResult[] = [];
  for (const stmt of splitStatements(sql)) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    results.push(executeOne(trimmed, db));
  }
  return results;
}

/** Returns true for statement types that mutate the database. */
export function isMutating(results: QueryResult[]): boolean {
  return results.some(r => r.type === 'ok');
}

// ─── Statement Dispatcher ─────────────────────────────────────────────────────

function executeOne(sql: string, db: Database): QueryResult {
  const tokens = tokenize(sql);
  if (!tokens.length) return { type: 'empty' };

  const p = new Parser(tokens);
  const firstKw = (tokens[0].upper ?? String(tokens[0].value)).toUpperCase();

  switch (firstKw) {
    case 'CREATE':   return execCreate(p, db);
    case 'INSERT':   return execInsert(p, db);
    case 'SELECT':   return execSelect(p, db);
    case 'UPDATE':   return execUpdate(p, db);
    case 'DELETE':   return execDelete(p, db);
    case 'DROP':     return execDrop(p, db);
    case 'SHOW':     return execShow(p, db);
    case 'DESCRIBE':
    case 'DESC':     return execDescribe(p, db);
    default:
      throw new Error(`Unknown SQL statement: '${String(tokens[0].value)}'`);
  }
}

// ─── DDL: CREATE TABLE ────────────────────────────────────────────────────────

function execCreate(p: Parser, db: Database): QueryResult {
  p.expect('CREATE');
  p.expect('TABLE');
  const name = p.ident().toLowerCase();

  p.expect('(');
  const columns: Column[] = [];
  let pk: string | null = null;

  while (true) {
    const colName = p.ident().toLowerCase();
    const typeToken = p.next();
    const rawType = String(typeToken.value).toUpperCase();

    const colType: ColumnType =
      ['INT', 'INTEGER'].includes(rawType)              ? 'INT'     :
      ['REAL', 'FLOAT', 'NUMERIC', 'DOUBLE'].includes(rawType) ? 'REAL'    :
      ['BOOL', 'BOOLEAN'].includes(rawType)             ? 'BOOLEAN' :
      'TEXT';

    let isPk = false;
    let isNotNull = false;
    let defaultVal: unknown = undefined;

    // Parse inline column constraints
    while (true) {
      const t = p.peek();
      if (!t || String(t.value) === ',' || String(t.value) === ')') break;
      const tu = (t.upper ?? String(t.value)).toUpperCase();
      if (tu === 'PRIMARY')      { p.next(); p.expect('KEY'); isPk = true; pk = colName; }
      else if (tu === 'NOT')     { p.next(); p.next(); isNotNull = true; }
      else if (tu === 'DEFAULT') { p.next(); defaultVal = resolveValue(p.next()); }
      else if (tu === 'UNIQUE' || tu === 'AUTO_INCREMENT') { p.next(); }
      else break;
    }

    columns.push({ name: colName, type: colType, pk: isPk, notNull: isNotNull, default: defaultVal });
    if (!p.match(',')) break;
  }

  p.expect(')');
  db.createTable(name, columns, pk);
  return { type: 'ok', message: `Table '${name}' created (${columns.length} columns)`, affected: 0 };
}

// ─── DML: INSERT INTO ─────────────────────────────────────────────────────────

function execInsert(p: Parser, db: Database): QueryResult {
  p.expect('INSERT');
  p.expect('INTO');
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);
  let colNames: string[] | null = null;

  // Optional explicit column list: INSERT INTO t (a, b) VALUES ...
  if (p.peek() && String(p.peek()!.value) === '(') {
    const savedPos = p.pos;
    p.next(); // consume '('
    const maybeIdent = p.peek();
    if (
      maybeIdent &&
      (maybeIdent.type === 'IDENT' || maybeIdent.type === 'KW') &&
      (maybeIdent.upper ?? String(maybeIdent.value)).toUpperCase() !== 'VALUES'
    ) {
      colNames = [];
      while (true) {
        colNames.push(p.ident().toLowerCase());
        if (!p.match(',')) break;
      }
      p.expect(')');
    } else {
      p.pos = savedPos; // backtrack
    }
  }

  p.expect('VALUES');
  let rowsInserted = 0;

  do {
    p.expect('(');
    const vals: unknown[] = [];
    while (true) {
      vals.push(parseValue(p));
      if (!p.match(',')) break;
    }
    p.expect(')');

    const row: Row = {};

    if (colNames) {
      if (colNames.length !== vals.length) {
        throw new Error(
          `Column count (${colNames.length}) doesn't match value count (${vals.length})`
        );
      }
      colNames.forEach((c, i) => { row[c] = vals[i]; });
      tbl.columns.forEach(col => {
        if (!(col.name in row)) row[col.name] = col.default !== undefined ? col.default : null;
      });
    } else {
      if (vals.length !== tbl.columns.length) {
        throw new Error(
          `Value count (${vals.length}) doesn't match column count (${tbl.columns.length})`
        );
      }
      tbl.columns.forEach((col, i) => { row[col.name] = vals[i]; });
    }

    db.insertRow(name, row);
    rowsInserted++;
  } while (p.match(','));

  return { type: 'ok', message: `${rowsInserted} row(s) inserted into '${name}'`, affected: rowsInserted };
}

// ─── DQL: SELECT ─────────────────────────────────────────────────────────────

function execSelect(p: Parser, db: Database): QueryResult {
  p.expect('SELECT');
  const distinct = p.match('DISTINCT');
  const selectCols = parseSelectList(p);

  // FROM clause
  let tblName: string | null = null;
  if (p.match('FROM')) {
    tblName = p.ident().toLowerCase();
    if (p.peek()?.type === 'IDENT') p.ident(); // consume optional alias
  }

  // JOIN clause (INNER or LEFT)
  let joinTable: string | null = null;
  let joinOn = null;
  if (tblName) {
    if (p.match('JOIN') || (p.match('INNER') && p.match('JOIN')) || (p.match('LEFT') && p.match('JOIN'))) {
      joinTable = p.ident().toLowerCase();
      p.expect('ON');
      joinOn = parseCondition(p);
    }
  }

  // WHERE
  const whereClause = p.match('WHERE') ? parseCondition(p) : null;

  // GROUP BY
  let groupBy: string[] | null = null;
  if (p.match('GROUP')) {
    p.expect('BY');
    groupBy = [];
    while (true) { groupBy.push(p.ident().toLowerCase()); if (!p.match(',')) break; }
  }

  // ORDER BY
  let orderBy: OrderByClause[] | null = null;
  if (p.match('ORDER')) {
    p.expect('BY');
    orderBy = [];
    while (true) {
      const col = p.ident().toLowerCase();
      let dir: 'ASC' | 'DESC' = 'ASC';
      if (p.match('DESC')) dir = 'DESC';
      else p.match('ASC');
      orderBy.push({ col, dir });
      if (!p.match(',')) break;
    }
  }

  // LIMIT / OFFSET
  let limit: number | null = null;
  let offset = 0;
  if (p.match('LIMIT')) limit = Number(p.next().value);
  if (p.match('OFFSET')) offset = Number(p.next().value);

  // SELECT without FROM
  if (!tblName) {
    return { type: 'rows', columns: ['result'], rows: [{ result: 'OK' }], affected: 1 };
  }

  const table = db.getTable(tblName);
  let rows: Row[] = table.rows.map(r => ({ ...r }));

  // Apply JOIN
  if (joinTable) {
    const jt = db.getTable(joinTable);
    const joined: Row[] = [];
    for (const row of rows) {
      for (const jr of jt.rows) {
        const merged = { ...row, ...jr };
        if (evalCondition(joinOn, merged)) joined.push(merged);
      }
    }
    rows = joined;
  }

  // Apply WHERE
  if (whereClause) rows = rows.filter(r => evalCondition(whereClause, r));

  // Apply GROUP BY + aggregations
  const hasAgg = selectCols.some(c => c.type === 'agg');
  if (hasAgg || groupBy) {
    rows = applyGroupBy(rows, selectCols, groupBy);
  }

  // Apply ORDER BY
  if (orderBy) {
    rows.sort((a, b) => {
      for (const { col, dir } of orderBy!) {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        if (cmp !== 0) return dir === 'DESC' ? -cmp : cmp;
      }
      return 0;
    });
  }

  // Apply OFFSET / LIMIT
  if (offset) rows = rows.slice(offset);
  if (limit !== null) rows = rows.slice(0, limit);

  // Final projection
  const { cols, projectedRows } = project(rows, selectCols, table, joinTable ? db.getTable(joinTable) : null);

  // Apply DISTINCT after projection so dedup is on final columns only
  let finalRows = projectedRows;
  if (distinct) {
    const seen = new Set<string>();
    finalRows = projectedRows.filter(r => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  return { type: 'rows', columns: cols, rows: finalRows, affected: finalRows.length };
}

// ─── DML: UPDATE ─────────────────────────────────────────────────────────────

function execUpdate(p: Parser, db: Database): QueryResult {
  p.expect('UPDATE');
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);
  p.expect('SET');

  const assignments: Array<{ col: string; val: unknown }> = [];
  while (true) {
    const col = p.ident().toLowerCase();
    p.expect('=');
    const val = parseValue(p);
    assignments.push({ col, val });
    if (!p.match(',')) break;
  }

  const whereClause = p.match('WHERE') ? parseCondition(p) : null;
  let count = 0;

  for (const row of tbl.rows) {
    if (!whereClause || evalCondition(whereClause, row)) {
      assignments.forEach(({ col, val }) => { row[col] = val; });
      count++;
    }
  }

  return { type: 'ok', message: `${count} row(s) updated in '${name}'`, affected: count };
}

// ─── DML: DELETE ─────────────────────────────────────────────────────────────

function execDelete(p: Parser, db: Database): QueryResult {
  p.expect('DELETE');
  p.expect('FROM');
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);

  const whereClause = p.match('WHERE') ? parseCondition(p) : null;
  const before = tbl.rows.length;
  tbl.rows = whereClause ? tbl.rows.filter(r => !evalCondition(whereClause, r)) : [];
  const count = before - tbl.rows.length;

  return { type: 'ok', message: `${count} row(s) deleted from '${name}'`, affected: count };
}

// ─── DDL: DROP TABLE ─────────────────────────────────────────────────────────

function execDrop(p: Parser, db: Database): QueryResult {
  p.expect('DROP');
  p.expect('TABLE');
  const name = p.ident().toLowerCase();
  db.dropTable(name);
  return { type: 'ok', message: `Table '${name}' dropped`, affected: 0 };
}

// ─── Meta: SHOW TABLES ───────────────────────────────────────────────────────

function execShow(p: Parser, db: Database): QueryResult {
  p.expect('SHOW');
  p.expect('TABLES');
  const rows = db.getTableNames().map(n => ({
    table_name: n,
    rows: db.tables[n].rows.length,
    columns: db.tables[n].columns.length,
  }));
  return { type: 'rows', columns: ['table_name', 'rows', 'columns'], rows, affected: rows.length };
}

// ─── Meta: DESCRIBE ──────────────────────────────────────────────────────────

function execDescribe(p: Parser, db: Database): QueryResult {
  p.next(); // consume DESC or DESCRIBE
  const name = p.ident().toLowerCase();
  const tbl = db.getTable(name);

  const rows = tbl.columns.map(c => ({
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse the SELECT column list (handles *, col aliases, and aggregates) */
function parseSelectList(p: Parser): SelectCol[] {
  const cols: SelectCol[] = [];

  while (true) {
    const peek = p.peek();

    if (peek && String(peek.value) === '*') {
      p.next();
      cols.push({ type: 'star' });
    } else {
      const t = p.peek();
      const upper = t ? (t.upper ?? String(t.value).toUpperCase()) : '';

      if (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(upper)) {
        p.next();
        p.expect('(');
        let arg = '*';
        if (p.peek() && String(p.peek()!.value) === '*') {
          p.next(); // consume '*'
        } else if (p.peek() && String(p.peek()!.value) !== ')') {
          arg = p.ident().toLowerCase();
        }
        p.expect(')');
        let alias = `${upper}(${arg})`;
        if (p.match('AS')) alias = p.ident();
        cols.push({ type: 'agg', fn: upper as AggSelectCol['fn'], arg, alias });
      } else {
        // Try to parse as expression (col ref)
        const expr = parseExpr(p);
        let colName = 'expr';
        if ('type' in expr && expr.type === 'col') colName = expr.name;
        else if ('type' in expr && expr.type === 'val') colName = String(expr.value);
        let alias = colName;
        if (p.match('AS')) alias = p.ident().toLowerCase();
        cols.push({ type: 'col', name: colName, alias } as ColSelectCol);
      }
    }

    if (!p.match(',')) break;
  }

  return cols;
}

/** Apply GROUP BY aggregations to a row set */
function applyGroupBy(rows: Row[], selectCols: SelectCol[], groupBy: string[] | null): Row[] {
  const groups: Record<string, Row[]> = {};
  const groupKey = (row: Row): string =>
    groupBy ? groupBy.map(c => String(row[c])).join('::') : '__all__';

  for (const row of rows) {
    const k = groupKey(row);
    if (!groups[k]) groups[k] = [];
    groups[k].push(row);
  }

  return Object.values(groups).map(grp => {
    const out: Row = {};
    if (groupBy) groupBy.forEach(c => { out[c] = grp[0][c]; });

    for (const sc of selectCols) {
      if (sc.type === 'agg') {
        const argKey = sc.arg === '*' ? Object.keys(grp[0])[0] : sc.arg;
        const vals = grp.map(r => r[argKey]).filter(v => v !== null && v !== undefined);

        if (sc.fn === 'COUNT') out[sc.alias] = sc.arg === '*' ? grp.length : vals.length;
        else if (sc.fn === 'SUM') out[sc.alias] = vals.reduce((a, b) => (a as number) + Number(b), 0);
        else if (sc.fn === 'AVG') out[sc.alias] = vals.length ? vals.reduce((a, b) => (a as number) + Number(b), 0) as number / vals.length : null;
        else if (sc.fn === 'MIN') out[sc.alias] = vals.length ? Math.min(...vals.map(Number)) : null;
        else if (sc.fn === 'MAX') out[sc.alias] = vals.length ? Math.max(...vals.map(Number)) : null;
      } else if (sc.type === 'col') {
        out[sc.alias] = grp[0][sc.name];
      }
    }

    return out;
  });
}

/** Apply final column projection to the row set */
function project(
  rows: Row[],
  selectCols: SelectCol[],
  table: import('../models/types.js').TableSchema,
  joinTable: import('../models/types.js').TableSchema | null,
): { cols: string[]; projectedRows: Row[] } {
  if (selectCols.length === 1 && selectCols[0].type === 'star') {
    const cols = table.columns.map(c => c.name);
    if (joinTable) {
      joinTable.columns.forEach(c => { if (!cols.includes(c.name)) cols.push(c.name); });
    }
    return { cols, projectedRows: rows };
  }

  const cols = selectCols.filter(s => s.type !== 'star').map(s => (s as ColSelectCol | AggSelectCol).alias);
  const projectedRows = rows.map(row => {
    const out: Row = {};
    for (const sc of selectCols) {
      if (sc.type === 'star') Object.assign(out, row);
      else if (sc.type === 'col') out[sc.alias] = row[sc.name] !== undefined ? row[sc.name] : null;
      else if (sc.type === 'agg') out[sc.alias] = row[sc.alias];
    }
    return out;
  });

  return { cols, projectedRows };
}

/** Resolve a token's value to a JS primitive (used for DEFAULT constraints) */
function resolveValue(t: import('../models/types.js').Token | undefined): unknown {
  if (!t) return null;
  if (t.type === 'STRING') return t.value;
  if (t.type === 'NUMBER') return t.value;
  return null;
}

/**
 * Parses and evaluates WHERE / JOIN ON conditions.
 */

/**
 * Parse a full condition expression (entry point).
 * @param {import('./parser.js').Parser} p
 * @returns {Object} AST node
 */
export function parseCondition(p) {
  return parseOr(p);
}

function parseOr(p) {
  let left = parseAnd(p);
  while (p.match('OR')) {
    const right = parseAnd(p);
    left = { op: 'OR', left, right };
  }
  return left;
}

function parseAnd(p) {
  let left = parsePrimary(p);
  while (p.match('AND')) {
    const right = parsePrimary(p);
    left = { op: 'AND', left, right };
  }
  return left;
}

function parsePrimary(p) {
  if (p.match('NOT')) {
    return { op: 'NOT', expr: parsePrimary(p) };
  }

  if (p.peek() && p.peek().value === '(') {
    p.next();
    const expr = parseCondition(p);
    p.expect(')');
    return expr;
  }

  const left = parseExpr(p);
  const t = p.peek();
  if (!t) return left;

  const tu = t.upper || t.value.toUpperCase();

  if (tu === 'IS') {
    p.next();
    const notNull = p.match('NOT');
    p.expect('NULL');
    return { op: notNull ? 'IS NOT NULL' : 'IS NULL', left };
  }

  if (tu === 'LIKE') {
    p.next();
    const right = parseExpr(p);
    return { op: 'LIKE', left, right };
  }

  if (tu === 'IN') {
    p.next();
    p.expect('(');
    const vals = [];
    while (true) {
      vals.push(parseValue(p));
      if (!p.match(',')) break;
    }
    p.expect(')');
    return { op: 'IN', left, vals };
  }

  if (tu === 'BETWEEN') {
    p.next();
    const low = parseExpr(p);
    p.expect('AND');
    const high = parseExpr(p);
    return { op: 'BETWEEN', left, low, high };
  }

  if (
    t.type === 'OP' ||
    (t.type === 'PUNCT' && ['=', '<', '>'].includes(t.value))
  ) {
    const op = p.next().value;
    const right = parseExpr(p);
    return { op, left, right };
  }

  return left;
}

/**
 * Parse an expression (column ref or literal).
 * @param {import('./parser.js').Parser} p
 * @returns {Object}
 */
export function parseExpr(p) {
  const t = p.peek();
  if (!t) return { type: 'val', value: null };
  if (t.type === 'STRING') { p.next(); return { type: 'val', value: t.value }; }
  if (t.type === 'NUMBER') { p.next(); return { type: 'val', value: t.value }; }
  const upper = t.upper || t.value.toUpperCase();
  if (upper === 'NULL') { p.next(); return { type: 'val', value: null }; }
  if (upper === 'TRUE') { p.next(); return { type: 'val', value: true }; }
  if (upper === 'FALSE') { p.next(); return { type: 'val', value: false }; }
  if (t.type === 'IDENT' || t.type === 'KW') {
    p.next();
    return { type: 'col', name: t.value.toLowerCase() };
  }
  return { type: 'val', value: null };
}

/**
 * Parse a single scalar value token.
 * @param {import('./parser.js').Parser} p
 * @returns {*}
 */
export function parseValue(p) {
  const t = p.peek();
  if (!t) return null;
  if (t.type === 'STRING') { p.next(); return t.value; }
  if (t.type === 'NUMBER') { p.next(); return t.value; }
  const upper = t.upper || t.value.toUpperCase();
  if (upper === 'NULL') { p.next(); return null; }
  if (upper === 'TRUE') { p.next(); return true; }
  if (upper === 'FALSE') { p.next(); return false; }
  p.next();
  return t.value;
}

/**
 * Evaluate a condition AST node against a row.
 * @param {Object | null} cond
 * @param {Object} row
 * @returns {boolean}
 */
export function evalCondition(cond, row) {
  if (!cond) return true;

  const getVal = (expr) => {
    if (!expr) return null;
    if (expr.type === 'val') return expr.value;
    if (expr.type === 'col') return row[expr.name] !== undefined ? row[expr.name] : null;
    return null;
  };

  if (cond.op === 'AND') return evalCondition(cond.left, row) && evalCondition(cond.right, row);
  if (cond.op === 'OR') return evalCondition(cond.left, row) || evalCondition(cond.right, row);
  if (cond.op === 'NOT') return !evalCondition(cond.expr, row);
  if (cond.op === 'IS NULL') return getVal(cond.left) === null;
  if (cond.op === 'IS NOT NULL') return getVal(cond.left) !== null;
  if (cond.op === 'IN') return cond.vals.includes(getVal(cond.left));
  if (cond.op === 'BETWEEN') {
    const v = getVal(cond.left);
    return v >= getVal(cond.low) && v <= getVal(cond.high);
  }
  if (cond.op === 'LIKE') {
    const v = String(getVal(cond.left) ?? '');
    const pattern = String(getVal(cond.right) ?? '')
      .replace(/%/g, '.*')
      .replace(/_/g, '.');
    return new RegExp('^' + pattern + '$', 'i').test(v);
  }

  const l = getVal(cond.left);
  const r = getVal(cond.right);
  if (cond.op === '=') return l == r;
  if (cond.op === '<>' || cond.op === '!=') return l != r;
  if (cond.op === '<') return l < r;
  if (cond.op === '>') return l > r;
  if (cond.op === '<=') return l <= r;
  if (cond.op === '>=') return l >= r;
  return false;
}

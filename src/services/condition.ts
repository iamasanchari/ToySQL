import type { ConditionNode, Expr, Row } from '../models/types.js';
import type { Parser } from './parser.js';

// ─── Condition Parser ─────────────────────────────────────────────────────────

/**
 * Entry point: parse a full condition expression (handles OR precedence).
 */
export function parseCondition(p: Parser): ConditionNode {
  return parseOr(p);
}

function parseOr(p: Parser): ConditionNode {
  let left = parseAnd(p);
  while (p.match('OR')) {
    const right = parseAnd(p);
    left = { op: 'OR', left, right };
  }
  return left;
}

function parseAnd(p: Parser): ConditionNode {
  let left = parsePrimary(p);
  while (p.match('AND')) {
    const right = parsePrimary(p);
    left = { op: 'AND', left, right };
  }
  return left;
}

function parsePrimary(p: Parser): ConditionNode {
  // NOT <expr>
  if (p.match('NOT')) {
    return { op: 'NOT', expr: parsePrimary(p) };
  }

  // Grouped: ( <condition> )
  const peek = p.peek();
  if (peek && String(peek.value) === '(') {
    p.next();
    const expr = parseCondition(p);
    p.expect(')');
    return expr;
  }

  const left = parseExpr(p);
  const t = p.peek();
  if (!t) return left;

  const tu = (t.upper ?? String(t.value)).toUpperCase();

  // IS NULL / IS NOT NULL
  if (tu === 'IS') {
    p.next();
    const notNull = p.match('NOT');
    p.expect('NULL');
    return { op: notNull ? 'IS NOT NULL' : 'IS NULL', left: left as Expr };
  }

  // LIKE
  if (tu === 'LIKE') {
    p.next();
    const right = parseExpr(p);
    return { op: 'LIKE', left: left as Expr, right: right as Expr };
  }

  // IN (val, val, ...)
  if (tu === 'IN') {
    p.next();
    p.expect('(');
    const vals: unknown[] = [];
    while (true) {
      vals.push(parseValue(p));
      if (!p.match(',')) break;
    }
    p.expect(')');
    return { op: 'IN', left: left as Expr, vals };
  }

  // BETWEEN <low> AND <high>
  if (tu === 'BETWEEN') {
    p.next();
    const low = parseExpr(p);
    p.expect('AND');
    const high = parseExpr(p);
    return { op: 'BETWEEN', left: left as Expr, low: low as Expr, high: high as Expr };
  }

  // Comparison operators
  if (t.type === 'OP' || (t.type === 'PUNCT' && ['=', '<', '>'].includes(String(t.value)))) {
    const op = p.next().value as '=' | '<>' | '<' | '>' | '<=' | '>=';
    const right = parseExpr(p);
    return { op, left: left as Expr, right: right as Expr };
  }

  return left;
}

// ─── Expression Parser ────────────────────────────────────────────────────────

/**
 * Parse a single expression: a column reference or a scalar value.
 */
export function parseExpr(p: Parser): ConditionNode {
  const t = p.peek();
  if (!t) return { type: 'val', value: null };

  if (t.type === 'STRING') { p.next(); return { type: 'val', value: t.value }; }
  if (t.type === 'NUMBER') { p.next(); return { type: 'val', value: t.value }; }

  const upper = t.upper ?? String(t.value).toUpperCase();
  if (upper === 'NULL')  { p.next(); return { type: 'val', value: null }; }
  if (upper === 'TRUE')  { p.next(); return { type: 'val', value: true }; }
  if (upper === 'FALSE') { p.next(); return { type: 'val', value: false }; }

  if (t.type === 'IDENT' || t.type === 'KW') {
    p.next();
    // Strip optional table prefix: "u.id" is tokenized as IDENT("u"), PUNCT("."), IDENT("id")
    // We need to consume the dot and next ident if present
    let name = String(t.value).toLowerCase();
    const next = p.peek();
    if (next && String(next.value) === '.') {
      p.next(); // consume '.'
      const col = p.peek();
      if (col && (col.type === 'IDENT' || col.type === 'KW')) {
        p.next();
        name = String(col.value).toLowerCase(); // use only the column part
      }
    }
    return { type: 'col', name };
  }

  return { type: 'val', value: null };
}

/**
 * Parse a single scalar value token (used in INSERT VALUES, SET, IN lists, etc.)
 */
export function parseValue(p: Parser): unknown {
  const t = p.peek();
  if (!t) return null;

  if (t.type === 'STRING') { p.next(); return t.value; }
  if (t.type === 'NUMBER') { p.next(); return t.value; }

  const upper = t.upper ?? String(t.value).toUpperCase();
  if (upper === 'NULL')  { p.next(); return null; }
  if (upper === 'TRUE')  { p.next(); return true; }
  if (upper === 'FALSE') { p.next(); return false; }

  p.next();
  return t.value;
}

// ─── Condition Evaluator ──────────────────────────────────────────────────────

/**
 * Evaluate a parsed condition AST node against a single data row.
 * Returns `true` if the row satisfies the condition.
 */
export function evalCondition(cond: ConditionNode | null, row: Row): boolean {
  if (!cond) return true;

  const getVal = (expr: Expr): unknown => {
    if (expr.type === 'val') return expr.value;
    if (expr.type === 'col') return row[expr.name] !== undefined ? row[expr.name] : null;
    return null;
  };

  if ('op' in cond) {
    if (cond.op === 'AND') return evalCondition(cond.left, row) && evalCondition(cond.right, row);
    if (cond.op === 'OR')  return evalCondition(cond.left, row) || evalCondition(cond.right, row);
    if (cond.op === 'NOT') return !evalCondition(cond.expr, row);

    if (cond.op === 'IS NULL')     return getVal(cond.left) === null || getVal(cond.left) === undefined;
    if (cond.op === 'IS NOT NULL') return getVal(cond.left) !== null && getVal(cond.left) !== undefined;

    if (cond.op === 'IN') {
      const v = getVal(cond.left);
      // eslint-disable-next-line eqeqeq
      return cond.vals.some(val => val == v);
    }

    if (cond.op === 'BETWEEN') {
      const v = getVal(cond.left);
      return (v as number) >= (getVal(cond.low) as number) && (v as number) <= (getVal(cond.high) as number);
    }

    if (cond.op === 'LIKE') {
      const v = String(getVal(cond.left) ?? '');
      const pattern = String(getVal(cond.right) ?? '')
        .replace(/%/g, '.*')
        .replace(/_/g, '.');
      return new RegExp(`^${pattern}$`, 'i').test(v);
    }

    const compCond = cond as { op: string; left: Expr; right: Expr };
    const l = getVal(compCond.left);
    const r = getVal(compCond.right);

    // eslint-disable-next-line eqeqeq
    if (cond.op === '=')               return l == r;
    // eslint-disable-next-line eqeqeq
    if (cond.op === '<>' || cond.op === '!=') return l != r;
    if (cond.op === '<')  return (l as number) < (r as number);
    if (cond.op === '>')  return (l as number) > (r as number);
    if (cond.op === '<=') return (l as number) <= (r as number);
    if (cond.op === '>=') return (l as number) >= (r as number);
  }

  return false;
}

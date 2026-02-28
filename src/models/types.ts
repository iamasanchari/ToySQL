// ─── Token Types ──────────────────────────────────────────────────────────────

export type TokenType = 'STRING' | 'NUMBER' | 'KW' | 'IDENT' | 'OP' | 'PUNCT';

export interface Token {
  type: TokenType;
  value: string | number;
  /** Uppercase cache for keyword/identifier tokens */
  upper?: string;
}

export const KEYWORDS = new Set<string>([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP',
  'PRIMARY', 'KEY', 'INT', 'INTEGER', 'TEXT', 'VARCHAR',
  'REAL', 'FLOAT', 'BOOLEAN', 'NULL', 'NOT', 'AND', 'OR',
  'SHOW', 'TABLES', 'DESCRIBE', 'DESC', 'ASC', 'ORDER', 'BY',
  'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
  'MIN', 'MAX', 'GROUP', 'HAVING', 'INNER', 'JOIN', 'ON',
  'LEFT', 'RIGHT', 'OUTER', 'INDEX', 'UNIQUE', 'DEFAULT',
  'AUTO_INCREMENT', 'TRUE', 'FALSE', 'LIKE', 'IN', 'BETWEEN',
  'IS', 'EXISTS',
]);

// ─── Schema Types ──────────────────────────────────────────────────────────────

export type ColumnType = 'INT' | 'REAL' | 'TEXT' | 'BOOLEAN';

export interface Column {
  name: string;
  type: ColumnType;
  pk: boolean;
  notNull: boolean;
  default?: unknown;
}

export interface TableSchema {
  columns: Column[];
  rows: Row[];
  pk: string | null;
}

export type Row = Record<string, unknown>;

// ─── Query Result Types ────────────────────────────────────────────────────────

export interface RowsResult {
  type: 'rows';
  columns: string[];
  rows: Row[];
  affected: number;
}

export interface OkResult {
  type: 'ok';
  message: string;
  affected: number;
}

export interface EmptyResult {
  type: 'empty';
}

export type QueryResult = RowsResult | OkResult | EmptyResult;

// ─── AST Expression & Condition Node Types ───────────────────────────────────

export interface ValExpr {
  type: 'val';
  value: unknown;
}

export interface ColExpr {
  type: 'col';
  name: string;
}

export type Expr = ValExpr | ColExpr;

export type ConditionNode =
  | { op: 'AND' | 'OR'; left: ConditionNode; right: ConditionNode }
  | { op: 'NOT'; expr: ConditionNode }
  | { op: 'IS NULL' | 'IS NOT NULL'; left: Expr }
  | { op: 'IN'; left: Expr; vals: unknown[] }
  | { op: 'BETWEEN'; left: Expr; low: Expr; high: Expr }
  | { op: 'LIKE'; left: Expr; right: Expr }
  | { op: '=' | '<>' | '!=' | '<' | '>' | '<=' | '>='; left: Expr; right: Expr }
  | Expr;

// ─── SELECT Column Descriptor Types ──────────────────────────────────────────

export type AggregateFn = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

export interface StarSelectCol {
  type: 'star';
}

export interface ColSelectCol {
  type: 'col';
  name: string;
  alias: string;
}

export interface AggSelectCol {
  type: 'agg';
  fn: AggregateFn;
  arg: string;
  alias: string;
}

export type SelectCol = StarSelectCol | ColSelectCol | AggSelectCol;

export interface OrderByClause {
  col: string;
  dir: 'ASC' | 'DESC';
}

// ─── Persistence Types ────────────────────────────────────────────────────────

/**
 * Interface for pluggable storage backends.
 * Implement this to support any storage medium.
 */
export interface PersistenceAdapter {
  save(key: string, data: string): void;
  load(key: string): string | null;
  remove(key: string): void;
}

/**
 * Serializable snapshot of the database state for persistence.
 */
export interface DatabaseSnapshot {
  version: number;
  tables: Record<string, TableSchema>;
  sequence: Record<string, number>;
}

/**
 * Options passed to the ToySQL constructor.
 */
export interface ToySQLOptions {
  /**
   * If provided, the database state will be persisted using this adapter
   * after every mutating query (CREATE, INSERT, UPDATE, DELETE, DROP).
   *
   * @example
   * // Browser
   * const db = new ToySQL({ persistence: new LocalStorageAdapter() });
   *
   * @example
   * // Node.js
   * const db = new ToySQL({ persistence: new FileStorageAdapter('./mydb.json') });
   */
  persistence?: PersistenceAdapter;

  /**
   * The key under which the database snapshot is stored.
   * Defaults to `"toysql_db"`.
   */
  storageKey?: string;
}

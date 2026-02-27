/**
 * @typedef {'STRING' | 'NUMBER' | 'KW' | 'IDENT' | 'OP' | 'PUNCT'} TokenType
 *
 * @typedef {Object} Token
 * @property {TokenType} type
 * @property {string | number} value
 * @property {string} [upper] - Uppercase version of identifier/keyword value
 */

export const KEYWORDS = new Set([
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

/**
 * @typedef {Object} Column
 * @property {string} name
 * @property {'INT' | 'REAL' | 'TEXT' | 'BOOLEAN'} type
 * @property {boolean} pk
 * @property {boolean} notNull
 * @property {*} [default]
 */

/**
 * @typedef {Object} TableSchema
 * @property {Column[]} columns
 * @property {Object[]} rows
 * @property {string | null} pk
 */

/**
 * @typedef {Object} QueryResult
 * @property {'rows' | 'ok' | 'empty'} type
 * @property {string} [message]
 * @property {string[]} [columns]
 * @property {Object[]} [rows]
 * @property {number} [affected]
 */

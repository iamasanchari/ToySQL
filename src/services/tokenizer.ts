import { KEYWORDS, type Token } from '../models/types.js';

/**
 * Tokenizes a raw SQL string into a flat array of typed tokens.
 *
 * Handles:
 * - String literals (single and double quoted, with escape doubling)
 * - Integers and floats (including negative numbers)
 * - Two-character operators: `>=`, `<=`, `<>`, `!=`
 * - Single-char punctuation: `= < > ( ) , . ; *`
 * - Identifiers and SQL keywords
 * - Line comments (`-- ...`)
 */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  sql = sql.trim();

  while (i < sql.length) {
    // Skip whitespace
    if (/\s/.test(sql[i])) { i++; continue; }

    // Line comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }

    // String literal (single or double quoted, '' escape supported)
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      let str = '';
      i++;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) {
          str += quote;
          i += 2;
        } else if (sql[i] === quote) {
          i++;
          break;
        } else {
          str += sql[i++];
        }
      }
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Number literal (including leading negative sign)
    if (/[0-9]/.test(sql[i]) || (sql[i] === '-' && /[0-9]/.test(sql[i + 1]))) {
      let num = '';
      if (sql[i] === '-') num += sql[i++];
      while (i < sql.length && /[0-9.]/.test(sql[i])) num += sql[i++];
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Two-character operators
    const two = sql.substring(i, i + 2);
    if (['>=', '<=', '<>', '!=', '=='].includes(two)) {
      tokens.push({ type: 'OP', value: two === '==' ? '=' : two === '!=' ? '<>' : two });
      i += 2;
      continue;
    }

    // Single-character punctuation / operators
    if ('=<>(),.;*'.includes(sql[i])) {
      tokens.push({ type: 'PUNCT', value: sql[i++] });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(sql[i])) {
      let word = '';
      while (i < sql.length && /[a-zA-Z_0-9]/.test(sql[i])) word += sql[i++];
      const upper = word.toUpperCase();
      tokens.push({ type: KEYWORDS.has(upper) ? 'KW' : 'IDENT', value: word, upper });
      continue;
    }

    // Skip unrecognised characters
    i++;
  }

  return tokens;
}

import { KEYWORDS } from '../models/types.js';

/**
 * Tokenizes a SQL string into an array of tokens.
 * @param {string} sql
 * @returns {import('../models/types.js').Token[]}
 */
export function tokenize(sql) {
  const tokens = [];
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

    // String literal (single or double quoted)
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

    // Number (including negative)
    if (/[0-9]/.test(sql[i]) || (sql[i] === '-' && /[0-9]/.test(sql[i + 1]))) {
      let num = '';
      if (sql[i] === '-') num += sql[i++];
      while (i < sql.length && /[0-9.]/.test(sql[i])) num += sql[i++];
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Multi-char operators
    const two = sql.substr(i, 2);
    if (['>=', '<=', '<>', '!=', '=='].includes(two)) {
      tokens.push({
        type: 'OP',
        value: two === '==' ? '=' : two === '!=' ? '<>' : two,
      });
      i += 2;
      continue;
    }

    // Single-char punctuation/operators
    if ('=<>(),.;*'.includes(sql[i])) {
      tokens.push({ type: 'PUNCT', value: sql[i++] });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(sql[i])) {
      let word = '';
      while (i < sql.length && /[a-zA-Z_0-9]/.test(sql[i])) word += sql[i++];
      const upper = word.toUpperCase();
      tokens.push({
        type: KEYWORDS.has(upper) ? 'KW' : 'IDENT',
        value: word,
        upper,
      });
      continue;
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

/**
 * Token stream parser.
 * Provides helpers to consume, peek, match, and expect tokens.
 */
export class Parser {
  /**
   * @param {import('../models/types.js').Token[]} tokens
   */
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  /** @returns {import('../models/types.js').Token | undefined} */
  peek() {
    return this.tokens[this.pos];
  }

  /** @returns {import('../models/types.js').Token} */
  next() {
    return this.tokens[this.pos++];
  }

  /**
   * Consume and return the next token, throwing if it doesn't match.
   * @param {string} val
   * @returns {import('../models/types.js').Token}
   */
  expect(val) {
    const t = this.next();
    if (!t) throw new Error(`Expected '${val}' but got end of input`);
    if (
      t.value.toUpperCase() !== val.toUpperCase() &&
      t.upper !== val.toUpperCase()
    ) {
      throw new Error(`Expected '${val}' but got '${t.value}'`);
    }
    return t;
  }

  /**
   * Consume the next token only if it matches the given value.
   * @param {string} val
   * @returns {boolean}
   */
  match(val) {
    const t = this.peek();
    if (
      t &&
      (t.value.toUpperCase() === val.toUpperCase() ||
        t.upper === val.toUpperCase())
    ) {
      this.pos++;
      return true;
    }
    return false;
  }

  /**
   * Consume and return the next identifier token.
   * @returns {string}
   */
  ident() {
    const t = this.peek();
    if (!t) throw new Error('Expected identifier');
    if (t.type !== 'IDENT' && t.type !== 'KW') {
      throw new Error(`Expected identifier, got '${t.value}'`);
    }
    this.pos++;
    return t.value;
  }

  /** @returns {boolean} */
  done() {
    return this.pos >= this.tokens.length;
  }
}

import type { Token } from '../models/types.js';

/**
 * A cursor over a flat token array.
 *
 * Provides typed helpers for consuming, peeking, matching, and
 * asserting expected tokens while parsing SQL statements.
 */
export class Parser {
  public pos = 0;

  constructor(private readonly tokens: Token[]) {}

  /** Look at the current token without consuming it. */
  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  /** Consume and return the current token. */
  next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error('Unexpected end of input');
    return t;
  }

  /**
   * Consume the current token, asserting it matches `val` (case-insensitive).
   * Throws a clear parse error if the token doesn't match.
   */
  expect(val: string): Token {
    const t = this.next();
    const actual = (t.upper ?? String(t.value)).toUpperCase();
    if (actual !== val.toUpperCase()) {
      throw new Error(`Expected '${val}' but got '${String(t.value)}'`);
    }
    return t;
  }

  /**
   * Consume the current token only if it matches `val` (case-insensitive).
   * Returns `true` if consumed, `false` otherwise.
   */
  match(val: string): boolean {
    const t = this.peek();
    if (!t) return false;
    const actual = (t.upper ?? String(t.value)).toUpperCase();
    if (actual === val.toUpperCase()) {
      this.pos++;
      return true;
    }
    return false;
  }

  /**
   * Consume the current token as an identifier.
   * Accepts both `IDENT` and `KW` token types (keywords can be used as names).
   */
  ident(): string {
    const t = this.peek();
    if (!t) throw new Error('Expected identifier but got end of input');
    if (t.type !== 'IDENT' && t.type !== 'KW') {
      throw new Error(`Expected identifier, got '${String(t.value)}'`);
    }
    this.pos++;
    return String(t.value);
  }

  /** Returns `true` when all tokens have been consumed. */
  done(): boolean {
    return this.pos >= this.tokens.length;
  }
}

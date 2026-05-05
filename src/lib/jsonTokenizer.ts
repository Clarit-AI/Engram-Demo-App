/**
 * jsonTokenizer.ts
 *
 * A tiny, zero-dep JSON tokenizer used to render pretty-printed JSON with
 * semantic color classes. Produces a flat array of tokens; the renderer
 * walks them char-by-char for streaming (so each emitted character knows
 * which color class it belongs to).
 *
 * Intentionally not a full JSON5 parser — input is `JSON.stringify(..., 2)`
 * output, so we can rely on the well-formed shape.
 */

export type TokenType =
  | 'key'          // "role"
  | 'string'       // "user"
  | 'number'       // 42
  | 'boolean'      // true / false
  | 'null'         // null
  | 'punct'        // { } [ ] : ,
  | 'whitespace';  // spaces + newlines

export interface Token {
  type: TokenType;
  text: string;
}

/**
 * Tokenize a pretty-printed JSON string (output of JSON.stringify with
 * indent). Designed for speed; produces a single pass of tokens preserving
 * whitespace and punctuation verbatim so the concatenated text recomposes
 * the original input character-for-character.
 */
export function tokenize(json: string): Token[] {
  const out: Token[] = [];
  const len = json.length;
  let i = 0;

  while (i < len) {
    const ch = json[i];

    // Whitespace + newlines (preserve as-is)
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r') {
      let j = i;
      while (j < len) {
        const c = json[j];
        if (c === ' ' || c === '\n' || c === '\t' || c === '\r') j++;
        else break;
      }
      out.push({ type: 'whitespace', text: json.slice(i, j) });
      i = j;
      continue;
    }

    // Punctuation
    if (ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === ':' || ch === ',') {
      out.push({ type: 'punct', text: ch });
      i++;
      continue;
    }

    // String — either a key or a value. Decide by peeking ahead: if the
    // NEXT non-whitespace char after the closing quote is ':', it's a key.
    if (ch === '"') {
      let j = i + 1;
      while (j < len) {
        const c = json[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '"') { j++; break; }
        j++;
      }
      const rawStr = json.slice(i, j);

      // Peek ahead past whitespace for a ':'
      let k = j;
      while (k < len && (json[k] === ' ' || json[k] === '\t')) k++;
      const isKey = json[k] === ':';

      out.push({ type: isKey ? 'key' : 'string', text: rawStr });
      i = j;
      continue;
    }

    // Numbers
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let j = i + 1;
      while (j < len) {
        const c = json[j];
        if ((c >= '0' && c <= '9') || c === '.' || c === 'e' || c === 'E' || c === '+' || c === '-') j++;
        else break;
      }
      out.push({ type: 'number', text: json.slice(i, j) });
      i = j;
      continue;
    }

    // Booleans and null
    if (json.startsWith('true', i))  { out.push({ type: 'boolean', text: 'true' });  i += 4; continue; }
    if (json.startsWith('false', i)) { out.push({ type: 'boolean', text: 'false' }); i += 5; continue; }
    if (json.startsWith('null', i))  { out.push({ type: 'null',    text: 'null'  }); i += 4; continue; }

    // Unknown — emit one char as punct and continue (defensive)
    out.push({ type: 'punct', text: ch });
    i++;
  }

  return out;
}

/**
 * Flatten tokens to a single string — inverse of tokenize().
 */
export function untokenize(tokens: Token[]): string {
  return tokens.map((t) => t.text).join('');
}

/**
 * CSS color var mapped to each token type.
 * Values reference CSS custom properties defined in src/index.css.
 */
export const TOKEN_COLOR: Record<TokenType, string> = {
  key:        'var(--primary-container)',        // #00A3FF
  string:     'var(--secondary-container)',      // #68FADD
  number:     'var(--tertiary)',                 // #0046FA
  boolean:    'var(--tertiary)',
  null:       'var(--on-surface-dark-muted)',
  punct:      'var(--on-surface-dark-faint)',    // structural, dim
  whitespace: 'var(--on-surface-dark)',
};

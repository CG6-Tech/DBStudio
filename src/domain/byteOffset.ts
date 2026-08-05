import type { SourceRange } from "./types";

/**
 * Byte-offset → character-offset conversion for the parser seam.
 *
 * A real-AST parser (pg_query on desktop) reports positions as UTF-8 BYTE
 * offsets into the source. Every `*Range` in a {@link import("./types").SchemaDocument}
 * is a JS string index (UTF-16 code unit offset) into `document.source`, which
 * `generateSql` splices with `String.slice`. Feeding a byte offset where a
 * character offset is expected silently corrupts every patch the moment the
 * source contains a non-ASCII byte (a comment, an identifier, a default string).
 * This module is the one place that conversion happens.
 *
 * A mapper is built once per source (O(n) over the string) and converts any
 * number of offsets in O(1), which suits an AST that reports many positions
 * against a single source.
 */

export interface ByteOffsetMapper {
  /**
   * Convert a UTF-8 byte offset into the JS string index of the character that
   * begins at (or contains) that byte. Offsets past the end clamp to the string
   * length; negative offsets clamp to 0. A byte offset landing inside a
   * multi-byte code point maps to that code point's starting index.
   */
  toCharIndex(byteOffset: number): number;
  /** Convert a byte-offset range to a character-offset {@link SourceRange}. */
  toRange(range: SourceRange): SourceRange;
}

function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * Build a {@link ByteOffsetMapper} for `source`. When the source is pure ASCII
 * (byte length === string length) the identity mapping is used, avoiding the
 * per-byte table entirely — the common case for SQL DDL.
 */
export function createByteOffsetMapper(source: string): ByteOffsetMapper {
  // charByByte[b] = JS string index of the character starting at byte b.
  // Length is (byteLength + 1) so the end-of-source boundary is representable.
  const charByByte: number[] = [];
  let charIndex = 0;
  let ascii = true;
  for (const char of source) {
    const codePoint = char.codePointAt(0) ?? 0;
    const byteLength = utf8Length(codePoint);
    if (byteLength > 1) ascii = false;
    for (let i = 0; i < byteLength; i += 1) charByByte.push(charIndex);
    charIndex += char.length; // 1 for BMP, 2 for a surrogate pair
  }
  charByByte.push(charIndex); // end boundary
  const totalChars = charIndex;
  const totalBytes = charByByte.length - 1;

  if (ascii) {
    const identity = (byteOffset: number): number => {
      if (byteOffset <= 0) return 0;
      if (byteOffset >= totalChars) return totalChars;
      return byteOffset;
    };
    return {
      toCharIndex: identity,
      toRange: (range) => ({ start: identity(range.start), end: identity(range.end) }),
    };
  }

  const toCharIndex = (byteOffset: number): number => {
    if (byteOffset <= 0) return 0;
    if (byteOffset >= totalBytes) return totalChars;
    return charByByte[byteOffset];
  };
  return {
    toCharIndex,
    toRange: (range) => ({ start: toCharIndex(range.start), end: toCharIndex(range.end) }),
  };
}

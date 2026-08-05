import { describe, expect, it } from "vitest";
import { createByteOffsetMapper } from "./byteOffset";

/** UTF-8 byte length of a string — what pg_query counts in. */
function byteLen(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** The byte offset at which `needle` starts inside `haystack`. */
function byteStart(haystack: string, needle: string): number {
  return byteLen(haystack.slice(0, haystack.indexOf(needle)));
}

describe("createByteOffsetMapper", () => {
  it("is an identity mapping for pure-ASCII sources", () => {
    const source = "CREATE TABLE users (id INT);";
    const mapper = createByteOffsetMapper(source);
    for (let i = 0; i <= source.length; i += 1) {
      expect(mapper.toCharIndex(i)).toBe(i);
    }
  });

  it("maps a byte range back to the intended substring for a 2-byte char (é)", () => {
    const source = "-- café\nCREATE TABLE t (id INT);";
    const mapper = createByteOffsetMapper(source);
    const start = byteStart(source, "CREATE");
    const end = start + byteLen("CREATE TABLE t");
    const range = mapper.toRange({ start, end });
    expect(source.slice(range.start, range.end)).toBe("CREATE TABLE t");
  });

  it("handles a 3-byte character (→) before the target token", () => {
    const source = "-- a→b\nCREATE TABLE t (id INT);";
    const mapper = createByteOffsetMapper(source);
    const start = byteStart(source, "t (id");
    const range = mapper.toRange({ start, end: start + byteLen("t") });
    expect(source.slice(range.start, range.end)).toBe("t");
  });

  it("handles a 4-byte astral character (emoji / surrogate pair)", () => {
    const source = "-- 😀\nCREATE TABLE t (id INT);";
    const mapper = createByteOffsetMapper(source);
    const start = byteStart(source, "TABLE");
    const range = mapper.toRange({ start, end: start + byteLen("TABLE") });
    expect(source.slice(range.start, range.end)).toBe("TABLE");
    // The emoji occupies 4 UTF-8 bytes but 2 UTF-16 code units — the char index
    // must be smaller than the byte index once we're past it.
    expect(range.start).toBeLessThan(start);
  });

  it("clamps out-of-range and negative offsets", () => {
    const source = "café"; // 4 chars, 5 bytes
    const mapper = createByteOffsetMapper(source);
    expect(mapper.toCharIndex(-5)).toBe(0);
    expect(mapper.toCharIndex(999)).toBe(source.length);
    expect(mapper.toCharIndex(byteLen(source))).toBe(source.length);
  });

  it("maps a byte offset inside a multi-byte code point to that code point's start", () => {
    const source = "aéb"; // a=byte0, é=bytes1-2, b=byte3
    const mapper = createByteOffsetMapper(source);
    expect(mapper.toCharIndex(0)).toBe(0); // a
    expect(mapper.toCharIndex(1)).toBe(1); // é start
    expect(mapper.toCharIndex(2)).toBe(1); // inside é → é start
    expect(mapper.toCharIndex(3)).toBe(2); // b
  });
});

import { describe, expect, it } from "vitest";
import { buildSafeDiagnostics } from "./diagnostics";

describe("safe feedback diagnostics", () => {
  it("contains only bounded release and categorical runtime data", () => {
    const result = buildSafeDiagnostics({ os: "macOS", architecture: "arm64", desktop: true, recentErrorCodes: Array.from({ length: 25 }, (_, index) => `save.error-${index}`) });
    expect(result.version).toBe("0.1.0-beta.1");
    expect(result.recentErrorCodes).toHaveLength(20);
    expect(JSON.stringify(result)).not.toContain("CREATE TABLE");
  });

  it.each([
    "/Users/cg/private/schema.sql",
    "C:\\Users\\name\\schema.sql",
    "postgres://user:password@host/database",
    "token=secret-value",
    "CREATE TABLE private_data(id int)",
  ])("replaces unsafe error data instead of attempting partial redaction: %s", (unsafe) => {
    const result = buildSafeDiagnostics({ os: unsafe, architecture: "x86_64", desktop: true, recentErrorCodes: [unsafe] });
    expect(result.os).toBe("unknown");
    expect(result.recentErrorCodes).toEqual(["unknown"]);
    expect(JSON.stringify(result)).not.toContain(unsafe);
  });
});

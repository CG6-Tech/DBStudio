import { describe, expect, it } from "vitest";
import { resolveElkWorkerConstructor } from "./elkWorkerFactory";

class FakeWorker {
  postMessage(): void {}
  terminate(): void {}
}

describe("resolveElkWorkerConstructor", () => {
  it("uses a named Worker export", () => {
    expect(resolveElkWorkerConstructor({ Worker: FakeWorker })).toBe(FakeWorker);
  });

  it("supports Vite's nested CommonJS default interop", () => {
    expect(resolveElkWorkerConstructor({ default: { Worker: FakeWorker } })).toBe(FakeWorker);
  });

  it("supports a constructor default export", () => {
    expect(resolveElkWorkerConstructor({ default: FakeWorker })).toBe(FakeWorker);
  });

  it("rejects an invalid worker module", () => {
    expect(() => resolveElkWorkerConstructor({})).toThrow("ELK worker constructor is unavailable");
  });
});

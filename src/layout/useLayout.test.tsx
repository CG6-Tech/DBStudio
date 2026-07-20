import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSchema } from "../domain/parser";
import { useLayout } from "./useLayout";

const document = parseSchema(`
  CREATE TABLE users (id INT PRIMARY KEY);
  CREATE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id));
`);

afterEach(() => vi.unstubAllGlobals());

describe("useLayout worker fallback", () => {
  it("publishes clustered-grid nodes when Worker construction fails", async () => {
    class ThrowingWorker {
      constructor() { throw new Error("workers unavailable"); }
    }
    vi.stubGlobal("Worker", ThrowingWorker);

    const { result } = renderHook(() => useLayout(document));

    await waitFor(() => expect(result.current?.nodes).toHaveLength(2));
    expect(result.current?.kind).toBe("initial");
  });

  it("keeps the fallback layout and disables a worker after a runtime error", async () => {
    let instance: MockWorker | undefined;
    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { instance = this; }
    }
    vi.stubGlobal("Worker", MockWorker);

    const { result } = renderHook(() => useLayout(document));
    await waitFor(() => expect(result.current?.nodes).toHaveLength(2));

    act(() => instance?.onerror?.(new ErrorEvent("error")));

    expect(result.current?.nodes).toHaveLength(2);
    expect(instance?.terminate).toHaveBeenCalledOnce();
  });
});

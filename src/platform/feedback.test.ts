import { describe, expect, it } from "vitest";
import { nextRateState, validateFeedback } from "./feedback";

describe("feedback validation", () => {
  it("requires a useful message", () => expect(validateFeedback({ category: "bug", message: "short" })).toMatch(/detail/));
  it("accepts anonymous feedback", () => expect(validateFeedback({ category: "idea", message: "Please add a compact overview." })).toBeNull());
  it("rejects invalid contact email", () => expect(validateFeedback({ category: "other", message: "There is enough detail here.", contactEmail: "bad" })).toMatch(/email/));
  it("starts and increments an hourly rate window", () => {
    const first = nextRateState(null, 1000, "a");
    expect(nextRateState(first, 2000, "b")).toEqual({ count: 2, windowStartedAtMs: 1000, feedbackIds: ["a", "b"] });
  });
  it("blocks a sixth submission in one hour", () => expect(() => nextRateState({ count: 5, windowStartedAtMs: 1000, feedbackIds: ["a","b","c","d","e"] }, 2000, "f")).toThrow(/limit/));
});

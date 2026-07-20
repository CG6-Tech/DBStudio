import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BetaBadge } from "./BetaBadge";

describe("BetaBadge", () => {
  it("shows the beta channel and exposes the full version accessibly", () => {
    render(<BetaBadge />);
    expect(screen.getByText("Beta")).toBeVisible();
    expect(screen.getByLabelText("DBStudio beta version 0.1.0-beta.1")).toBeVisible();
  });
});

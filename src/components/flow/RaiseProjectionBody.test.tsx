import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaiseProjectionBody } from "./RaiseProjectionBody";

describe("RaiseProjectionBody", () => {
  it("renders only the supplied exception fields", () => {
    const { container } = render(<RaiseProjectionBody details={{ errcode: "23514", message: "Invalid value.", hint: "Use a positive value." }}/>);
    expect(within(container).getByText("23514")).toHaveClass("raise-code-chip");
    expect(within(container).getByText("Invalid value.")).toBeInTheDocument();
    expect(within(container).getByText("Use a positive value.")).toBeInTheDocument();
    expect(within(container).queryByText("DETAIL")).toBeNull();
  });
});

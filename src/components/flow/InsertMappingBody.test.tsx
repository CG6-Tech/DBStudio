import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectInsertStatement } from "../../domain/insertProjection";
import { InsertMappingBody } from "./InsertMappingBody";

describe("structured INSERT mapping body", () => {
  it("shows four mappings and expands to reveal the rest", () => {
    const insert = projectInsertStatement("INSERT INTO audit_log(a,b,c,d,e,f) VALUES (one, 'two', now(), x + y, five, six);")!;
    render(<InsertMappingBody insert={insert}/>);
    expect(screen.getByText("+ 2 more")).toBeInTheDocument();
    expect(screen.queryByText("five")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Expand"));
    expect(screen.getByText("five")).toBeInTheDocument();
    expect(screen.getByText("Collapse")).toBeInTheDocument();
  });

  it("keeps the full expression in a tooltip", () => {
    const insert = projectInsertStatement("INSERT INTO audit_log(action) VALUES (format('%s public.orders', TG_OP));")!;
    const { container } = render(<InsertMappingBody insert={insert}/>);
    expect(container.querySelector('[title="format(\'%s public.orders\', TG_OP)"]')).toBeInTheDocument();
    expect(container.querySelector(".insert-value-kind.expression")).toHaveTextContent("Expression");
  });
});

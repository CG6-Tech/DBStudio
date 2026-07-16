# Inline condition output rows design

## Objective

Make condition cards shorter and easier to scan by placing each condition directly in its corresponding output row. Remove the separate rule body and avoid repeating generic `Condition met` labels without context.

## Row structure

Each condition row contains, from left to right:

1. property or expression;
2. readable validation operator;
3. optional comparison value;
4. `Meet` outcome label;
5. circular output port.

Examples:

```text
NEW.quantity    is missing                         Meet ○
NEW.quantity    less than    1                     Meet ○
NEW.product     is missing                         Meet ○
Otherwise                                      Continue ○
```

Unary operators such as `IS NULL` leave the value column empty. Long content truncates visually and exposes its complete value with a tooltip. Selecting the card continues to expose the untouched PL/pgSQL in the inspector.

## Removed card sections

Condition cards no longer render:

- the `RULE`, `ALL RULES`, or `ANY RULE` body header;
- a separate list of condition clauses;
- the inline `View expression` disclosure.

The condition card header, input row, inline output rows, and final continuation row remain.

## Independent validations

Grouped sequential validations render one row for each validation. Every row owns a `Meet` port leading to its associated rejection or action branch. The final unmatched output renders as `Otherwise · Continue` with a green port.

## AND groups

Every top-level `AND` clause renders on its own row. A slim `ALL` rail visually groups the rows. Because the execution branch is taken only when all clauses are true, the group has one shared `Meet` port on its final row.

The preceding rows do not expose output ports. They are parts of one logical test, not independently executable branches.

```text
┌ ALL
│ NEW.status    equals          PAID
│ NEW.total     greater than    0
└                                         Meet ○
```

## OR groups

Every top-level `OR` clause renders on its own row. A slim `ANY` rail visually groups the rows. Each row owns a `Meet` port so the user can see that any clause can satisfy the decision.

All visual OR ports map to the same underlying execution branch. The graph may contain multiple edges with distinct visual source-port IDs and the same target. Reachability, highlighting, and dragging treat them as equivalent branch alternatives.

```text
┌ ANY
│ NEW.quantity    is missing                 Meet ○
│ NEW.quantity    less than      1           Meet ○
└
```

## Switch conditions

Shared-subject switches use the same inline grammar:

```text
TG_OP    equals    UPDATE    Meet ○
TG_OP    equals    INSERT    Meet ○
Otherwise                 Continue ○
```

Each switch case remains a distinct execution branch and owns its own output port.

## Component contract

The shared condition component receives normalized display rows. A row identifies its left operand, readable operator, optional right value, grouping mode, output label, visual port ID, and execution branch port ID.

The component does not parse SQL. The condition projector owns clause extraction and the routine-flow compiler owns graph semantics. This separation allows the same component to render validations, guards, decisions, and switches.

## Connections and geometry

Every visible output port registers its DOM element with the existing geometry system. Connections begin at the measured center of that exact circle and terminate at the measured input circle of the next component.

OR aliases produce one routed connection per visible clause port. AND clauses produce only one connection from the shared final-row port. Hidden or nonexistent ports never act as routing anchors.

The estimated node height equals the header, inputs, inline condition rows, and continuation rows. There is no separate source-body height for structured conditions.

## Accessibility

- Every actionable row exposes an accessible label containing the full condition and outcome.
- `ALL` and `ANY` group meaning is textual and does not depend on color.
- Ports remain keyboard focusable through the existing output-button behavior.
- Tooltips preserve truncated property, operator, and value text.

## Error handling

An expression that cannot be split confidently renders as one raw-expression row with `evaluates as true · Meet`. Parsing uncertainty never invents additional ports or changes execution semantics.

If OR alias-edge generation fails, the compiler retains one canonical branch output rather than dropping the branch. If an AND group has no clauses, the generic condition fallback renders.

## Testing

Tests cover:

- independent validation rows with distinct output targets;
- a two-clause AND group with one shared final-row port;
- a two-clause OR group with two visual ports targeting the same branch;
- switch rows with distinct targets;
- unary operators with an empty value column;
- raw-expression fallback;
- `Otherwise · Continue` rendering;
- exact measured circular-port endpoints;
- reachability through OR alias edges;
- node-height estimates matching the compact structure;
- preservation of original SQL in the inspector.

The complete test suite, web production build, and native macOS build must pass.

## Out of scope

- Editing conditions or regenerating PL/pgSQL.
- Displaying runtime evaluation results.
- Nested boolean groups beyond the existing safe top-level projection.
- Changing the visual design of non-condition flow components.

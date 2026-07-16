# Structured condition flow block design

## Objective

Render PL/pgSQL conditions as readable decisions rather than generic SQL snippets. Preserve the compact Postman-inspired dark component system, make every outcome explicit, and keep the original expression available for exact inspection.

## Approved visual language

A condition is projected into human-readable rows with three roles: left operand, operator, and right operand. Operators use presentation labels such as `is missing`, `greater than`, and `outside range`; the original SQL is never rewritten.

Compound `AND` and `OR` expressions display as stacked clause rows joined by a slim logic rail. Branches use semantic outcome labels instead of `TRUE`/`FALSE` or `THEN`/`ELSE`. Amber identifies decisions, red identifies rejection or error outcomes, green identifies continue or return outcomes, and muted blue identifies values and variables.

Long operands truncate in the card. Their complete text is available through a tooltip and the existing source inspector. A collapsed `View expression` disclosure exposes the original condition inside the component when needed.

Each semantic outcome owns a circular port on its row. A connection starts at that port's measured center and terminates at the target component's measured circular input. Dragging or resizing a component refreshes the affected paths.

## Reusable condition components

### Guard condition

A guard represents a condition whose matched branch exits the current path immediately. The card contains the readable rule followed by two outcomes: a semantic exit outcome and `Continue`.

For:

```sql
IF pg_trigger_depth() > 1 THEN
  RETURN coalesce(NEW, OLD);
END IF;
```

the card reads:

```text
RECURSION GUARD
pg_trigger_depth()   greater than   1

Nested trigger  ○
Continue        ○
```

The first port connects to a return component. The continue port connects to the next decision or operation.

### Decision condition

A decision represents a normal two-way condition. Its outcomes use domain language inferred from the condition and child operations when confidence is high. Otherwise the safe labels are `Condition met` and `Otherwise`.

### Switch condition

An `IF / ELSIF / ELSE` chain that repeatedly compares the same subject becomes one switch component. The subject appears once in the header area, and every branch becomes an outcome row with its own port.

For comparisons against `TG_OP`, the component reads:

```text
ORDER OPERATION                         TG_OP
UPDATE   Compare old and new fields       ○
INSERT   Collect fields from new data     ○
DELETE   Collect fields from old data     ○
```

`ELSE` may be labeled `DELETE` only when trigger metadata proves that the remaining operation is DELETE. Without that evidence, it remains `Otherwise`.

## Parsing and projection

Condition projection is a presentation layer over the existing routine-flow parser. It produces normalized display data while retaining each node's original source and source range.

The expression projector recognizes:

- top-level `AND` and `OR`, respecting parentheses and quoted text;
- unary predicates such as `IS NULL` and `IS NOT NULL`;
- binary comparisons such as `=`, `<>`, `>`, `>=`, `<`, and `<=`;
- range predicates such as `BETWEEN` and `NOT BETWEEN`;
- operands including identifiers, row references, literals, and function calls.

Parenthesized or otherwise unsupported expressions fall back to one syntax-highlighted expression row. Projection failure must never remove a branch or change flow semantics.

## Switch recognition

An `IF / ELSIF / ELSE` chain becomes a switch only when every explicit branch is a simple equality comparison against the same normalized subject. Branch order remains source order.

For the audit routine, `TG_OP = 'UPDATE'` and `TG_OP = 'INSERT'` satisfy this rule. The parser creates one switch node with UPDATE, INSERT, and fallback outputs rather than multiple disconnected condition nodes.

The branch bodies remain separate action nodes. The three actions may converge through a compact merge point before the next statement common to all paths, such as `INSERT INTO public.audit_log`.

## Semantic labels

Labels are derived conservatively:

- known trigger-operation comparisons use the literal operation name;
- an immediate `RAISE` child may use its concise error meaning;
- an immediate `RETURN` child may use a concise exit meaning;
- a guard's unmatched path is `Continue`;
- uncertain outcomes use `Condition met` and `Otherwise`.

Generated labels are display metadata only. The source inspector always shows the exact PL/pgSQL.

## Layout and routing

Guard nodes stay compact and appear before the main decision lane. Switch branch action nodes form a vertical outcome column in source order. A small merge component is created only when multiple branches share a later continuation; it is not shown for terminal branches.

Layout uses measured component dimensions, compact spacing, and the existing bounded natural curve router. Connection overlap is acceptable. Paths should flow monotonically away from their source where possible and must not use tall global detours merely to avoid crossings.

## Interaction and accessibility

- Cards retain existing selection, dragging, pinning, focus, and source-inspection behavior.
- Port and row hover highlight the complete downstream branch.
- Color is supplemented by text and icons; it is never the sole meaning carrier.
- Outcome ports and disclosures are keyboard focusable.
- Expanded source content triggers geometry refresh and local rerouting.

## Error handling

If a compound expression cannot be split confidently, render it as one condition row. If switch recognition fails, preserve the existing sequence of decision nodes. If an ELSE operation cannot be inferred from trigger metadata, label it `Otherwise`. No inference may alter execution order or invent a missing branch.

## Testing

Parser and projection tests cover:

- the recursion guard using `pg_trigger_depth()`;
- the exact `TG_OP` UPDATE/INSERT/ELSE chain;
- ELSE inferred as DELETE with suitable trigger metadata;
- ELSE retained as Otherwise without suitable metadata;
- nested parentheses and quoted `AND`/`OR` text;
- null, comparison, and range operators;
- unsupported-expression fallback;
- preservation of source order and original SQL.

Component and integration tests cover readable clause rows, logic rails, semantic branch labels, one port per outcome, measured port endpoints, disclosure expansion, merge behavior, dragging, and geometry refresh. The full test suite, web production build, and native macOS build must pass.

## Out of scope

- Editing conditions or regenerating PL/pgSQL.
- Executing routines or displaying live branch results.
- General SQL query-plan visualization.
- Inferring domain-specific wording when the source does not provide enough evidence.

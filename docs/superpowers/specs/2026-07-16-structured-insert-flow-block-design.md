# Structured INSERT flow block design

## Objective

Represent PL/pgSQL `INSERT ... VALUES` statements as compact, readable column-to-value mapping blocks instead of generic SQL text. Preserve the original SQL for inspection and fall back safely when parsing is uncertain.

## Approved representation

The operation block title shows `INSERT` and the qualified destination table. A count identifies the total number of target fields. The body shows the first four ordered column-to-value mappings and a `+ N more` expansion control. Expanding reveals every mapping inside the same block and does not create additional graph nodes.

Each row contains:

- target column name;
- semantic value-kind chip;
- compact value preview.

Value kinds are:

- **Constant:** quoted strings, numbers, booleans, and `NULL`;
- **Variable:** identifiers and row references such as `TG_OP`, `row_id`, `session_actor`, `old_data`, and `NEW.id`;
- **Function:** a direct function call such as `txid_current()` or `clock_timestamp()`;
- **Expression:** composed values such as `format(...)`, casts, arithmetic, concatenation, or nested expressions.

Long previews truncate visually. The full value is available through the native title tooltip and inspector. The inspector continues to show the complete original SQL and source range.

## Example

For the approved audit statement, the compact block shows:

```text
INSERT public.audit_log                         10 fields
action          Expression  format('%s public.orders', TG_OP)
entity_name     Constant    'public.orders'
entity_id       Variable    row_id
operation       Variable    TG_OP
+ 6 more                                      Expand
```

The expanded block additionally shows actor, before_data, after_data, changed_fields, transaction_id, and created_at.

## Parser architecture

A focused INSERT projector runs only for parsed SQL flow nodes whose source begins with `INSERT INTO`. It does not replace the existing PL/pgSQL statement parser.

The projector extracts:

- qualified target table;
- optional ordered target-column list;
- ordered `VALUES` expression list;
- paired mappings by ordinal position;
- diagnostics and completeness.

List splitting is lexical rather than comma-based. The scanner tracks nested parentheses, single-quoted strings with escaped quotes, double-quoted identifiers, dollar-quoted text, and PostgreSQL casts so commas inside functions and strings do not split mappings.

The structured projection is stored in the flow node's details alongside the untouched original source. The UI library receives normalized display mappings and does not import the SQL parser.

## Classification

Classification is conservative and presentation-only:

- a complete quoted literal, numeric literal, boolean, or `NULL` is Constant;
- a simple qualified or unqualified identifier is Variable;
- a complete single function invocation is Function;
- everything else successfully parsed is Expression.

`format(...)` is classified as Expression because it produces a composed value from a format string and variables. Classification never affects SQL semantics.

## Error handling

If columns and values differ in count, the projector retains every recoverable ordinal pair, marks the projection incomplete, and adds a count-mismatch warning. Unpaired entries remain available in the original SQL inspector.

If the target, list boundaries, quoting, or nesting cannot be parsed confidently, the projector returns no structured representation. The existing generic SQL operation block renders instead. No source statement is dropped.

INSERT statements without an explicit column list remain generic in the first version because reliable column names require schema-aware resolution.

## Interaction

- Compact state shows four mappings.
- `Expand` reveals all mappings and changes to `Collapse`.
- Expansion triggers geometry refresh and local connection rerouting because block height changes.
- Selection, dragging, pinning, branch focus, circular ports, and source inspection use existing shared component behavior.
- Expanded state is local presentation state and is not persisted in metadata.

## Reuse

The normalized operation-mapping UI is independent of INSERT parsing. A later UPDATE projector can supply `SET column = value` mappings, and a DELETE projector can supply predicate details, without creating new block foundations.

## Testing

Parser tests cover:

- the exact ten-column `public.audit_log` INSERT;
- schema-qualified and quoted identifiers;
- nested function calls;
- commas inside quoted strings;
- escaped quotes;
- PostgreSQL casts;
- count mismatches;
- incomplete parentheses and quotes;
- INSERT without a target-column list;
- deterministic classifications.

Component tests cover four-row compact rendering, `+ N more`, expand/collapse, semantic chips, long-value tooltip text, generic fallback, and geometry refresh after height changes.

The complete test suite, web production build, and native macOS build must pass.

## Out of scope

- INSERT ... SELECT projection.
- Multiple VALUES tuples.
- Schema-based inference when the column list is omitted.
- Editing mappings or regenerating SQL.
- Structured UPDATE or DELETE rendering in this implementation.

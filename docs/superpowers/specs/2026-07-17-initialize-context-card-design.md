# Initialize Context Card Design

## Goal

Replace the routine flow's raw declaration summary with a compact, structured card body that clearly communicates each variable's name, data type, and optional initial value.

## Scope

This change covers PL/pgSQL declarations represented by the `Initialize context` routine-flow node. It does not change generic flow-card framing, canvas interactions, declaration execution semantics, or other routine-flow node types.

## Projection Model

Add a declaration projection with one entry per declaration:

```ts
interface ContextDeclaration {
  name: string;
  dataType: string;
  initialValue?: string;
  source: string;
}

interface ContextProjection {
  declarations: ContextDeclaration[];
  unparsed: string[];
}
```

The context node details will carry this projection. Existing source ranges and raw node source remain available for the inspector and diagnostics.

## Parsing

Parse declarations from the `DECLARE` section while respecting parentheses, quoted strings, and multiline expressions. Support both `DEFAULT value` and `:= value` initializers. Preserve type modifiers such as `numeric(12,2)` and multiword types such as `timestamp with time zone`.

When an individual declaration cannot be parsed confidently, retain it in `unparsed`. A malformed declaration must not prevent valid neighboring declarations from being projected.

## Card UI

Create a focused `ContextProjectionBody` component and render it from `FlowBlock` when a context projection is present.

Each declaration is one compact row:

- Variable name is left-aligned and truncates safely when necessary.
- The full data type is a right-aligned type chip.
- An initial value, when present, appears on a second line inside the same row with an `Initial` label.
- Rows without initial values do not reserve empty space or display placeholder text.

The card retains the existing green context accent and `SlidersHorizontal` icon. Its input and output ports remain unchanged.

Unparsed declarations appear after the structured rows using the reusable SQL text presentation at a compact size. Nothing from the declaration block is silently discarded.

## Layout

The card uses the existing routine-flow width. Row height is content-driven but stable: a single-line row for name and type, and a two-line row only when an initial value exists. Long names, types, and values truncate within the card instead of changing its width or overlapping ports.

Flow geometry derives the context node height from the projected row count and which rows contain initial values. This keeps edge endpoints aligned after automatic arrangement.

## Inspector

The inspector continues to show the original SQL source. The structured card is a canvas summary and does not replace the source view.

## Verification

Add focused tests for:

- Plain typed declarations without initial values.
- `DEFAULT` and `:=` initializers.
- Type modifiers and multiword types.
- Quoted strings and function-call initializers.
- Multiline initial values.
- Mixed valid and unparsed declarations.
- Context node details containing the structured projection.

Run the TypeScript checks and production build. Visual browser testing remains with the user, as requested.

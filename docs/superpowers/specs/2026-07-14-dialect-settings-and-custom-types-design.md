# Dialect Settings and Custom Types Design

## Goal

Centralize PostgreSQL and MySQL behavior in typed dialect settings, replace free-text table field types with a strict configuration-backed picker, and add SQL-backed PostgreSQL enum, domain, and composite type editing.

## Dialect Registry

Create a dedicated `src/dialects` module:

- `types.ts` defines shared settings interfaces and type-parameter models.
- `postgresql.ts` contains PostgreSQL identifier rules, constraint keywords, parser rules, built-in data types, type parameters, custom-type capabilities, and SQL rendering settings.
- `mysql.ts` contains the equivalent MySQL settings.
- `index.ts` returns the immutable settings object for a `SqlDialect`.

Each dialect settings object contains:

- identifier quoting and normalization rules;
- reserved constraint and table-definition keywords used by the parser;
- recognized built-in type definitions grouped by category;
- aliases and canonical names;
- supported parameter definitions such as length, precision, scale, enum values, set values, array dimensions, time-zone mode, and unsigned state;
- supported reusable custom-type kinds;
- dialect-specific SQL rendering flags.

Parser and renderer functions remain executable TypeScript code, but obtain their vocabulary and capabilities from the registry. UI components never maintain their own type lists.

## Structured Field Types

Add a structured field type model containing:

- canonical built-in type ID or custom-type ID;
- preserved display name;
- ordered numeric or string parameters;
- PostgreSQL array dimensions;
- dialect-specific modifiers such as MySQL unsigned;
- unresolved source text when an opened file contains an unknown type.

The existing `dataType` string remains the canonical formatted label used by the canvas and SQL compatibility paths. Parsing creates the structured model and the dialect formatter derives the label after edits.

Unknown types found while opening SQL are preserved as unresolved rather than discarded. They appear in the picker as unavailable current values and cannot be selected for another field. To resolve one, the user must first add a matching reusable custom type when the dialect supports it.

## Field Type Picker

Replace the free-text table field type input with a searchable strict picker:

- built-in and schema custom types appear in separate groups;
- aliases search successfully but selection stores the canonical type;
- arbitrary text entry is disabled;
- selecting a type initializes only the parameters supported by that dialect/type;
- parameter controls render below the field row when needed;
- PostgreSQL composite fields reuse the same picker;
- keyboard navigation, visible focus, accessible names, and escape-to-close are supported.

Examples:

- `VARCHAR` shows a length input;
- `NUMERIC` shows precision and scale inputs;
- PostgreSQL array-capable types show an array-dimensions control;
- MySQL integer types can show unsigned;
- MySQL `ENUM` and `SET` show ordered value editors.

Invalid or incomplete parameters remain visible in the editor, produce diagnostics, and are omitted from newly generated structural SQL until repaired.

## Custom Type Model

Add a discriminated `CustomType` union to `SchemaDocument`, with stable IDs, names, schema qualification, statement source ranges, and new/edited state.

### PostgreSQL Enum

Stores an ordered list of non-empty, unique string values. SQL form:

```sql
CREATE TYPE name AS ENUM ('value_1', 'value_2');
```

### PostgreSQL Domain

Stores a structured base type, optional default expression, nullability, and optional check expression. SQL form:

```sql
CREATE DOMAIN name AS base_type [DEFAULT expression] [NOT NULL] [CHECK (expression)];
```

### PostgreSQL Composite

Stores ordered fields with stable IDs, names, and structured field types. SQL form:

```sql
CREATE TYPE name AS (field_name field_type, ...);
```

MySQL reports no reusable schema-level custom types. Its Custom Types panel has no add action and explains that `ENUM` and `SET` are configured on table fields.

## Parsing

PostgreSQL parsing recognizes:

- `CREATE TYPE ... AS ENUM`;
- `CREATE DOMAIN ... AS ...` with supported default, nullability, and check clauses;
- `CREATE TYPE ... AS (...)` composite definitions;
- schema-qualified type names;
- custom-type and built-in-type references in table fields and composite fields;
- PostgreSQL array suffixes.

MySQL parsing recognizes built-in parameters and structured inline `ENUM`/`SET` values, plus supported modifiers from MySQL settings.

Parsing order first discovers reusable custom-type declarations, then resolves field references. Unsupported clauses and expressions are preserved in source when their owning statement is not structurally rewritten and reported as diagnostics.

## SQL Generation and Editing

- New custom types are inserted before new tables that reference them.
- Edited custom-type statements replace their source ranges.
- Deleted custom-type statement ranges are removed only after dependency validation succeeds.
- Renaming a custom type updates every structured table-field, domain-base, and composite-field reference by ID.
- Built-in type labels and parameters are rendered through the active dialect settings.
- String values are escaped using dialect-safe SQL literal rules.
- Existing unchanged SQL remains patch-based and preserves formatting.

## Dependency Rules

Custom-type dependencies are indexed across table fields, domains, and composite fields.

- Deleting a referenced custom type is blocked.
- The UI lists the objects that reference the type.
- Direct and indirect recursive domain/composite type graphs are invalid.
- Renames are safe because structured references use stable IDs rather than matching names.
- Duplicate custom-type names are invalid within the same schema.

## Custom Types Panel

The panel uses compact, virtualizable editor cards consistent with Tables:

- PostgreSQL Add menu contains Enum, Domain, and Composite.
- Headers show type name, kind, usage count, color marker, collapse control, actions, and Trash icon.
- Enum editors support ordered add, edit, reorder, and delete value operations.
- Domain editors support base-type picking, default expression, `NOT NULL`, and check expression.
- Composite editors support ordered add, edit, reorder, and delete field operations.
- Destructive controls use the shared Trash icon treatment.
- Empty states and unsupported-dialect messages are specific and actionable.

The initial implementation uses bounded rendering because custom-type counts are expected to remain small. The list and card boundary remains separate so virtualization can be added later without changing the data model or individual editors.

## Validation

Diagnostics cover:

- duplicate or empty custom-type names;
- empty or duplicate enum values;
- missing or unresolved domain base types;
- empty or duplicate composite field names;
- unresolved field types;
- invalid type parameters;
- recursive reusable-type dependencies;
- attempts to delete referenced types.

Invalid editor state is retained so users can repair it. Saving omits newly created invalid statements and reports the reason. Existing unsupported source remains preserved when safe.

## Verification

- Open PostgreSQL schemas containing enums, domains, composites, arrays, and schema-qualified references.
- Open MySQL schemas containing parameterized built-ins, inline enums, sets, and unsigned modifiers.
- Confirm the type picker contains only active-dialect built-ins plus valid schema custom types.
- Confirm parameter controls round-trip to SQL.
- Confirm custom-type create, edit, rename, and dependency-protected delete behavior.
- Confirm canvas field labels remain canonical and readable.
- Confirm production application compilation and packaging.
- Do not run automated tests unless the user explicitly requests them.

## Scope

This phase covers typed dialect settings, strict field type selection, PostgreSQL enum/domain/composite types, MySQL inline enum/set parameters, parsing, generation, validation, and Custom Types UI. PostgreSQL range types, multiranges, base types, casts, operators, collations, and MySQL emulation of reusable types are excluded.

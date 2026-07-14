# Hide Array Dimensions Control Design

## Goal

Remove PostgreSQL array-dimension inputs from the compact field type dropdown while preserving array types already parsed from SQL.

## Behavior

- Do not render an array-dimensions input on built-in or custom type option rows.
- Selecting a new type from the dropdown creates a scalar type with zero array dimensions.
- Existing columns, domains, and composite fields that use `[]` retain their structured array dimensions and formatted SQL until their type is replaced.
- Opening and closing the dropdown without selecting another type never changes an existing array.
- Replacing an existing array type with a dropdown option intentionally produces the selected scalar type.

## Scope

This change removes array creation/editing from the compact picker only. Parsing, canvas labels, and SQL generation continue to support PostgreSQL arrays. A future advanced field editor can expose an explicit Array control.

## Verification

- Confirm no `[]` parameter input appears in dropdown rows.
- Confirm existing array SQL remains unchanged when unrelated fields are edited.
- Confirm selecting a replacement type produces a scalar type.
- Confirm the production application builds successfully.
- Do not run automated tests unless explicitly requested.

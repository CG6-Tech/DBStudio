# Compact Virtual Table Editor Implementation Plan

1. Replace header color/delete controls with a fixed-width Actions trigger and overlay menu.
2. Add temporary rename mode, native color action, destructive delete action, keyboard navigation, and outside-click dismissal.
3. Remove the redundant always-visible table-name editor and compact field rows.
4. Move field deletion into a hover/focus action without changing virtualization metrics.
5. Verify narrow and standard sidebar layouts, interactions, tests, production build, Rust tests, and macOS packaging.


# Virtualized Table Sidebar Implementation Plan

1. Add a pure virtual-table model with binary-search range calculation, offsets, clamping, keyboard navigation, and search-record helpers.
2. Add scale-focused unit tests using 3,000 tables and operation-count assertions.
3. Extract the Tables panel into a single-expansion virtualized component.
4. Connect canvas table/column selection to panel activation, expansion, and scroll-to-reveal.
5. Add compact-row, spacer, translated-window, focus, and field-match styles.
6. Verify frontend tests, TypeScript production build, Rust tests, and macOS packaging.


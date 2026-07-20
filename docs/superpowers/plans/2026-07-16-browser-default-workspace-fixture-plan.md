# Browser Default Workspace Fixture Implementation Plan

1. Add a Node-only development workspace scanner with deterministic SQL-file discovery, containment checks, hashing, and ignored-directory rules.
2. Add a fixed Vite serve-mode endpoint for `/Users/cg/Downloads/chartdb-folder-test` that returns an `OpenedWorkspace` payload.
3. Add a browser-only development client for the fixed endpoint; do not expose a path parameter or filesystem API.
4. Replace browser development startup with fixture-first loading through the existing dialect detection and workspace parser.
5. Fall back to the bundled example with a visible status message for endpoint, scan, dialect, or parsing failures.
6. Add scanner and client tests, then verify the full suite, production build, and live browser refresh behavior.

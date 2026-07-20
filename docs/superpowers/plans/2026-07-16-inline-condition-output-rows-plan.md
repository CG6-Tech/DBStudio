# Inline Condition Output Rows Implementation Plan

1. Add stable visual clause-port IDs and semantic branch IDs to routine-flow edges.
2. Expand top-level OR decisions into one visible port per clause while keeping every port mapped to the same execution branch.
3. Keep top-level AND decisions on one semantic output and expose its port only on the final clause row.
4. Render independent validations, compound decisions, guards, and switches through one inline condition-row component.
5. Remove the structured condition body, expression disclosure, and their height allocation while preserving full SQL in the inspector.
6. Update port styling, grouping rails, geometry estimates, graph reachability, and focused tests.
7. Run the complete test suite, production web build, and native macOS build.

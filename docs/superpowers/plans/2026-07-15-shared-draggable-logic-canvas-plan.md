# Shared Draggable Logic Canvas Implementation Plan

1. Add an independent persisted Logic layout model to schema metadata.
2. Project tables, triggers, routines, and unresolved references into semantic block/port nodes.
3. Rank the dependency graph deterministically from left to right with cycle-safe fallback placement.
4. Reconcile saved node positions with automatic positions by stable ID.
5. Replace fixed Logic rendering with compact routine-flow-style blocks and port-anchored live edges.
6. Add local dragging with one commit on release, background pan, pointer zoom, fit, arrange, minimap, and temporary drawer.
7. Persist Logic positions and viewport without marking SQL dirty or changing ER positions.
8. Add projection/layout/persistence tests and run the complete regression/build suite.

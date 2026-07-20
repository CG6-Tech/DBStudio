# Compact Natural-flow Routing Implementation Plan

1. Replace obstacle/outer-track routing with bounded forward and backward Bézier splines.
2. Add deterministic local separation for parallel edges and a bounded route cache.
3. Tune ELK layered placement for compact network-simplex positioning and smaller gaps.
4. Tighten deterministic fallback lane spacing while preserving non-overlap.
5. Replace obstacle-routing tests with endpoint, bounds, overlap, cache, and performance fixtures.
6. Run the full test suite, production build, and native macOS build.

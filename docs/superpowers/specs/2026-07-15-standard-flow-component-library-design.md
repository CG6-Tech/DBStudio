# Standard flow component library design

## Objective

Restore the original dark ViewDB Logic graph appearance and provide one reusable component library for both the main Logic graph and detailed PL/pgSQL flows. Connections must begin at the measured center of a circular output indicator and terminate at the measured center of a circular input indicator on the next component.

## Decisions

- Both canvases use the original dark ViewDB visual language.
- The library exposes a small set of configurable primitives rather than a dedicated component for every SQL operation.
- Connections use adaptive routing: unobstructed forward edges are smooth curves; obstacle, reverse, parallel, and merge routes use orthogonal tracks.
- Existing parsing, merge generation, branch focus, dragging, pinning, arrangement, source inspection, and layout persistence remain in scope.

## Component architecture

`FlowBlock` is the shared structural foundation. It owns sizing, neutral dark surfaces, header layout, selection, focus, dragging, pin presentation, body regions, and port slots. Database behavior and parsing remain outside the UI library.

Seven configured primitives use `FlowBlock`:

- Trigger
- Condition
- Operation
- Exception
- Merge
- Return
- Reference

Normalized node data selects a primitive and supplies its title, icon, semantic accent, source summary, input ports, output ports, and interaction callbacks. SQL SELECT, INSERT, UPDATE, DELETE, and assignment nodes use the Operation primitive with different labels and metadata.

Both `LogicCanvas` and `RoutineFlowCanvas` use the same block, port, connection, and routing components. Canvas-specific concerns such as graph projection, routine parsing, inspector content, minimap, and viewport state stay outside the library.

## Visual contract

- Dark dotted ViewDB canvas.
- Neutral dark blocks with restrained semantic borders and header icons.
- Circular edge ports, matching the earlier Logic graph style.
- Inputs on the left border and outputs on the right border.
- Semantic color appears on icons, circular ports, and connections rather than filling the block.
- Selected and pinned states use the established ViewDB focus and gold pin treatments.
- The main Logic graph preserves its prior compact block density and appearance.
- Detailed routine blocks may be taller to display expressions and branch labels, but use the same foundation and tokens.

## Port contract

`FlowPort` is the only port-rendering component. It receives a stable port ID, direction, semantic type, label, and optional activation callback. It renders a circular indicator centered halfway across its block border.

Each port element exposes stable node and port data attributes. After render, it registers the center of the actual visible circle with the canvas geometry registry. The registry stores coordinates in canvas space, independent of viewport translation and zoom.

The measured circle center is the authoritative endpoint. Connections are not rendered until both endpoints are registered. Missing endpoints create no dangling line and emit a development diagnostic.

## Geometry registry

The registry tracks:

- block rectangles;
- circular port centers;
- node and port IDs;
- geometry revision.

Geometry refreshes after initial render, node movement, node resize, inline expansion, collapse, arrangement, and viewport-scale changes that affect coordinate conversion. Resize observation handles dynamic content. Drag updates are batched through animation frames.

UI components publish geometry; they do not calculate routes. The router consumes an immutable geometry snapshot, keeping measurement separate from routing policy.

## Connection routing

Every path begins at the registered center of a circular output port and ends at the registered center of a circular input port.

For a clear forward connection, the router uses a cubic curve with horizontal source and target tangents. If the curve would cross an expanded block rectangle, travel backward, conflict with a parallel connection, or enter a multi-input merge, it uses a deterministic orthogonal track.

Parallel edges receive distinct tracks. Each merge input owns a separate circular port and track; only one output leaves the merge. Connections render above the grid and beneath blocks. During dragging, incident routes update from live registered centers once per animation frame.

Branch focus changes connection opacity and width without changing geometry. Semantic color is derived from the source port.

## Shared API boundary

The UI library accepts normalized display data only:

- node ID and primitive kind;
- title, icon, accent, summary, and details;
- input and output port definitions;
- position, selected, pinned, and dimmed state;
- selection, drag, and port-activation callbacks.

It does not import the SQL parser, schema document, metadata persistence, or Zustand store. This keeps the components reusable in the Logic graph, routine flow, future trigger editor, exports, and read-only previews.

## Migration

1. Extract dark theme tokens and shared primitives without changing graph behavior.
2. Replace main Logic graph blocks and circular indicators with the shared library while preserving the earlier layout, inspector, minimap, pinning, and arrangement.
3. Replace routine-flow cards and ports with the same library.
4. Replace calculated port offsets with the geometry registry.
5. Route both canvases from registered circular centers.
6. Remove the white Postman-specific CSS and rectangular edge indicators.

Existing normalized flow data, explicit Merge nodes, branch focus, source inspection, saved positions, and inline expansion remain intact.

## Error handling

- Missing port geometry suppresses the affected connection and emits a development diagnostic.
- Stale geometry revisions and asynchronous routes are ignored.
- Router failure falls back to a simple center-to-center horizontal-tangent curve when both endpoints exist.
- Missing or unresolved database references continue to render using the Reference primitive.

## Testing

Component tests apply the same accessibility, selection, dragging, pin, label, and circular-port contract to all seven primitives.

Geometry tests verify coordinate conversion, zoom independence, resize refresh, inline expansion, collapse, and drag batching. Routing tests assert that path start and end coordinates equal registered circular centers exactly, curves have horizontal tangents, tracks avoid blocks, parallel edges remain separate, and merge branches enter distinct circular inputs.

Regression fixtures cover the review validation flow and `audit_order_change()`. UI regression tests preserve the main Logic graph's earlier appearance and behavior while checking the detailed dark flow, branch focus, explicit merge, drag-to-pin, arrangement, and persisted layouts.

The complete test suite, production web build, and native macOS build must pass.

## Out of scope

- Editing SQL through the visual blocks.
- Evaluating PL/pgSQL conditions.
- Creating a separately published package.
- Supporting arbitrary user-created port placement.

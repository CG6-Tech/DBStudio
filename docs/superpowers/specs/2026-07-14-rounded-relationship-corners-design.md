# Rounded Continuous Relationship Corners

## Goal

Replace ViewDB's sharp 90-degree relationship elbows with the subtle rounded continuous corners shown in the supplied reference. The same rounded geometry applies to default solid routes and active animated dashed routes.

## Rendering approach

The relationship geometry layer keeps its orthogonal anchor and routing points. Before rendering, a pure geometry helper converts every eligible elbow into a sampled quadratic bend:

1. Keep the route's first and last points unchanged.
2. For each interior corner, measure the incoming and outgoing segment lengths.
3. Clamp the requested radius to half of the shorter adjacent segment.
4. Add a point before the elbow, sampled quadratic points around the elbow, and a point after the elbow.
5. Return one continuous point sequence for the renderer.

Both the solid and dashed renderers consume this same sequence. The dashed renderer continues tracking its pattern distance across every sampled segment, so the dash pattern does not restart or create a square fragment at a corner.

## Visual rules

- Preferred corner radius: `12px` in world coordinates.
- Short routes automatically use a smaller clamped radius.
- Six quadratic samples per corner provide a smooth curve without producing excessive geometry.
- Cardinality badges, field ports, endpoint anchors, colors, widths, and animation speed remain unchanged.
- Collinear points do not create curves.
- Routes with no elbow render exactly as before.

## Performance

Rounded points are derived only when relationship geometry is recalculated. Active animation reuses the sampled point sequence and changes only dash phase. A typical route adds fewer than 20 sampled points, keeping the work small for the selected table's connected relationships.

## Verification

Automated tests cover:

- horizontal-to-vertical bends;
- vertical-to-horizontal bends;
- radius clamping on short segments;
- preservation of the first and last endpoint;
- no added points for a straight route;
- continuity of the returned point sequence.

Native visual verification compares a close crop of a ViewDB elbow with the supplied rounded-corner reference. The accepted result has a visibly curved transition and no isolated square dash at either end of the bend.

## Acceptance criteria

- Default and active relationship routes use the same rounded geometry.
- Every 90-degree turn has a subtle continuous curve when adjacent segments allow it.
- Animated dashes flow through the curve without restarting.
- Short segments remain stable and never overshoot their neighboring points.
- Cardinality placement and live table-movement routing remain unchanged.

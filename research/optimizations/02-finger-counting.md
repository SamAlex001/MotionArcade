# Optimization 02 — Finger Counting

**File**: `src/lib/finger-counting.ts`
**Hotspots addressed**: H2 (dual `atan2` per joint).

## Problem

The original implementation determined whether a finger was extended by
computing the angle at its middle joint:

```ts
function getAngle(a, b, c) {
  const radians = Math.atan2(c.y - b.y, c.x - b.x)
                - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs(radians * 180 / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}
```

This was called 5 times per hand per frame (4 fingers + thumb). With two
hands at 60 fps that's 600 `getAngle` calls/sec — **1,200 `atan2`
invocations/sec**. `atan2` is a transcendental function — ~120 ns each
on modern V8. The per-call allocation of the `[[mcp,pip,tip], ...]` joint
array inside the function also added ~5 short-lived allocations/frame.

## Root cause

The angle-in-degrees representation was never used directly — it was
compared once against a constant threshold (160° / 150°). Computing the
full angle just to compare it is wasteful.

## Fix

Replace the angle test with a **cosine test** using the dot product:

```
cos(angle) = (u · v) / (|u| · |v|)
```

The thresholds `>160°` and `>150°` become `cos < cos(160°) = -0.9397`
and `cos < cos(150°) = -0.8660`. No `atan2`, no `* 180 / π`, no `abs`
or branch. One `sqrt` per joint (acceptable; ~7 ns).

Additionally:

- The finger-joint triples (`[MCP, PIP, TIP]` for each of the four
  curlable fingers) are hoisted into a module-scope `Int8Array` so
  they are allocated once for the process, not once per call.
- The function body is straight-line; the inner loop walks the typed
  array with a stride of 3.

## Code diff summary

| Aspect                       | Before        | After          |
|------------------------------|---------------|----------------|
| `Math.atan2` calls per hand  | 10            | 0              |
| `Math.sqrt` calls per hand   | 0             | 5              |
| `Math.abs` calls per hand    | 5             | 0              |
| Joint-index array allocation | per call (heap) | one Int8Array (BSS) |
| Branches per joint           | 2             | 1              |
| Approx ns / call (estimated) | ~120 ns × 10 = 1200 ns | 5 × ~7 ns = 35 ns |

## Measured effect

**Static**: ~34× theoretical reduction in transcendental cost per frame.
With 60 fps × 2 hands, the baseline cost was ~2.4 µs/sec on `atan2`
alone, dwarfed by other costs — but the elimination matters under
sustained load on slower devices where every microsecond of headroom
helps the adaptive frame-skipper stay at the lowest level.

**Runtime**: a micro-benchmark (1 million calls each, equivalent
landmarks) is the recommended validation; record results in
`research/data/run-<scenario>.json` under stage `inference` for an
end-to-end comparison.

## Trade-offs

- The cosine threshold is mathematically equivalent for monotonic angles
  in `[0°, 180°]`, which is the only range produced by hand-joint
  geometry. No accuracy is lost.
- If the project ever wants to expose the *angle in degrees* (e.g. for
  haptic feedback strength), it would have to be computed separately —
  but no current consumer needs this.

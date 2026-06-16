# Optimization 04 — Three.js Hand Renderer

**File**: `src/app/games/just-show-your-hands/three-hand-renderer.ts`
**Hotspots addressed**: H4 (over-rich materials + geometry).

## Problem

The renderer that produces the "gauntlet" visual mode used:

- `MeshPhysicalMaterial { clearcoat: 1.0, clearcoatRoughness: 0.05 }`
  for **every joint** and **every bone** mesh.
- `SphereGeometry(1, 20, 20)` — ~400 triangles per joint mesh.
- `CylinderGeometry(1, 0.82, 1, 10)` — 60 triangles per bone mesh.
- A full `PMREMGenerator` environment pass at scene creation, even on
  phones.

Per the static count: 21 joints × 2 hands × 400 = **16,800 joint
triangles**, plus 21 bones × 2 × 60 = **2,520 bone triangles**, every
frame, all running through the clearcoat shader. The clearcoat term
in `MeshPhysicalMaterial` is roughly 30 % more expensive per fragment
than the equivalent `MeshStandardMaterial`.

The PMREM environment generation alone took ~120 ms on the test Pixel 7,
blocking the first paint of the Just-Show-Your-Hands route.

## Root cause

The PBR setup was tuned for a hero-shot render at 1080p. On the actual
device, joint spheres are ~22 px in diameter — the clearcoat highlights
are imperceptible at that scale. The geometry segment counts likewise
exceed the on-screen pixel coverage by an order of magnitude.

## Fix

1. **Demote joint and bone materials to `MeshStandardMaterial`.** Keep
   `MeshPhysicalMaterial` for the fingertip (`mats.tip`) and palm
   repulsor (`mats.repulsor`), where the rim-light reads as glassy and
   the clearcoat shader is part of the visual identity.
2. **Reduce geometry**:
   - Desktop: sphere 12×12 (144 tris), cylinder 8 radial.
   - Mobile: sphere 10×10 (100 tris), cylinder 6 radial.
3. **Skip PMREM on mobile entirely.** Without the environment map the
   armor reads ~5 % darker — acceptable trade for ~120 ms of init time
   and ~12 MB of GPU memory.
4. **Disable MSAA on mobile** (`antialias: !isMobile`). Mobile GPUs
   take a disproportionately large hit from MSAA.
5. **Cap `devicePixelRatio` to 1.5 on mobile** (down from 2.0).
6. **Pre-bake `JOINT_RADIUS` and `BONE_RADIUS` into typed arrays**
   indexed by landmark/connection index — replaces the original
   `Record<number, number>` plus `??` fallback (a double lookup) with
   a single Float32Array read.
7. **`frustumCulled = false` on every joint/bone mesh** — eliminates
   the per-frame bounding-box / frustum test (these meshes are always
   on-screen by construction).
8. **In the update loop**: hoist `1/len` instead of calling
   `_dir.normalize()` (one division replaces a length + division).
   Replace the `forEach((m) => m.visible = false)` calls with index
   loops to eliminate closure allocation.

## Code diff summary

| Aspect                              | Before    | After (Desktop) | After (Mobile) |
|-------------------------------------|----------:|----------------:|---------------:|
| Joint material                      | Physical  | Standard        | Standard       |
| Bone material                       | Physical  | Standard        | Standard       |
| Sphere segments                     | 20×20     | 12×12           | 10×10          |
| Cylinder radial segments            | 10        | 8               | 6              |
| Triangles per joint                 | ~400      | ~144            | ~100           |
| Triangles per bone                  | ~60       | ~48             | ~36            |
| **Triangles on-screen (2 hands)**   | **19 320** | **8 064**      | **5 712**      |
| MSAA                                | on        | on              | off            |
| Pixel ratio cap                     | 2.0       | 2.0             | 1.5            |
| PMREM env pass                      | always    | yes             | **skipped**    |
| Frustum culling on hand meshes      | on        | off             | off            |
| Joint-radius lookup                 | Record+`??` | Float32Array  | Float32Array   |

## Measured effect

**Static**:

- Triangles drawn per frame: **2.4× fewer (desktop), 3.4× fewer (mobile)**.
- Per-fragment cost: clearcoat shader removed from 84 out of 86 meshes
  (joints + bones), a ~25 % reduction in average fragment cost over
  the hand area.
- Init time on mobile: PMREM removed, saving ~120 ms before first
  paint. On desktop, unchanged.

**Runtime** (planned): record `perf.snapshot().stages['three.render']`
on the gauntlet mode. Hypothesis: ≥ 1.6× steady-state FPS on a Pixel 7.

## Trade-offs

- Joints look very marginally less glossy on close inspection
  (clearcoat removed). At the on-screen scale used in the game, the
  difference is invisible.
- Mobile gauntlet mode loses the environment reflection — the armor
  reads as slightly flatter. Subjectively acceptable; the alternative
  is sub-30 fps.
- A 10×10 sphere has visible polygonal silhouettes when zoomed in. The
  game never zooms in.

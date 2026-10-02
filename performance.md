# 🏎️ APEX TURBO: High-Performance Zero-GC Engine Architecture

> **MANDATORY POLICY FOR ALL FUTURE DEVELOPMENT & UPDATES**  
> This document specifies the strict performance guidelines that guarantee **stable 60–120 FPS on mobile and low-power devices**.  
> **Under NO circumstances should any update introduce per-frame runtime allocations or forced browser reflows.**

---

## ⚡ The Golden Rule: ZERO Allocations Per Frame (0 Alloc/Frame)

In JavaScript / TypeScript games, the V8 engine triggers Garbage Collection (GC) pauses whenever short-lived heap allocations accumulate.  
On mobile CPUs, a **5–15ms GC pause causes an immediate drop from 60 FPS down to 30–45 FPS**.

### 🚫 STRICT PROHIBITIONS inside `update()`, `render()`, `applyInput()`, or Touch Callbacks:
1. **NO `new THREE.Vector3()`, `new THREE.Quaternion()`, `new THREE.Euler()`, `new THREE.Matrix4()`**
2. **NO `.clone()`** on any vector, quaternion, or matrix.
3. **NO object literals `{ ... }` or array literals `[ ... ]`** generated per frame.
4. **NO `Array.from(...)`, `array.map(...)`, `array.filter(...)`, or array spreading `[...items]`**.
5. **NO `getBoundingClientRect()`** inside `touchmove`, `pointermove`, or per-frame update loops (causes Forced Synchronous Layout Thrashing).
6. **NO inline arrow function closures** inside tight loops (e.g. `items.forEach(...)` with function creation).

---

## 🛠️ How to Write Zero-Allocation Code (Cheat Sheet)

### ❌ WRONG (Causes GC Spikes & Mobile Lag):
```ts
// DO NOT DO THIS IN THE UPDATE LOOP:
const toTarget = new THREE.Vector3().subVectors(target.position, kart.position);
const dir = toTarget.clone().normalize();
const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.quaternion);
const heading = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
```

### ✅ RIGHT (Zero Allocations, Buttery Smooth):
```ts
// 1. Declare permanent scratch objects ONCE (at module-level or class instance level):
const _toTarget = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _axisY = new THREE.Vector3(0, 1, 0); // Constant
const _heading = new THREE.Quaternion();

// 2. In the update loop, mutate in-place:
_toTarget.subVectors(target.position, kart.position);
_dir.copy(_toTarget).normalize();
_forward.set(0, 0, 1).applyQuaternion(kart.quaternion);
_heading.setFromAxisAngle(_axisY, angle);
```

---

## 📋 Comprehensive System Audit & Optimizations Implemented

### 1. Camera & Player Tracking (`src/entities/PlayerKart.ts`)
* **Scratch Vectors:** Pre-allocated 11 permanent class fields (`_camSpeedPullBack`, `_camOffsetWithSpeed`, `_camWorldUp`, `_camAxisY`, `_camSmoothHeading`, `_camDesiredPos`, `_camDesiredLookAt`, `_camAirOffset`, `_camShakeRight`, `_camShakeUp`, `_camFwdSnap`).
* **Zero Allocations:** Completely replaced 6–8 per-frame `new THREE.Vector3/Quaternion` calls in `updateCamera()`.
* **Smooth Camera without Fake Jitter:** Removed artificial random camera micro-tremor during Nitro boost that looked like mobile screen stutter.
* **Smart FOV Projection:** `camera.updateProjectionMatrix()` is strictly called only when FOV value actually transitions (`Math.abs(fov - targetFOV) > 0.01`).

### 2. Vehicle Physics & Visual Rotation (`src/entities/Kart.ts`)
* **15 Per-Kart Scratch Fields:** `_kq`, `_kForward`, `_kRight`, `_kPosVec`, `_kVelVec`, `_kRoadNormal`, `_kDriveForward`, `_kDriveRight`, `_kYawQuat`, `_kFwd`, `_kTangent`, `_kBinormal`, `_kBasisMat`, `_kTargetMeshQuat`, `_kDriftQuat`, `_kDriftEuler`, `_kIdentQuat`.
* **Zero Boost Allocations:** `applyBoost()` mutates scratch vectors directly without allocating Quaternions or Vectors on nitro or boost pad triggers.
* **Flame Matrix Throttling:** Exhaust flame scale is updated via index loop when boosting and capped to a single 0.001 set when idle to avoid continuous matrix recalculations.

### 3. Physics & WASM Interface (`src/core/Physics.ts`)
* **Pre-allocated RAPIER Ray:** Cached `_cachedRay` instance. Every `castRay()` mutates `_cachedRay.origin` and `_cachedRay.dir` directly.
* **Zero WASM Heap Churn:** Eliminates 3 WASM heap allocations per raycast (saved ~900 allocs/sec across all karts).

### 4. Checkpoints & Standings (`src/world/CheckpointSystem.ts`)
* **Gate Distance Checks:** Replaced `new THREE.Vector3(...)` with `_tempToKart` and `_tempPrevToGate` in the candidate checkpoint loop (saved ~20 allocs/frame).
* **Standings Ranking:** Replaced `Array.from(this.racers.values())` with pre-allocated `_standingsList` array that is cleared and populated in-place.

### 5. Bot AI Navigation (`src/entities/BotKart.ts`)
* **Zero-Alloc AI Pathfinding:** Hazard avoidance, pure pursuit destination, and rival collision nudges use `_botToBlock`, `_botTargetDest`, `_botToDest`, and `_botToRival`.
* **Saved:** ~16 allocations per frame across all AI racers.

### 6. Tire Skidmarks on Asphalt (`src/world/SkidmarkSystem.ts`)
* **Direct TypedArray Buffer Math:** Replaced 7 Vector3 allocations per wheel per frame during drift with direct Float32Array coordinate math.
* **Persistent Wheel State Vectors:** `wheelStates` vectors are kept in a Map and reused via a `wheelConnected` Set instead of allocating and deleting Vector objects on drift transitions.

### 7. Mobile Touch Controls (`src/core/Input.ts` & `src/styles/hud.css`)
* **Classic Mobile Racing Layout:** Classic arcade split — Left thumb operates dual steering buttons (◀ LEFT and ▶ RIGHT); Right thumb operates Gas, Brake, and Nitro pedals.
* **Pure Arcade Precision Steering:** Dual responsive directional buttons with touch-slide support between Left and Right, offering immediate, crisp cornering control without screen clutter or wheel lag.
* **Zero Layout Thrashing:** `getBoundingClientRect()` on steering buttons is cached once on initialization, `resize`, and `orientationchange`. Touchmove handlers use pure numeric coordinate comparisons without querying DOM geometry or triggering forced synchronous reflows.
* **Translucent Frosted Glass UI:** Lightweight semi-transparent glass (`rgba(14, 18, 28, 0.42)` with thin 1.5px border), keeping 100% of the racing track, obstacles, and opponent karts clearly visible.
* **State-Guarded DOM Classes:** `classList.toggle('pressed')` only fires when the button state actually transitions, preventing continuous DOM style invalidations.
* **Instant Touch Delivery:** Applied `touch-action: none;` on all touch buttons to disable browser gesture detection delay.
* **GPU Filter Pass Eliminated:** Removed `filter: brightness(1.2)` from button active transitions to eliminate mobile compositor shader passes.

### 8. Sound Engine (`src/core/Sound.ts`)
* **Background Buffer Pre-Warming:** Boost turbine and crash impact PCM audio buffers (~23,040 samples each) are synthesized in the background 100ms after user gesture, eliminating the 20ms audio synthesis freeze on the first Nitro button tap.

### 9. Speedlines Radial Overlay (`src/ui/SpeedlinesOverlay.ts`)
* **Mobile Adaptive Wind Streaks:** Renders 18 dynamic wind streaks on mobile screens (vs 34 on desktop), providing the exact same high-speed warp visuals while cutting full-screen 2D canvas drawing overhead in half.

### 10. Pre-Cached Track Spline Lookups (`src/world/Track.ts`)
* **O(1) Pre-Computed Slices Array:** All 400 track slices (`position`, `tangent`, `binormal`, `normal`, `halfWidth`, `extraY`, `isRamp`, `isGap`) are pre-computed once when the track loads into `this.cachedSlices[]`.
* **Zero Spline Re-computations:** Completely eliminated `curve.getPointAt()` and `curve.getTangentAt()` from per-frame runtime loops.
* **Saved:** ~1,200 vector allocations and 40+ polynomial solves per second across 3 AI bots and player queries.

### 11. Batched GPU Skidmark Updates (`src/world/SkidmarkSystem.ts`)
* **Single Batched Buffer Sync:** Previously, every drifting wheel called `positions.needsUpdate = true` and `alphas.needsUpdate = true` individually (up to 8 GPU buffer uploads per frame). Now, skidmark points are buffered and synced to the GPU at most **once per frame** inside `update()`.
* **Permanent Wheel IDs:** Added `kart.wheelIdL` and `kart.wheelIdR` to `Kart` to eliminate heap string concatenations (`kart.id + '_L'`) every frame.

### 12. Kinetic Hazards Zero-Allocation Engine (`src/world/KineticHazards.ts`)
* **Scratch Vector Suite:** Pre-allocated static scratch vectors (`_khLocalHeadPos`, `_khReboundDir`, `_khBounceVel`, `_khLaunchVel`, `_khRadDir`, `_khBladeDir`, `_khLateralStrike`).
* **Zero Allocation in Hazards:** Completely removed all `new THREE.Vector3()` and `.clone()` calls from rotating turbines and swinging wrecking pendulums.

### 13. Mobile GPU Fillrate & Shadow Optimizations (`src/core/Engine.ts` & `src/world/Track.ts`)
* **Mobile Anisotropy Clamp:** Clamped `roadTex.anisotropy` to 2 on mobile (16 on desktop). Eliminates mobile GPU memory bandwidth saturation across the fullscreen road surface.
* **Mobile-Optimized Shadow Pass:** Shadow map resolution set to 512px on mobile (1024px on desktop) with `BasicShadowMap`, cutting shadow fillrate cost by 75% while keeping 100% of the cute 3D cartoon shadow look.
* **HUD Standings Throttling:** Live leaderboard DOM string builder throttled to 10Hz (every 100ms) to eliminate 50+ string template concatenations per second.
### 14. Universal Kart Geometry Merging & Shadow Caster Batching (`src/entities/Kart.ts` & `src/entities/kartBuilders/ApexBuilder.ts`)
* **Mesh Batching with BufferGeometryUtils:** Previously, each kart was composed of 125+ separate Three.js meshes (chassis parts, engine block, 6 velocity stacks, suspension wishbones, individual driver fingers, wheel spokes). In multi-kart races (4–8 racers), this generated 600–1,000+ draw calls per frame, choking mobile WebGL drivers.
* **Merged Static Geometries:**
  - Apex Chassis: 29 individual meshes merged into 3 batched geometries (`bodyMat`, `secondaryMat`, `darkMetalMat`).
  - Chassis Hardware: Engine block, exhaust pipes, suspensions, and rear axle merged into 1 single hardware mesh.
  - Driver Character: 30+ limbs, torso, head, and helmet parts merged into 4 batched geometries inside `driverGroup`.
  - Wheels: 10 sub-meshes per wheel (rim, 5 spokes, rotor, caliper) merged into 2 meshes per wheel (1 rim + 1 tire).
* **Draw Call Reduction:** Reduced meshes per kart from **125+ down to ~16** (an 87% reduction in draw calls). Total scene draw calls across 4 karts dropped from 500+ to under 80!
* **Shadow Caster Optimization:** Only the primary merged chassis body and the 4 wheel tires have `castShadow = true`. Eliminates 120 shadow passes per kart (5 shadow calls instead of 125).
* **Localized Sun Light Tracking (`src/main.ts`):** Directional sun light follows the player kart dynamically, concentrating the shadow map on active racers and allowing mobile shadow distance to be tightened from 70m to 38m.
* **Mobile WebGL Precision (`src/core/Engine.ts`):** Set to `mediump` on mobile for FP16 dual-issue ALU throughput, reducing GPU thermal load while maintaining 100% of the cartoon visual aesthetics.
* **Zero FPS Throttling:** Game remains unconstrained to run at the display's native refresh rate (80, 90, 120 Hz) without any artificial 60 FPS caps.

---

## 🔍 Validation Checklist for New Features

Whenever adding new features (e.g. powerups, new weapons, new tracks, weather effects):

1. [ ] **No `new` inside update loops:** Have all scratch objects been declared outside the loop?
2. [ ] **No array reallocation:** Are lists pre-allocated with a fixed size or reused via `arr.length = 0`?
3. [ ] **No DOM reads in hot loops:** Are element positions, dimensions, or rects cached instead of reading `offsetWidth`, `getBoundingClientRect`, or `computedStyle` during input/render?
4. [ ] **Verification command:** Always run `npx tsc --noEmit` to ensure type integrity before pushing changes.
5. [ ] **Memory profile:** Use Chrome DevTools Memory / Performance panel to verify that the JS Heap allocation line remains completely flat during 60 seconds of gameplay.

# SKY RUMBLE ARENA — COMPREHENSIVE COMBAT & COLLISION REFACTOR
**Document**: `RUMBLECHANGES.MD`  
**Date**: October 1, 2026  
**Status**: Production-Ready & Verified (`tsc --noEmit`: 0 Errors)

---

## 1. Executive Summary

This document details the architectural diagnosis, root-cause analysis, and complete engine refactor implemented to solve the critical **"Aar-Paar / Transparent Phasing"** bug in Sky Rumble Arena. 

Prior to this fix, karts in Sky Rumble (both offline AI bots and real-time multiplayer peers) would periodically pass directly through each other without collision or hit registration when rammed. The underlying physics engine (Rapier 3D) had bumper cuboid solver groups set to `0x0000` (script-driven collision), meaning the game relied entirely on TypeScript frame routines for physical blocking.

The system has now been upgraded to a **continuous 60 FPS dual-layer collision engine**:
1. **Layer 1 (Physical Integrity):** Unconditional positional push-out and normal velocity reflection running every single frame with zero cooldown.
2. **Layer 2 (Combat & Gamification):** Pair-specific impact tracking for air launches, camera shake, sound effects, HUD alerts, and economy rewards.

---

## 2. Root Cause Analysis (Why Karts Were Phasing Through Each Other)

Through systematic static and runtime profiling of `src/main.ts`, `src/world/RumbleCombat.ts`, and `src/world/KineticHazards.ts`, four distinct flaws were identified:

### Root Cause A: The 250ms Cooldown Blackout Window
- **Location:** `src/main.ts` (formerly lines 3230–3235) and `src/world/RumbleCombat.ts` (formerly line 114).
- **Flaw:** The continuous collision loop in `main.ts` gated the entire call to `resolveRumbleCombat` behind `if (now - kA.lastImpactTime > cooldown && now - kB.lastImpactTime > cooldown)`.
- **Symptom:** When two karts touched once, `lastImpactTime` was updated to `now`. For the next **250 milliseconds (15 consecutive frames at 60 FPS)**, line 3234 evaluated to `false` and skipped `resolveRumbleCombat` completely. Because anti-clipping separation was placed *inside* `resolveRumbleCombat`, karts received **zero physical separation** during those 250ms. At a velocity of 20 m/s (72 km/h), a kart travels **5.0 meters in 250ms**—directly driving through the entire 2.7m length of an opponent kart like a ghost.

### Root Cause B: Global Cooldown Cross-Blocking Hits
- **Flaw:** `lastImpactTime` was tracked globally per kart instead of per colliding pair.
- **Symptom:** If Bot B brushed against Bot C, Bot B's `lastImpactTime` was refreshed. If the local player immediately rammed Bot B 50ms later, the player's hit was rejected because `now - kB.lastImpactTime < cooldown`. To the player, their ram had zero effect, passing straight through the bot without triggering a hit or alert.

### Root Cause C: False Ghosting from Kinetic Hazards
- **Location:** `src/world/KineticHazards.ts` (lines 506, 550, 680).
- **Flaw:** Whenever a kart was struck by a central turbine hub, rotating aero blade, or swinging pendulum hammer, the hazard script executed `kart.setGhost(true, 2.5)`.
- **Symptom:** While intended to prevent hazard re-juggling, this gave the victim kart 2.5 seconds of full invulnerability and ghosting (`isGhost = true`). In `main.ts`, line 3227 had `if (kA.isGhost || kB.isGhost) continue;`. Any kart that had been clipped by a hazard became completely intangible to all other karts for 2.5 seconds.

### Root Cause D: Fixed 2.5m Distance vs 2.7m–3.2m Chassis Geometry
- **Flaw:** `minDist = 2.5` was hardcoded as a fixed scalar circle.
- **Symptom:** The kart bumper cuboid has a half-length of 1.35m (total length 2.7m) and a half-width of 0.85m (total width 1.7m). In a straight nose-to-tail collision, bumpers touch at 2.7m center distance. In a corner diagonal collision, corners touch at `sqrt(1.35² + 0.85²) * 2 ≈ 3.19m`. With a fixed 2.5m threshold, karts could overlap by up to 0.69m before collision logic even started executing.

---

## 3. Detailed File-by-File Changes

### A. `src/world/RumbleCombat.ts`

1. **Unconditional 60 FPS Physical Anti-Clipping Separation:**
   - Separated physical separation from combat damage. Separation now runs unconditionally on every frame whenever colliders overlap (`dist < minDist`), completely ignoring cooldowns.
   - Computes ground plane displacement vector `(nx, nz)` and immediately repositions karts using `rigidBody.setTranslation`.
   - Handles network asymmetry: if a local player collides with a remote multiplayer opponent (whose position is driven by snapshot interpolation), the local player takes the full separation displacement. For local vs local (Player vs Bot or Bot vs Bot), displacement is split 50/50.

2. **Unconditional Normal Velocity Deflection (Anti-Tunneling):**
   - Calculates relative closing velocity along the contact normal: `totalClosingSpeed = closingA + closingB`.
   - If `totalClosingSpeed > 0` (karts driving into each other), applies elastic bumper bounce (`restitution = 0.35`) via `rigidBody.setLinvel`. This stops karts from pushing back into each other on the subsequent frame.

3. **Exact 3D Oriented Bounding Box (OBB) Extent Calculation:**
   - Dynamically calculates the projection of each kart's forward and right vectors onto the collision normal `(nx, nz)`:
     ```typescript
     const extentA = Math.abs(fwdA.x * nx + fwdA.z * nz) * 1.35 + Math.abs(rgtA.x * nx + rgtA.z * nz) * 0.85;
     const extentB = Math.abs(fwdB.x * nx + fwdB.z * nz) * 1.35 + Math.abs(rgtB.x * nx + rgtB.z * nz) * 0.85;
     const minDist = extentA + extentB + 0.06; // 6cm safety buffer
     ```
   - Matches the physical 3D kart geometry at every angle:
     - Side-by-side: ~1.76m
     - T-Bone / broadside: ~2.26m
     - Nose-to-tail / nose-to-nose: ~2.76m
     - Diagonal corner: ~3.20m

4. **Pair-Specific Combat Cooldown Map (`_pairHitMap`):**
   - Replaced global `lastImpactTime` checks with `_pairHitMap = new Map<string, number>()`.
   - Key: `kartA.id < kartB.id ? `${kartA.id}_${kartB.id}` : `${kartB.id}_${kartA.id}``.
   - Only consecutive hits between the *exact same two karts* are subject to the 160ms–240ms combat cooldown. A hit between Bot 1 and Bot 2 will never block Player from hitting Bot 1.
   - Exported `clearRumbleCombatCooldowns()` to reset the map between matches.

5. **Respawn Shield Separation Integrity:**
   - Karts with active respawn shield (`isGhost = true`) are protected from combat damage, air launches, and score penalties, but **physical solid separation still executes**, preventing any other kart from driving through a shielded kart.

6. **Tuned Smash Closing Speed Thresholds:**
   - Adjusted closing speed thresholds (e.g. `closing > 2.5 m/s` or `boostTime > 0` for rear-end smash) to properly align with the arena speed scale factor (`arenaSpeedScale = 0.50`), ensuring crisp, rewarding hit registration.

---

### B. `src/world/KineticHazards.ts`

1. **Removed Redundant `kart.setGhost(true, 2.5)` Calls:**
   - Removed `kart.setGhost(true, 2.5)` from line 506 (Central Motor Hub hit).
   - Removed `kart.setGhost(true, 2.5)` from line 550 (Rotating Turbine Aero Blade hit).
   - Removed `kart.setGhost(true, 2.5)` from line 680 (Pendulum Hammer hit).
   - **Rationale:** Turbines and pendulums already maintain their own `lastHitTimes.get(kart.id)` maps with 1000ms–2000ms intervals. Setting `isGhost = true` was needlessly making hazard-struck karts intangible to other racers for 2.5 seconds.
2. **Preserved Respawn Immunity:**
   - Left `if (kart.isGhost) continue;` intact at the start of hazard collision checks so newly respawned racers with shields are still protected from instant hazard strikes.

---

### C. `src/main.ts`

1. **Import and Lifecycle Integration:**
   - Imported `clearRumbleCombatCooldowns` from `'./world/RumbleCombat'`.
   - Called `clearRumbleCombatCooldowns()` inside `startRumbleMatch()` to ensure clean match initialization.

2. **Refactored Continuous Step 2d Collision Loop:**
   - Divided the collision loop into clean mode-specific branches:
     ```typescript
     if (this.isRumbleMode && this.rumbleManager) {
       if (kA.group.position.y < -3.0 || kB.group.position.y < -3.0) continue;
       const distSq = kA.group.position.distanceToSquared(kB.group.position);
       if (distSq < 11.5) {
         resolveRumbleCombat(...);
       }
     } else {
       if (kA.isGhost || kB.isGhost) continue;
       const distSq = kA.group.position.distanceToSquared(kB.group.position);
       if (distSq < 7.2) {
         this.handleKartSmash(kA, kB);
       }
     }
     ```
   - Increased distance detection threshold from `distSq < 6.8` (2.60m) to `distSq < 11.5` (3.39m) to fully cover maximum diagonal corner extents.
   - Removed the outer cooldown check in `main.ts` so `resolveRumbleCombat` can run its 60 FPS separation routine continuously.

3. **Classic Circuit Racing Mode Protection (`handleKartSmash`):**
   - In `handleKartSmash`, moved physical anti-clipping separation (`minDistance = 2.4`) above the 250ms cooldown check.
   - Guaranteed that Classic Grand Prix racing keeps its realistic Forza/NFS grounded collision model, speed penalty, and PIT maneuver without any air launches or arcade combat alerts.

---

## 4. Verification Matrix

| Test Scenario | Expected Behavior | Result |
| :--- | :--- | :--- |
| **Player vs Bot (Head-On)** | Symmetrical rebound on arena deck; zero penetration | **PASSED** |
| **Player vs Bot (Rear-End / Nitro)** | Bot launched into sky; Player feels bumper recoil; coins/XP awarded | **PASSED** |
| **Player vs Bot (T-Bone)** | Bot catapulted sideways into air; Player stays grounded | **PASSED** |
| **Multi-Kart Jam (3+ Karts Touching)** | All karts push apart simultaneously via 60 FPS separation; no tunneling | **PASSED** |
| **Bot Rammed by Hazard, then Player** | Bot takes hazard launch; Player hitting bot immediately registers | **PASSED** |
| **Respawned Kart with Shield** | Shielded kart cannot be damaged; karts physically bump and do not phase through | **PASSED** |
| **Classic Grand Prix Racing Mode** | 100% grounded Forza/NFS bumping; no air launches or rumble alerts | **PASSED** |
| **Multiplayer P2P Sync** | Local and remote transforms push apart smoothly; smash packet sent via DataChannel | **PASSED** |
| **TypeScript Compilation** | `npx tsc --noEmit` exits with 0 errors | **PASSED (0 Errors)** |

---

## 5. Kinetic Hazards Mathematical & Architectural Fix (Grand Prix Circuit)

### 1. Wrecking Pendulum Hammer Fixes (`src/world/KineticHazards.ts`):
- **Inverted Sign Bug Resolved:** Fixed line 616 where `_khLocalHeadPos.x` was negated with `-Math.sin(...)`. Changed to `+Math.sin(...)`, matching Three.js right-handed rotation around +Z. Now when the hammer visually swings to the right (+X), its hitbox is on the right (+X); dodging to the left (-X) is 100% safe.
- **Infinite Vertical Column Removed:** Replaced the unconstrained height test (`vert >= -0.3 && vert <= vertMax`) with true 2D circular cross-section check:
  `Math.hypot(lat - _khLocalHeadPos.x, vert - _khLocalHeadPos.y) < (pendulum.hammerRadius + 0.85)`.
  When the hammer swings high into the air, karts can safely drive underneath without triggering ghost hits.
- **Gantry Placement & Grounding:** Changed `spanHalfWidth` from `slice.halfWidth + 3.0` (12.0m) to `slice.halfWidth + 0.8` (9.8m). Pillars now sit firmly on the red-and-white curb with mounting foot blocks (`clampL/R`). Downward dangling stumps and under-track struts were removed so nothing hangs below the track into the open sky.
- **Clearance Safeguard:** Clamped `maxAngle: 0.44` across `KineticHazards.ts`, `ClassicTrackConfig.ts`, and `HardcoreTrackConfig.ts` to ensure the hammer swings fully across the 18m highway without clipping gantry pillars.

### 2. Rotating Sky Turbine Fixes (`src/world/KineticHazards.ts`):
- **Exact Vector Blade Collision:** Replaced skewed `Math.atan2(vert, lat)` (which evaluated road height +0.5m instead of hub offset -5.7m) with direct 2D vector projections along each blade's centerline `(bx, by)`. Threading through blade gaps is now 100% fair and visually synchronized.
- **Pillar Placement & Grounding:** Changed `spanHalfWidth` from `slice.halfWidth + 2.2` (11.2m) to `slice.halfWidth + 0.8` (9.8m) with mounting foot blocks sitting cleanly on the curb, with no downward dangling pieces.
- **Shattered Fire Particle Removal:** Completely removed the messy yellow/red "shattered fire" impact particle explosions (`emitImpactSparks`) across turbine hub, turbine blade, pendulum hammer, and gantry pillar hits. Launch force, camera recoil shake, heavy impact sound effects, and HUD alerts remain 100% intact with a clean, modern, uncluttered look.

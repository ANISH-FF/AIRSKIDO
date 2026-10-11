import * as THREE from 'three';
import { Kart } from './Kart';
import { Track } from '../world/Track';
import { PhysicsEngine } from '../core/Physics';
import { getBotDifficulty } from '../core/BotKartSettings';
import { economy } from '../core/Economy';

// Reusable scratch vectors to eliminate runtime GC allocations
const _botKartPos = new THREE.Vector3();
const _botQ = new THREE.Quaternion();
const _botForward = new THREE.Vector3();
const _botRight = new THREE.Vector3();
const _botToKart = new THREE.Vector3();
const _botToCenter = new THREE.Vector3();
const _botTargetDest = new THREE.Vector3();
const _botToDest = new THREE.Vector3();
const _botToT = new THREE.Vector3();
const _botToBlock = new THREE.Vector3();
const _botToRival = new THREE.Vector3();
const _botOpenDir = new THREE.Vector3();
const _botBasisRight = new THREE.Vector3();
const _botBasisMat = new THREE.Matrix4();
const _botTargetQuat = new THREE.Quaternion();

export class BotKart {
  // Global coordinator for Anti-Swarm: tracks which target each bot is currently pursuing
  private static activeTargets: Map<string, string> = new Map();

  public static clearActiveTargets(): void {
    BotKart.activeTargets.clear();
  }

  public kart: Kart;
  private track: Track;
  public currentT: number;
  private baseLaneOffset: number;
  private currentLaneOffset: number;

  // Stuck / recovery state
  private stuckTimer: number = 0;
  private isReversing: boolean = false;
  private reverseTimer: number = 0;
  private reverseSteer: number = 0;
  private hazardBypassTimer: number = 0;
  private hazardBypassLane: number = 0;
  // No stuck detection for first 3 s (bots start from speed 0)
  private startupGrace: number = 3.0;

  // Combat
  private retaliateTarget: Kart | null = null;
  private retaliateTimer: number = 0;
  private randomNudgeCooldown: number = 3.0 + Math.random() * 4.0;
  private nitroCooldown: number = 2.0 + Math.random() * 3.0;

  // Total track perimeter (metres) – computed dynamically from track curve
  private trackLength: number = 1750.0;

  constructor(kart: Kart, track: Track, laneOffset: number = 0, startT: number = 0.005) {
    this.kart              = kart;
    this.kart.isBot        = true;
    this.track             = track;
    this.trackLength       = track.curve.getLength();
    this.baseLaneOffset    = THREE.MathUtils.clamp(laneOffset * 0.45, -2.2, 2.2);
    this.currentLaneOffset = this.baseLaneOffset;
    this.currentT          = startT;
  }

  public setTrack(newTrack: Track) {
    this.track = newTrack;
    this.trackLength = newTrack.curve.getLength();
  }

  public onRespawn(pos: THREE.Vector3, _rot: THREE.Quaternion) {
    BotKart.activeTargets.delete(this.kart.id);
    this.currentT          = this.track.getClosestT(pos, -1);
    this.stuckTimer        = 0;
    this.isReversing       = false;
    this.reverseTimer      = 0;
    this.retaliateTimer    = 0;
    this.retaliateTarget   = null;
    this.hazardBypassTimer = 0;
    this.startupGrace      = 2.0;
    this.currentLaneOffset = this.baseLaneOffset;
  }

  public onRammed(attacker: Kart) {
    if (attacker === this.kart) return;
    this.retaliateTarget = attacker;
    this.retaliateTimer  = 1.5;
  }

  public update(dt: number, physics: PhysicsEngine, otherKarts: Kart[]) {
    if (!this.kart.rigidBody) return;

    if (this.track && this.track.isArena) {
      this.updateArenaAI(dt, physics, otherKarts);
      return;
    }
    const trans   = this.kart.rigidBody.translation();
    const rot     = this.kart.rigidBody.rotation();
    const kartPos = _botKartPos.set(trans.x, trans.y, trans.z);
    const q       = _botQ.set(rot.x, rot.y, rot.z, rot.w);
    const forward = _botForward.set(0, 0, 1).applyQuaternion(q);
    const right   = _botRight.set(1, 0, 0).applyQuaternion(q);

    if (this.startupGrace > 0) this.startupGrace -= dt;

    // ── 1. VELOCITY-PROJECTED SPLINE TRACKING ─────────────────────────
    // Primary: project kart velocity onto track tangent → advance T.
    // This CANNOT skip over hairpins because T moves at physical kart speed.
    const curSliceForProj = this.track.getTrackSlice(this.currentT);
    const lv = this.kart.rigidBody.linvel();
    const fwdProgress = lv.x * curSliceForProj.tangent.x + lv.z * curSliceForProj.tangent.z;
    const dT = THREE.MathUtils.clamp(
      (fwdProgress * dt) / this.trackLength,
      -2.0 / this.trackLength,
       8.0 / this.trackLength
    );
    this.currentT = (this.currentT + dT + 1.0) % 1.0;
    // Secondary XZ correction: ONLY when speed > 3 m/s (bot is clearly moving).
    // Skipping this at low speed prevents the closed-loop start-area snap where
    // t=0.005 and t=0.995 are at the same physical location and correction picks wrong side.
    if (Math.abs(fwdProgress) > 3.0) {
      let bestT     = this.currentT;
      let minDistSq = Infinity;
      for (let step = -2; step <= 2; step++) {
        const testT = (this.currentT + step / Track.SAMPLES + 1.0) % 1.0;
        const s     = this.track.getTrackSlice(testT);
        const dx    = s.position.x - kartPos.x;
        const dz    = s.position.z - kartPos.z;
        const dSq   = dx * dx + dz * dz;
        if (dSq < minDistSq) { minDistSq = dSq; bestT = testT; }
      }
      this.currentT = bestT;
    }

    const currentSlice = this.track.getTrackSlice(this.currentT);
    const sliceIdx     = Math.round(this.currentT * Track.SAMPLES) % Track.SAMPLES;

    // Lateral distance from centreline (XZ only, signed)
    const toKart     = _botToKart.set(
      kartPos.x - currentSlice.position.x, 0,
      kartPos.z - currentSlice.position.z
    );
    const currentLat = toKart.dot(currentSlice.binormal);

    // Timers
    if (this.retaliateTimer > 0) {
      this.retaliateTimer -= dt;
      if (this.retaliateTimer <= 0) this.retaliateTarget = null;
    }
    this.randomNudgeCooldown -= dt;
    this.nitroCooldown       -= dt;
    if (this.hazardBypassTimer > 0) this.hazardBypassTimer -= dt;

    // ── 2. DYNAMIC JUMP ZONES & ANTI-GRAV TUBE (Works for Classic & Hardcore) ──
    const isNearAnyJump = this.track.config.jumpZones.some(
      (j) => sliceIdx >= (j.startSlice - 4) && sliceIdx <= (j.endSlice + 4)
    ) || currentSlice.isRamp;

    const isNearTube = !!(this.track.config.antiGravTube?.enabled &&
      sliceIdx >= (this.track.config.antiGravTube.startSlice - 3) &&
      sliceIdx <= (this.track.config.antiGravTube.endSlice + 3));

    // ── 3. AIRBORNE ───────────────────────────────────────────────────
    if (!this.kart.isGrounded) {
      const tangent = currentSlice.tangent;
      const vel     = this.kart.rigidBody.linvel();

      if (isNearAnyJump) {
        const horizSpd = Math.hypot(vel.x, vel.z);
        if (horizSpd < 28.0) {
          this.kart.rigidBody.setLinvel(
            { x: tangent.x * 30.0, y: vel.y, z: tangent.z * 30.0 }, true
          );
        }
        if (currentSlice.isGap && vel.y < -3.0) {
          this.kart.rigidBody.setLinvel({ x: vel.x, y: -1.0, z: vel.z }, true);
        }
      }

      const cross    = forward.x * tangent.z - forward.z * tangent.x;
      const airSteer = THREE.MathUtils.clamp(cross * 1.0, -0.30, 0.30);
      this.kart.applyInput(1.0, airSteer, false, dt, physics);
      return;
    }

    // ── 4. WALL / STUCK RECOVERY ─────────────────────────────────────
    if (this.startupGrace <= 0 && Math.abs(this.kart.currentSpeed) < 1.5 && !isNearAnyJump && !isNearTube) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.8) {
        this.isReversing = true;
        this.reverseTimer = 1.0;
        this.stuckTimer   = 0;
        this.reverseSteer = (currentLat > 0) ? -0.6 : 0.6;
      }
    } else {
      this.stuckTimer = 0;
    }

    if (this.isReversing) {
      this.reverseTimer -= dt;
      if (this.reverseTimer <= 0) { this.isReversing = false; }
      // During the 0.45 s escape window: suppress normal steering, just let the
      // velocity impulse carry the kart sideways. Light throttle so it doesn't stall.
      this.kart.applyInput(0.6, this.reverseSteer * 0.5, false, dt, physics);
      return;
    }

    // ── 5. LANE TARGET ────────────────────────────────────────────────
    let targetLane = this.baseLaneOffset;

    if (this.hazardBypassTimer > 0) {
      // While bypass lock is active, strictly hold the open road lane (+4.2 or -4.2)
      targetLane = this.hazardBypassLane;
    } else if (isNearAnyJump) {
      targetLane = 0.0;
      if (this.nitroCooldown <= 0.8) {
        this.kart.applyBoost(1.8, 1.5);
        this.nitroCooldown = 7.0;
      }
    } else {
      for (const block of this.track.hazardBlocks) {
        const toBlock = _botToBlock.subVectors(block.position, kartPos);
        const dist = toBlock.length();
        const fwdDist = toBlock.dot(currentSlice.tangent);
        // Early active detection up to 38m ahead (longitudinal forward distance between -2m and 36m)
        if (dist < 38.0 && fwdDist > -2.0 && fwdDist < 36.0) {
          const side = toBlock.dot(currentSlice.binormal);
          // Steer wide into the open lane (+4.2 or -4.2)
          targetLane = side < 0 ? 4.2 : -4.2;
          break;
        }
      }
    }

    // Fast responsive lane shift (6.0 instead of slow 2.5)
    this.currentLaneOffset = THREE.MathUtils.lerp(this.currentLaneOffset, targetLane, dt * 6.0);

    // ── 6. LOOKAHEAD & DESTINATION ────────────────────────────────────
    const probeT     = (this.currentT + 0.020) % 1.0;
    const probeSlice = this.track.getTrackSlice(probeT);
    const turnAngle  = currentSlice.tangent.angleTo(probeSlice.tangent);

    const lookaheadM  = turnAngle > 0.28 ? 8.0 : (turnAngle > 0.12 ? 13.0 : 19.0);
    const targetT     = (this.currentT + lookaheadM / this.trackLength) % 1.0;
    const targetSlice = this.track.getTrackSlice(targetT);

    let effectiveOffset = this.currentLaneOffset;
    const hasNearbyHazard = (this.hazardBypassTimer > 0) || this.track.hazardBlocks.some((b) => {
      const d = kartPos.distanceTo(b.position);
      return d < 38.0 && _botToBlock.subVectors(b.position, kartPos).dot(currentSlice.tangent) > -2.0;
    });

    // Only apply corner apex if there is NO hazard block nearby! Prevents dragging car into barriers on turns!
    if (!hasNearbyHazard && turnAngle > 0.22 && !isNearAnyJump) {
      const cross2 = currentSlice.tangent.x * targetSlice.tangent.z
                   - currentSlice.tangent.z * targetSlice.tangent.x;
      effectiveOffset = THREE.MathUtils.lerp(
        effectiveOffset, cross2 > 0 ? 1.2 : -1.2, 0.12
      );
    }

    const safeHalf  = Math.min(5.0, currentSlice.halfWidth - 1.6);
    effectiveOffset = THREE.MathUtils.clamp(effectiveOffset, -safeHalf, safeHalf);

    const destination = _botTargetDest.copy(targetSlice.position)
      .addScaledVector(targetSlice.binormal, effectiveOffset);

    // ── 7. STEERING (Pure Pursuit) ────────────────────────────────────
    const toDest = _botToDest.set(
      destination.x - kartPos.x, 0, destination.z - kartPos.z
    );
    const lenDest = toDest.length();
    if (lenDest < 0.01) {
      this.kart.applyInput(1.0, 0, false, dt, physics);
      return;
    }
    toDest.divideScalar(lenDest);

    const localFwd = forward.x * toDest.x + forward.z * toDest.z;
    const localRgt = right.x   * toDest.x + right.z   * toDest.z;
    const rawSteer = Math.atan2(localRgt, localFwd);
    let   steer    = THREE.MathUtils.clamp(rawSteer * 1.5, -1.0, 1.0);

    // ── 7b. 360° ANTI-GRAV TUBE WALL-RIDE (Bots roll onto ceiling around floor barrier) ──
    if (this.kart.isInAntiGravTube) {
      const barrierT = 174 / Track.SAMPLES;
      if (this.kart.splineT >= barrierT - 0.024 && this.kart.splineT <= barrierT + 0.008) {
        steer = this.baseLaneOffset >= 0 ? 0.90 : -0.90;
      }
    }

    // ── 8. EDGE SAFETY (Applied strictly on open road, not inside 360° tube) ──
    if (!this.kart.isInAntiGravTube) {
      const safeLat = Math.min(5.0, currentSlice.halfWidth - 2.0);
      if (Math.abs(currentLat) > safeLat) {
        const excess = Math.abs(currentLat) - safeLat;
        steer = -Math.sign(currentLat) * THREE.MathUtils.clamp(0.55 + excess * 0.25, 0.55, 1.0);
        this.currentLaneOffset = THREE.MathUtils.lerp(this.currentLaneOffset, 0, dt * 5.0);
        const vel2   = this.kart.rigidBody.linvel();
        const outV   = vel2.x * currentSlice.binormal.x + vel2.z * currentSlice.binormal.z;
        if (outV * currentLat > 0) {
          this.kart.rigidBody.setLinvel({
            x: vel2.x - currentSlice.binormal.x * outV * 0.65,
            y: vel2.y,
            z: vel2.z - currentSlice.binormal.z * outV * 0.65,
          }, true);
        }
      }
    }

    // ── 9. COMBAT ─────────────────────────────────────────────────────
    const isSafe = Math.abs(currentLat) < 4.0;
    if (this.retaliateTarget && isSafe && !isNearAnyJump) {
      const toRival = _botToRival.subVectors(this.retaliateTarget.group.position, kartPos);
      if (toRival.length() < 4.5) {
        steer = THREE.MathUtils.clamp(
          steer + toRival.dot(currentSlice.binormal) * 0.16, -1.0, 1.0
        );
      }
    } else if (this.randomNudgeCooldown <= 0 && isSafe && !isNearAnyJump && this.kart.currentSpeed > 18.0) {
      for (const rival of otherKarts) {
        if (rival === this.kart) continue;
        const toR = _botToRival.subVectors(rival.group.position, kartPos);
        if (toR.length() < 3.5 && Math.abs(toR.y) < 1.5) {
          steer = THREE.MathUtils.clamp(
            steer + Math.sign(toR.dot(currentSlice.binormal)) * 0.15, -1.0, 1.0
          );
          this.randomNudgeCooldown = 5.0 + Math.random() * 4.0;
          break;
        }
      }
    }

    // ── 10. THROTTLE & DRIFT ──────────────────────────────────────────
    let throttle = 1.0;
    let drift    = false;

    if (isNearAnyJump) {
      throttle = 1.0;
    } else {
      const safeSpd = turnAngle > 0.32 ? 22.0 : turnAngle > 0.18 ? 30.0 : 46.0;
      if (this.kart.currentSpeed > safeSpd + 4.0) {
        throttle = -0.25; drift = true;
      } else if (this.kart.currentSpeed > safeSpd || Math.abs(steer) > 0.42) {
        throttle = 0.62; drift = true;
      } else if (turnAngle < 0.07 && this.nitroCooldown <= 0 && isSafe) {
        this.kart.applyBoost(1.2, 1.3);
        this.nitroCooldown = 6.0 + Math.random() * 3.0;
      }
    }

    // Pass -steer to Kart.applyInput because Kart physics uses steerDirection = -1
    // (where negative steer turns right, and positive steer turns left).
    const kartSteer = -steer;

    this.kart.applyInput(throttle, kartSteer, drift, dt, physics);
  }

  private updateArenaAI(dt: number, physics: PhysicsEngine, otherKarts: Kart[]) {
    const trans = this.kart.rigidBody.translation();
    const rot = this.kart.rigidBody.rotation();
    const kartPos = _botKartPos.set(trans.x, trans.y, trans.z);
    const q = _botQ.set(rot.x, rot.y, rot.z, rot.w);
    const forward = _botForward.set(0, 0, 1).applyQuaternion(q);
    const right = _botRight.set(1, 0, 0).applyQuaternion(q);

    if (this.startupGrace > 0) this.startupGrace -= dt;
    this.nitroCooldown -= dt;

    const distFromCenter = Math.hypot(kartPos.x, kartPos.z);

    // Fetch dynamic difficulty tuning from BotKartSettings based on player level
    const playerLevel = economy.getLevel();
    const diff = getBotDifficulty(playerLevel);

    // 1. AIRBORNE
    if (!this.kart.isGrounded) {
      const toCenter = _botToCenter.set(-kartPos.x, 0, -kartPos.z).normalize();
      const cross = forward.x * toCenter.z - forward.z * toCenter.x;
      const airSteer = THREE.MathUtils.clamp(cross * 1.5, -0.4, 0.4);
      this.kart.applyInput(diff.maxThrottle, airSteer, false, dt, physics);
      return;
    }

    // 2. EDGE DANGER OVERRIDE (High priority)
    // If the kart is on the outer banked slope (> 76m) and moving outwards, force steer towards center (0,0,0)
    if (distFromCenter > 76.0) {
      const toCenter = _botToCenter.set(-kartPos.x, 0, -kartPos.z).normalize();
      const localFwd = forward.x * toCenter.x + forward.z * toCenter.z;
      const localRgt = right.x * toCenter.x + right.z * toCenter.z;
      const rawSteer = Math.atan2(localRgt, localFwd);
      const steer = THREE.MathUtils.clamp(rawSteer * 2.2, -1.0, 1.0);

      let throttle = diff.maxThrottle;
      if (localFwd < -0.2 && distFromCenter > 88.0) {
        throttle = -0.5;
      }
      this.kart.applyInput(throttle, -steer, false, dt, physics);
      return;
    }

    // 3. STUCK DETECTION (e.g. pinned against tree planter, kicker, or dais)
    let pinnedTree: any = null;
    if (this.track && this.track.boulders) {
      for (const tree of this.track.boulders) {
        const d = kartPos.distanceTo(tree.position);
        if (d < (tree.radius + 1.2) && Math.abs(this.kart.currentSpeed) < 3.2) {
          pinnedTree = tree;
          break;
        }
      }
    }

    if (pinnedTree && !this.isReversing) {
      // Immediate stuck escape when touching a tree planter
      this.isReversing = true;
      this.reverseTimer = 1.3;
      this.stuckTimer = 0;
      const fromTreeX = kartPos.x - pinnedTree.position.x;
      const fromTreeZ = kartPos.z - pinnedTree.position.z;
      const localRgt = right.x * fromTreeX + right.z * fromTreeZ;
      this.reverseSteer = localRgt >= 0 ? -0.7 : 0.7;
    } else if (!pinnedTree && this.startupGrace <= 0 && Math.abs(this.kart.currentSpeed) < 1.5) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.8) {
        this.isReversing = true;
        this.reverseTimer = 1.0;
        this.stuckTimer = 0;
        this.reverseSteer = 0.5;
      }
    } else if (!pinnedTree) {
      this.stuckTimer = 0;
    }

    if (this.isReversing) {
      this.reverseTimer -= dt;
      if (this.reverseTimer <= 0) this.isReversing = false;
      this.kart.applyInput(-0.85, this.reverseSteer, false, dt, physics);
      return;
    }

    // 4. COMBAT TARGETING: Anti-Swarm System (Solo FFA & TDM)
    // Count how many OTHER bots are currently hunting the human player
    let botsTargetingPlayer = 0;
    for (const [bId, tgtId] of BotKart.activeTargets) {
      if (bId !== this.kart.id) {
        const tgt = otherKarts.find(k => k.id === tgtId);
        if (tgt && (tgt.isPlayer || tgt.id === 'kart-player')) {
          botsTargetingPlayer++;
        }
      }
    }

    const isTdmMatch = !!this.kart.team;
    const maxAllowedOnPlayer = isTdmMatch
      ? (diff.maxBotsTargetingPlayerTDM ?? 3)
      : (diff.maxBotsTargetingPlayerFFA ?? 5);

    const isPlayerTargetBlocked = botsTargetingPlayer >= maxAllowedOnPlayer;

    let bestTarget: Kart | null = null;
    let bestDistSq = Infinity;
    let fallbackBotTarget: Kart | null = null;
    let fallbackDistSq = Infinity;

    for (const other of otherKarts) {
      if (other === this.kart) continue;
      // In TDM, ignore teammates
      if (this.kart.team && other.team && this.kart.team === other.team) continue;
      // Ignore fallen or ghost karts
      if (other.group.position.y < -3.0 || other.isGhost) continue;

      const dx = other.group.position.x - kartPos.x;
      const dz = other.group.position.z - kartPos.z;
      const dSq = dx * dx + dz * dz;

      const isHuman = other.isPlayer || other.id === 'kart-player';

      // Always track nearest AI bot rival as fallback
      if (!isHuman && dSq < fallbackDistSq) {
        fallbackDistSq = dSq;
        fallbackBotTarget = other;
      }

      // If this other kart is human player, but quota is full, skip human player!
      if (isHuman && isPlayerTargetBlocked) {
        continue;
      }

      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestTarget = other;
      }
    }

    // If quota blocked human and no other target found, use fallback AI bot
    if (!bestTarget && fallbackBotTarget) {
      bestTarget = fallbackBotTarget;
      bestDistSq = fallbackDistSq;
    }

    // Register active target for swarm coordination
    if (bestTarget) {
      BotKart.activeTargets.set(this.kart.id, bestTarget.id);
    } else {
      BotKart.activeTargets.delete(this.kart.id);
    }

    let targetDest = _botTargetDest;

    if (bestTarget) {
      // Intercept targeting: Only predict future movement if predictiveLeadFactor > 0 (Veterans)
      const targetLinvel = bestTarget.rigidBody ? bestTarget.rigidBody.linvel() : { x: 0, y: 0, z: 0 };
      const dist = Math.sqrt(bestDistSq);
      const leadTime = diff.predictiveLeadFactor > 0
        ? THREE.MathUtils.clamp(dist / 35.0, 0.1, diff.predictiveLeadFactor)
        : 0.0;
      targetDest.set(
        bestTarget.group.position.x + targetLinvel.x * leadTime,
        0,
        bestTarget.group.position.z + targetLinvel.z * leadTime
      );
    } else {
      targetDest.set(0, 0, 0);
    }

    // 4b. TREE OBSTACLE AVOIDANCE: Smoothly steer around tree planters & perimeter trees
    if (this.track && this.track.boulders) {
      for (const tree of this.track.boulders) {
        const toTreeX = tree.position.x - kartPos.x;
        const toTreeZ = tree.position.z - kartPos.z;
        const distToTree = Math.hypot(toTreeX, toTreeZ);

        // Only avoid if tree is within 10 meters ahead
        if (distToTree < (tree.radius + 6.0) && distToTree > 0.1) {
          const normX = toTreeX / distToTree;
          const normZ = toTreeZ / distToTree;
          const fwdDot = forward.x * normX + forward.z * normZ;
          if (fwdDot > 0.25) {
            // Tree is directly in front of the kart: deflect targetDest tangentially away from tree
            const rgtDot = right.x * normX + right.z * normZ;
            const deflectSign = rgtDot >= 0 ? -1 : 1;
            const pushDist = (tree.radius + 5.0 - distToTree) * 2.2;
            if (pushDist > 0) {
              targetDest.x += right.x * deflectSign * pushDist;
              targetDest.z += right.z * deflectSign * pushDist;
            }
          }
        }
      }
    }

    // 5. STEER TOWARDS TARGET / DESTINATION
    const toDest = _botToDest.set(targetDest.x - kartPos.x, 0, targetDest.z - kartPos.z);
    const lenDest = toDest.length();
    let steer = 0;
    if (lenDest > 0.5) {
      toDest.divideScalar(lenDest);
      const localFwd = forward.x * toDest.x + forward.z * toDest.z;
      const localRgt = right.x * toDest.x + right.z * toDest.z;
      const rawSteer = Math.atan2(localRgt, localFwd);
      steer = THREE.MathUtils.clamp(rawSteer * diff.steeringGain, -1.0, 1.0);
    }

    // 6. 100% FAIR DRIVING: Dynamic throttle, turn braking & drift based on player level
    let throttle = diff.maxThrottle;
    if (Math.abs(steer) > 0.55 && diff.sharpTurnBrakeRatio > 0) {
      throttle = Math.max(0.4, throttle - diff.sharpTurnBrakeRatio);
    }
    const drift = Math.abs(steer) > 0.65;

    this.kart.applyInput(throttle, -steer, drift, dt, physics);
  }
}


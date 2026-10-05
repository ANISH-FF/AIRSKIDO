import * as THREE from 'three';
import { Kart } from '../entities/Kart';
import { RumbleManager } from './RumbleManager';
import { SparkParticles } from './SparkParticles';
import { sounds } from '../core/Sound';
import { economy } from '../core/Economy';

// Static scratch vectors to eliminate GC heap churn in 60fps Rumble collisions
const _rcVA = new THREE.Vector3();
const _rcVB = new THREE.Vector3();
const _rcContact = new THREE.Vector3();
const _rcClashLaunchA = new THREE.Vector3();
const _rcClashLaunchB = new THREE.Vector3();
const _rcTargetLaunch = new THREE.Vector3();
const _rcRammerRecoil = new THREE.Vector3();
const _rcImpulseA = new THREE.Vector3();
const _rcImpulseB = new THREE.Vector3();
const _rcNormal = new THREE.Vector3();
const _rcFwdA = new THREE.Vector3();
const _rcFwdB = new THREE.Vector3();
const _rcRgtA = new THREE.Vector3();
const _rcRgtB = new THREE.Vector3();

// Pair-specific impact tracking: prevents a hit between bots B & C from blocking player's hit on B!
const _pairHitMap = new Map<string, number>();

export function clearRumbleCombatCooldowns() {
  _pairHitMap.clear();
}

function playCombatSounds(
  kartA: Kart,
  kartB: Kart,
  playerKart: Kart,
  posA: THREE.Vector3,
  posB: THREE.Vector3,
  baseVol: number
) {
  const isPlayerInvolved = kartA === playerKart || kartB === playerKart;
  let vol = baseVol;
  if (!isPlayerInvolved) {
    const distToPlayer = Math.min(posA.distanceTo(playerKart.group.position), posB.distanceTo(playerKart.group.position));
    vol = distToPlayer < 35.0 ? (1.0 - distToPlayer / 35.0) * baseVol * 0.75 : 0;
  }
  if (vol > 0.05) {
    sounds.playCrash(vol);
  }
}

/**
 * RumbleCombat — SmashKarts 100% Solid & Fair Combat Resolution Engine
 *
 * Dedicated to Sky Rumble Coliseum.
 * Rules:
 * 1. UNCONDITIONAL 60FPS Physical Separation & Velocity Deflection:
 *    Runs every frame when colliders overlap. Karts NEVER phase or drive through each other!
 * 2. Pair-Specific Combat Cooldown:
 *    Only gates combat rewards, air launches, and audio/screen shake per unique kart pair.
 * 3. TDM Friendly Fire: Teammates slide apart cleanly without combat penalty.
 * 4. Grounded Bumper Bump vs Skyward Smash:
 *    High-speed or active Nitro rams launch victims into the sky; low-speed collisions bounce on ground.
 */
export function resolveRumbleCombat(
  kartA: Kart,
  kartB: Kart,
  sparks: SparkParticles,
  playerKart: Kart,
  rumbleManager: RumbleManager,
  showAlert: (msg: string, type: 'boost' | 'lap' | 'nitro' | 'recoil' | 'respawn' | 'smash') => void,
  triggerImpactShake: (intensity: number) => void,
  onRemoteHit?: (targetKart: Kart, launchVel: THREE.Vector3, isAirborne: boolean) => void,
  getKartVel?: (kart: Kart) => THREE.Vector3,
  isRemoteKart?: (kart: Kart) => boolean
) {
  // 1. Abyss Check (Ignore karts that have fallen below the arena deck)
  if (kartA.group.position.y < -3.0 || kartB.group.position.y < -3.0) return;

  // 1b. Protection Shield ("Kawach") Transparent Pass-Through (Option B)
  // When either kart has active protection shield, neither can hit nor be hit!
  if (kartA.isGhost || kartB.isGhost) return;

  const posA = kartA.group.position;
  const posB = kartB.group.position;

  const dx = posB.x - posA.x;
  const dz = posB.z - posA.z;
  const dist = Math.hypot(dx, dz);

  const nx = dist > 0.0001 ? dx / dist : 0;
  const nz = dist > 0.0001 ? dz / dist : 1;
  const normal = _rcNormal.set(nx, 0, nz);

  // Kart forward and right vectors
  const fwdA = _rcFwdA.set(0, 0, 1).applyQuaternion(kartA.group.quaternion);
  fwdA.y = 0; if (fwdA.lengthSq() > 0.001) fwdA.normalize();
  const rgtA = _rcRgtA.set(1, 0, 0).applyQuaternion(kartA.group.quaternion);
  rgtA.y = 0; if (rgtA.lengthSq() > 0.001) rgtA.normalize();

  const fwdB = _rcFwdB.set(0, 0, 1).applyQuaternion(kartB.group.quaternion);
  fwdB.y = 0; if (fwdB.lengthSq() > 0.001) fwdB.normalize();
  const rgtB = _rcRgtB.set(1, 0, 0).applyQuaternion(kartB.group.quaternion);
  rgtB.y = 0; if (rgtB.lengthSq() > 0.001) rgtB.normalize();

  // Exact 3D oriented bounding extent along collision normal (nx, nz)
  // Half-dimensions: width = 0.85m, length = 1.35m
  const extentA = Math.abs(fwdA.x * nx + fwdA.z * nz) * 1.35 + Math.abs(rgtA.x * nx + rgtA.z * nz) * 0.85;
  const extentB = Math.abs(fwdB.x * nx + fwdB.z * nz) * 1.35 + Math.abs(rgtB.x * nx + rgtB.z * nz) * 0.85;
  const minDist = extentA + extentB + 0.06; // 6cm safety boundary to completely eliminate mesh clipping

  if (dist >= minDist) return;

  // 2. UNCONDITIONAL 60FPS PHYSICAL ANTI-CLIPPING SEPARATION
  // Runs every single frame without cooldown — guarantees karts NEVER phase through each other!
  const overlap = minDist - dist;
  const isARemote = isRemoteKart ? isRemoteKart(kartA) : false;
  const isBRemote = isRemoteKart ? isRemoteKart(kartB) : false;

  if (kartA === playerKart && isBRemote) {
    // Remote opponent B is locked to network interpolation; local player takes full separation
    kartA.group.position.x -= nx * overlap;
    kartA.group.position.z -= nz * overlap;
    const pA = kartA.group.position;
    kartA.rigidBody.setTranslation({ x: pA.x, y: pA.y, z: pA.z }, true);
  } else if (kartB === playerKart && isARemote) {
    // Remote opponent A is locked to network interpolation; local player takes full separation
    kartB.group.position.x += nx * overlap;
    kartB.group.position.z += nz * overlap;
    const pB = kartB.group.position;
    kartB.rigidBody.setTranslation({ x: pB.x, y: pB.y, z: pB.z }, true);
  } else {
    // Both are local (e.g. Player vs Bot, or Bot vs Bot)
    const halfOverlap = overlap * 0.5;
    kartA.group.position.x -= nx * halfOverlap;
    kartA.group.position.z -= nz * halfOverlap;
    kartB.group.position.x += nx * halfOverlap;
    kartB.group.position.z += nz * halfOverlap;
    const pA = kartA.group.position;
    const pB = kartB.group.position;
    kartA.rigidBody.setTranslation({ x: pA.x, y: pA.y, z: pA.z }, true);
    kartB.rigidBody.setTranslation({ x: pB.x, y: pB.y, z: pB.z }, true);
  }

  // 3. UNCONDITIONAL NORMAL VELOCITY DEFLECTION / ELASTIC BUMPER BOUNCE
  // Cancels relative penetration velocity so karts bounce off instead of tunneling on next frame
  const lvA = getKartVel ? getKartVel(kartA) : (kartA.rigidBody ? kartA.rigidBody.linvel() : { x: 0, y: 0, z: 0 });
  const lvB = getKartVel ? getKartVel(kartB) : (kartB.rigidBody ? kartB.rigidBody.linvel() : { x: 0, y: 0, z: 0 });

  const closingA = lvA.x * nx + lvA.z * nz;      // > 0 means A is driving into B
  const closingB = -(lvB.x * nx + lvB.z * nz);   // > 0 means B is driving into A
  const totalClosingSpeed = closingA + closingB;

  if (totalClosingSpeed > 0) {
    const restitution = 0.35;
    const bounceMag = totalClosingSpeed * (1 + restitution) * 0.5;
    if (!isARemote && kartA.rigidBody) {
      const curA = kartA.rigidBody.linvel();
      kartA.rigidBody.setLinvel({
        x: curA.x - nx * bounceMag,
        y: curA.y,
        z: curA.z - nz * bounceMag,
      }, true);
      kartA.currentSpeed = Math.max(-10, kartA.currentSpeed - bounceMag * 0.3);
    }
    if (!isBRemote && kartB.rigidBody) {
      const curB = kartB.rigidBody.linvel();
      kartB.rigidBody.setLinvel({
        x: curB.x + nx * bounceMag,
        y: curB.y,
        z: curB.z + nz * bounceMag,
      }, true);
      kartB.currentSpeed = Math.max(-10, kartB.currentSpeed - bounceMag * 0.3);
    }
  }

  // 4. TDM Teammate Protection (ZERO Friendly Fire Smash)
  if (kartA.team && kartB.team && kartA.team === kartB.team) {
    return;
  }

  // 5. Respawn Shield Invulnerability Check
  // Shielded karts (isGhost) take zero damage/air launch, but physical solid separation already ran above!
  if (kartA.isGhost || kartB.isGhost) {
    return;
  }

  // 6. PAIR-SPECIFIC Combat Impact Cooldown Check
  const now = performance.now();
  const hasBoost = kartA.boostTime > 0 || kartB.boostTime > 0;
  const cooldownMs = hasBoost ? 160 : 240;

  const pairKey = kartA.id < kartB.id ? `${kartA.id}_${kartB.id}` : `${kartB.id}_${kartA.id}`;
  const lastPairTime = _pairHitMap.get(pairKey) || 0;
  if (now - lastPairTime < cooldownMs) {
    return; // Physical separation already ran! Skip duplicate combat damage/sound for this frame
  }
  _pairHitMap.set(pairKey, now);
  kartA.lastImpactTime = now;
  kartB.lastImpactTime = now;

  // 7. Dynamic Combat Smash Scenarios
  // Alignment along collision normal (nx, nz)
  const headA = fwdA.x * nx + fwdA.z * nz;     // > 0 means A is facing B
  const headB = -(fwdB.x * nx + fwdB.z * nz);  // > 0 means B is facing A

  const boostA = kartA.boostTime > 0 ? 14.0 : 0;
  const boostB = kartB.boostTime > 0 ? 14.0 : 0;
  const momA = Math.max(0, closingA) + boostA;
  const momB = Math.max(0, closingB) + boostB;
  const impactSpeed = Math.max(0, closingA) + Math.max(0, closingB);

  const isPlayerInvolved = kartA === playerKart || kartB === playerKart;

  // ── SCENARIO 1: REAR-END COLLISION (Peeche se thokna) ──
  // A slams into B's rear: A driving nose-first into B, and B's rear is facing A
  if (headA > 0.35 && (closingA > 2.5 || kartA.boostTime > 0) && headB < -0.20) {
    const launchSpeed = 22.0 + Math.max(0, closingA) * 1.35 + boostA;
    const lift = Math.min(26.0, Math.max(14.0, 10.0 + Math.max(0, closingA) * 0.4));

    const targetLaunch = _rcTargetLaunch.set(nx * launchSpeed, lift, nz * launchSpeed);
    const recoilSpeed = 4.0 + Math.max(0, closingA) * 0.2;
    const recoilVel = _rcRammerRecoil.set(-nx * recoilSpeed, 0.5, -nz * recoilSpeed);

    kartB.applyNitroSmash(targetLaunch, false); // B gets launched forward & airborne!
    kartA.applyNitroSmash(recoilVel, true);      // A stays grounded
    if (onRemoteHit) {
      onRemoteHit(kartB, targetLaunch, true);
      onRemoteHit(kartA, recoilVel, false);
    }

    if (!isARemote && kartA.rigidBody) {
      const curLvA = kartA.rigidBody.linvel();
      kartA.rigidBody.setLinvel({ x: curLvA.x * 0.55, y: curLvA.y, z: curLvA.z * 0.55 }, true);
    }
    rumbleManager.recordHit(kartA, kartB);

    playCombatSounds(kartA, kartB, playerKart, posA, posB, 1.8);

    if (kartA === playerKart) {
      triggerImpactShake(1.5);
      economy.addCoins(25); economy.addXp(15); sounds.playCoin();
    } else if (kartB === playerKart) {
      triggerImpactShake(2.0);
    }
    return;
  }

  // B slams into A's rear: B driving nose-first into A, and A's rear is facing B
  if (headB > 0.35 && (closingB > 2.5 || kartB.boostTime > 0) && headA < -0.20) {
    const launchSpeed = 22.0 + Math.max(0, closingB) * 1.35 + boostB;
    const lift = Math.min(26.0, Math.max(14.0, 10.0 + Math.max(0, closingB) * 0.4));

    const targetLaunch = _rcTargetLaunch.set(-nx * launchSpeed, lift, -nz * launchSpeed);
    const recoilSpeed = 4.0 + Math.max(0, closingB) * 0.2;
    const recoilVel = _rcRammerRecoil.set(nx * recoilSpeed, 0.5, nz * recoilSpeed);

    kartA.applyNitroSmash(targetLaunch, false); // A gets launched forward & airborne!
    kartB.applyNitroSmash(recoilVel, true);      // B stays grounded
    if (onRemoteHit) {
      onRemoteHit(kartA, targetLaunch, true);
      onRemoteHit(kartB, recoilVel, false);
    }

    if (!isBRemote && kartB.rigidBody) {
      const curLvB = kartB.rigidBody.linvel();
      kartB.rigidBody.setLinvel({ x: curLvB.x * 0.55, y: curLvB.y, z: curLvB.z * 0.55 }, true);
    }
    rumbleManager.recordHit(kartB, kartA);

    playCombatSounds(kartA, kartB, playerKart, posA, posB, 1.8);

    if (kartB === playerKart) {
      triggerImpactShake(1.5);
      economy.addCoins(25); economy.addXp(15); sounds.playCoin();
    } else if (kartA === playerKart) {
      triggerImpactShake(2.0);
    }
    return;
  }

  // ── SCENARIO 2: T-BONE / BROADSIDE COLLISION (Side se thokna) ──
  // A rams B's side door
  if (headA > 0.35 && (closingA > 3.0 || kartA.boostTime > 0) && Math.abs(headB) <= 0.45) {
    const launchSpeed = 24.0 + Math.max(0, closingA) * 1.45 + boostA;
    const lift = Math.min(28.0, Math.max(15.0, 12.0 + Math.max(0, closingA) * 0.45));

    const targetLaunch = _rcTargetLaunch.set(nx * launchSpeed, lift, nz * launchSpeed);
    const recoilSpeed = 4.0 + Math.max(0, closingA) * 0.2;
    const recoilVel = _rcRammerRecoil.set(-nx * recoilSpeed, 0.5, -nz * recoilSpeed);

    kartB.applyNitroSmash(targetLaunch, false); // B gets launched sideways into the air!
    kartA.applyNitroSmash(recoilVel, true);      // A stays firmly on wheels
    if (onRemoteHit) {
      onRemoteHit(kartB, targetLaunch, true);
      onRemoteHit(kartA, recoilVel, false);
    }

    if (!isARemote && kartA.rigidBody) {
      const curLvA = kartA.rigidBody.linvel();
      kartA.rigidBody.setLinvel({ x: curLvA.x * 0.6, y: curLvA.y, z: curLvA.z * 0.6 }, true);
    }
    rumbleManager.recordHit(kartA, kartB);

    playCombatSounds(kartA, kartB, playerKart, posA, posB, 1.8);

    if (kartA === playerKart) {
      triggerImpactShake(1.6);
      economy.addCoins(25); economy.addXp(15); sounds.playCoin();
    } else if (kartB === playerKart) {
      triggerImpactShake(2.0);
    }
    return;
  }

  // B rams A's side door
  if (headB > 0.35 && (closingB > 3.0 || kartB.boostTime > 0) && Math.abs(headA) <= 0.45) {
    const launchSpeed = 24.0 + Math.max(0, closingB) * 1.45 + boostB;
    const lift = Math.min(28.0, Math.max(15.0, 12.0 + Math.max(0, closingB) * 0.45));

    const targetLaunch = _rcTargetLaunch.set(-nx * launchSpeed, lift, -nz * launchSpeed);
    const recoilSpeed = 4.0 + Math.max(0, closingB) * 0.2;
    const recoilVel = _rcRammerRecoil.set(nx * recoilSpeed, 0.5, nz * recoilSpeed);

    kartA.applyNitroSmash(targetLaunch, false); // A gets launched sideways into the air!
    kartB.applyNitroSmash(recoilVel, true);      // B stays firmly on wheels
    if (onRemoteHit) {
      onRemoteHit(kartA, targetLaunch, true);
      onRemoteHit(kartB, recoilVel, false);
    }

    if (!isBRemote && kartB.rigidBody) {
      const curLvB = kartB.rigidBody.linvel();
      kartB.rigidBody.setLinvel({ x: curLvB.x * 0.6, y: curLvB.y, z: curLvB.z * 0.6 }, true);
    }
    rumbleManager.recordHit(kartB, kartA);

    playCombatSounds(kartA, kartB, playerKart, posA, posB, 1.8);

    if (kartB === playerKart) {
      triggerImpactShake(1.6);
      economy.addCoins(25); economy.addXp(15); sounds.playCoin();
    } else if (kartA === playerKart) {
      triggerImpactShake(2.0);
    }
    return;
  }

  // ── SCENARIO 3: HEAD-ON COLLISION (Aamne-saamne nose-to-nose takkar) ──
  if (headA > 0.25 && headB > 0.25 && (closingA > 3.0 || closingB > 3.0 || hasBoost)) {
    const diff = momA - momB;

    if (Math.abs(diff) <= 5.5 && (closingA > 4.0 || boostA > 0) && (closingB > 4.0 || boostB > 0)) {
      // 3A. EQUAL HEAD-ON REBOUND (Both bounce back symmetrically!)
      const pushForce = 22.0 + impactSpeed * 0.75;
      const liftForce = Math.min(22.0, Math.max(12.0, 10.0 + impactSpeed * 0.3));

      const clashA = _rcClashLaunchA.set(-nx * pushForce, liftForce, -nz * pushForce);
      const clashB = _rcClashLaunchB.set(nx * pushForce, liftForce, nz * pushForce);

      kartA.applyNitroSmash(clashA, false);
      kartB.applyNitroSmash(clashB, false);
      if (onRemoteHit) {
        onRemoteHit(kartA, clashA, true);
        onRemoteHit(kartB, clashB, true);
      }

      rumbleManager.recordHit(kartA, kartB);
      rumbleManager.recordHit(kartB, kartA);

      playCombatSounds(kartA, kartB, playerKart, posA, posB, 2.0);

      if (isPlayerInvolved) {
        triggerImpactShake(2.0);
      }
      return;
    } else if (diff > 4.5 && (closingA > 3.5 || boostA > 0)) {
      // 3B. A OVERPOWERS B (A has Boost Pad or higher speed)
      const targetPush = 24.0 + diff * 1.35 + Math.max(0, closingA) * 0.5;
      const targetLift = Math.min(28.0, Math.max(14.0, 12.0 + diff * 0.35));

      const targetLaunch = _rcTargetLaunch.set(nx * targetPush, targetLift, nz * targetPush);
      const recoilSpeed = 5.0 + Math.max(0, closingB) * 0.25;
      const recoilVel = _rcRammerRecoil.set(-nx * recoilSpeed, 0.5, -nz * recoilSpeed);

      kartB.applyNitroSmash(targetLaunch, false);
      kartA.applyNitroSmash(recoilVel, true);
      if (onRemoteHit) {
        onRemoteHit(kartB, targetLaunch, true);
        onRemoteHit(kartA, recoilVel, false);
      }

      if (!isARemote && kartA.rigidBody) {
        const curLvA = kartA.rigidBody.linvel();
        kartA.rigidBody.setLinvel({ x: curLvA.x * 0.55, y: curLvA.y, z: curLvA.z * 0.55 }, true);
      }
      rumbleManager.recordHit(kartA, kartB);

      playCombatSounds(kartA, kartB, playerKart, posA, posB, 1.8);

      if (kartA === playerKart) {
        triggerImpactShake(1.6);
        economy.addCoins(25); economy.addXp(15); sounds.playCoin();
      } else if (kartB === playerKart) {
        triggerImpactShake(2.0);
      }
      return;
    } else if (diff < -4.5 && (closingB > 3.5 || boostB > 0)) {
      // 3C. B OVERPOWERS A
      const absDiff = -diff;
      const targetPush = 24.0 + absDiff * 1.35 + Math.max(0, closingB) * 0.5;
      const targetLift = Math.min(28.0, Math.max(14.0, 12.0 + absDiff * 0.35));

      const targetLaunch = _rcTargetLaunch.set(-nx * targetPush, targetLift, -nz * targetPush);
      const recoilSpeed = 5.0 + Math.max(0, closingA) * 0.25;
      const recoilVel = _rcRammerRecoil.set(nx * recoilSpeed, 0.5, nz * recoilSpeed);

      kartA.applyNitroSmash(targetLaunch, false);
      kartB.applyNitroSmash(recoilVel, true);
      if (onRemoteHit) {
        onRemoteHit(kartA, targetLaunch, true);
        onRemoteHit(kartB, recoilVel, false);
      }

      if (!isBRemote && kartB.rigidBody) {
        const curLvB = kartB.rigidBody.linvel();
        kartB.rigidBody.setLinvel({ x: curLvB.x * 0.55, y: curLvB.y, z: curLvB.z * 0.55 }, true);
      }
      rumbleManager.recordHit(kartB, kartA);

      playCombatSounds(kartA, kartB, playerKart, posA, posB, 1.8);

      if (kartB === playerKart) {
        triggerImpactShake(1.6);
        economy.addCoins(25); economy.addXp(15); sounds.playCoin();
      } else if (kartA === playerKart) {
        triggerImpactShake(2.0);
      }
      return;
    }
  }

  // ── SCENARIO 4: SOLID GROUNDED BUMPER BUMP (Low speed / glancing contact) ──
  const pushForce = Math.min(18.0, Math.max(6.0, impactSpeed * 0.8));
  const impulseA = _rcImpulseA.set(-nx * pushForce, 0, -nz * pushForce);
  const impulseB = _rcImpulseB.set(nx * pushForce, 0, nz * pushForce);

  kartA.applyBumperBump(impulseA, 0.85);
  kartB.applyBumperBump(impulseB, 0.85);
  if (onRemoteHit) {
    onRemoteHit(kartA, impulseA, false);
    onRemoteHit(kartB, impulseB, false);
  }

  if (closingA > closingB + 0.8) {
    rumbleManager.recordHit(kartA, kartB);
  } else if (closingB > closingA + 0.8) {
    rumbleManager.recordHit(kartB, kartA);
  } else {
    rumbleManager.recordHit(kartA, kartB);
    rumbleManager.recordHit(kartB, kartA);
  }

  playCombatSounds(kartA, kartB, playerKart, posA, posB, Math.min(1.0, Math.max(0.3, impactSpeed / 20.0)));

  if (isPlayerInvolved) {
    triggerImpactShake(0.6);
  }
}

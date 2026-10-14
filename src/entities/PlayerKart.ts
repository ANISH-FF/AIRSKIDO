import * as THREE from 'three';
import { Kart } from './Kart';
import { InputManager } from '../core/Input';
import { PhysicsEngine } from '../core/Physics';
import { sounds } from '../core/Sound';

export class PlayerKart {
  public kart: Kart;
  public input: InputManager;
  private cameraOffset = new THREE.Vector3(0, 2.65, -5.1);
  private cameraTargetOffset = new THREE.Vector3(0, 1.0, 2.2);

  private currentCamPos = new THREE.Vector3();
  private currentCamLookAt = new THREE.Vector3();
  private camYaw: number = 0;

  // Screen shake on collision impact
  private shakeIntensity: number = 0;

  // ── Camera scratch objects — allocated ONCE, reused every frame (zero GC) ──
  private readonly _camSpeedPullBack = new THREE.Vector3();
  private readonly _camOffsetWithSpeed = new THREE.Vector3();
  private readonly _camWorldUp = new THREE.Vector3(0, 1, 0);
  private readonly _camAxisY = new THREE.Vector3(0, 1, 0);   // constant (0,1,0) — never mutated
  private readonly _camSmoothHeading = new THREE.Quaternion();
  private readonly _camDesiredPos = new THREE.Vector3();
  private readonly _camDesiredLookAt = new THREE.Vector3();
  private readonly _camAirOffset = new THREE.Vector3(0, 3.0, -5.9);
  private readonly _camShakeRight = new THREE.Vector3();
  private readonly _camShakeUp = new THREE.Vector3();
  private readonly _camFwdSnap = new THREE.Vector3();

  constructor(kart: Kart, input: InputManager, initialCamPos?: THREE.Vector3) {
    this.kart = kart;
    this.kart.isPlayer = true;
    this.input = input;
    this.kart.setCastShadow(true); // Player kart exclusively casts shadows

    // Initialize camYaw strictly along horizontal XZ plane
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.group.quaternion);
    this.camYaw = Math.atan2(fwd.x, fwd.z);

    if (initialCamPos) {
      this.currentCamPos.copy(initialCamPos);
    } else {
      const heading = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
      this.currentCamPos.copy(kart.group.position).add(this.cameraOffset.clone().applyQuaternion(heading));
    }
    this.currentCamLookAt.copy(kart.group.position);
  }

  public isRumbleMode: boolean = false;

  public update(dt: number, physics: PhysicsEngine, camera: THREE.PerspectiveCamera) {
    this.input.update(dt);
    const { throttle, steer, drift, nitro } = this.input.state;

    // Tactical Nitro trigger (Consumes 1 of 3 canisters in racing modes; DISABLED in Sky Rumble Arena)
    if (nitro && !this.isRumbleMode && !(this.kart.track && this.kart.track.isArena)) {
      this.kart.useNitro();
    }

    // Apply player driving inputs
    this.kart.applyInput(throttle, steer, drift, dt, physics);

    // Dynamic Sound Engine pitch & tire drift screech
    const speedFraction = Math.min(1.0, Math.abs(this.kart.currentSpeed) / this.kart.stats.topSpeed);
    sounds.updateEnginePitch(speedFraction, throttle > 0);
    sounds.updateDrift(this.kart.isDrifting, this.kart.isDrifting ? Math.min(1.0, 0.35 + this.kart.driftTime * 1.2) : 0);

    // Dynamic Follow Camera with smooth horizontal heading
    this.updateCamera(dt, camera);
  }

  private lastFollowedKart: Kart | null = null;

  public updateCamera(dt: number, camera: THREE.PerspectiveCamera, targetKart?: Kart) {
    const kartToFollow = targetKart || this.kart;
    const kartPos = kartToFollow.group.position;
    const kartRot = kartToFollow.group.quaternion;

    // Instant snap behind new target when entering spectator mode or switching spectated racer!
    if (this.lastFollowedKart !== kartToFollow) {
      this.lastFollowedKart = kartToFollow;
      this._camFwdSnap.set(0, 0, 1).applyQuaternion(kartRot);
      this.camYaw = Math.atan2(this._camFwdSnap.x, this._camFwdSnap.z);
      this._camSmoothHeading.setFromAxisAngle(this._camAxisY, this.camYaw);
      this._camOffsetWithSpeed.copy(this.cameraOffset).applyQuaternion(this._camSmoothHeading);
      this.currentCamPos.copy(kartPos).add(this._camOffsetWithSpeed);
      this.currentCamLookAt.copy(kartPos);
      camera.position.copy(this.currentCamPos);
      camera.lookAt(this.currentCamLookAt);
    }

    const isAirborne = kartToFollow.airLaunchTimer > 0 || (kartPos.y < -4.0);
    const speedFraction = Math.min(1.0, Math.abs(kartToFollow.currentSpeed) / kartToFollow.stats.topSpeed);
    const isNitro = kartToFollow.boostTime > 0;

    // Tight console-arcade camera framing:
    // At normal speeds (even top speed), distance barely pulls back (~0.22m) so the kart stays close, chunky & detailed.
    // On active Nitro boost, delivers a punchy explosive pull-back (~0.5m) and dynamic FOV rush!
    const speedPullZ = -(speedFraction * 0.22 + (isNitro ? 0.48 : 0));
    const speedPullY = speedFraction * 0.08 + (isNitro ? 0.16 : 0);
    this._camSpeedPullBack.set(0, speedPullY, speedPullZ);
    this._camOffsetWithSpeed.copy(this.cameraOffset).add(this._camSpeedPullBack);

    // Ghost respawn: immediately align camera behind respawn orientation
    if (kartToFollow.isGhost && kartToFollow.ghostTimer > 2.7 && kartToFollow.rigidBody) {
      const rbRot = kartToFollow.rigidBody.rotation();
      const fwdX = 2 * rbRot.w * rbRot.y;
      const fwdZ = rbRot.w * rbRot.w - rbRot.y * rbRot.y;
      this.camYaw = Math.atan2(fwdX, fwdZ);
    }

    if (kartToFollow.isInAntiGravTube) {
      // 360° Anti-Gravity Wall-Ride: Camera smoothly rolls and pitches with the kart
      this._camWorldUp.set(0, 1, 0).applyQuaternion(kartRot);
      camera.up.lerp(this._camWorldUp, 1.0 - Math.exp(-14.0 * dt));

      this._camDesiredPos.copy(this._camOffsetWithSpeed).applyQuaternion(kartRot).add(kartPos);
      this._camDesiredLookAt.copy(this.cameraTargetOffset).applyQuaternion(kartRot).add(kartPos);

      // Keep camYaw continuously synced to avoid snap on exit
      this._camFwdSnap.set(0, 0, 1).applyQuaternion(kartRot);
      this.camYaw = Math.atan2(this._camFwdSnap.x, this._camFwdSnap.z);
    } else {
      // Normal track & arena: World UP stays up (zero disorienting roll)
      this._camWorldUp.set(0, 1, 0);
      camera.up.lerp(this._camWorldUp, 1.0 - Math.exp(-10.0 * dt));

      if (isAirborne) {
        // ── AIRBORNE STUNT MODE ──
        if (kartToFollow.rigidBody) {
          const linvel = kartToFollow.rigidBody.linvel();
          const horizSpeed = Math.hypot(linvel.x, linvel.z);
          if (horizSpeed > 8.0) {
            const flightYaw = Math.atan2(linvel.x, linvel.z);
            let diff = flightYaw - this.camYaw;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.camYaw += diff * (1.0 - Math.exp(-2.5 * dt));
          }
        }

        this._camSmoothHeading.setFromAxisAngle(this._camAxisY, this.camYaw);
        this._camAirOffset.set(0, 3.3, -6.5).applyQuaternion(this._camSmoothHeading);
        this._camDesiredPos.copy(kartPos).add(this._camAirOffset);
        this._camDesiredLookAt.set(kartPos.x, kartPos.y + 0.8, kartPos.z);
      } else {
        // ── GROUNDED DRIVING MODE ──
        if (kartToFollow === this.kart && kartToFollow.rigidBody) {
          const rbRot = kartToFollow.rigidBody.rotation();
          const fwdX = 2 * rbRot.w * rbRot.y;
          const fwdZ = rbRot.w * rbRot.w - rbRot.y * rbRot.y;
          const groundYaw = Math.atan2(fwdX, fwdZ);

          let diff = groundYaw - this.camYaw;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.camYaw += diff * (1.0 - Math.exp(-12.0 * dt));
        } else {
          this._camFwdSnap.set(0, 0, 1).applyQuaternion(kartRot);
          const groundYaw = Math.atan2(this._camFwdSnap.x, this._camFwdSnap.z);

          let diff = groundYaw - this.camYaw;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.camYaw += diff * (1.0 - Math.exp(-12.0 * dt));
        }

        this._camSmoothHeading.setFromAxisAngle(this._camAxisY, this.camYaw);
        this._camDesiredPos.copy(this._camOffsetWithSpeed).applyQuaternion(this._camSmoothHeading).add(kartPos);
        this._camDesiredLookAt.copy(this.cameraTargetOffset).applyQuaternion(this._camSmoothHeading).add(kartPos);
      }
    }

    // Exponential frame-rate independent camera smoothing (Eliminates 90Hz/120Hz jitter!)
    const followSpeed = isAirborne ? 11.0 : 16.0;
    const smoothFactor = 1.0 - Math.exp(-followSpeed * dt);
    this.currentCamPos.lerp(this._camDesiredPos, smoothFactor);
    this.currentCamLookAt.lerp(this._camDesiredLookAt, smoothFactor);

    // Screen Shake: punchy, crisp, fast-decaying shock (applied in camera view space)
    if (this.shakeIntensity > 0.005) {
      this.shakeIntensity = THREE.MathUtils.lerp(this.shakeIntensity, 0, dt * 14.0);
      this._camShakeRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      this._camShakeUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.copy(this.currentCamPos)
        .addScaledVector(this._camShakeRight, (Math.random() - 0.5) * 1.5 * this.shakeIntensity)
        .addScaledVector(this._camShakeUp, (Math.random() - 0.5) * 1.5 * this.shakeIntensity);
    } else {
      this.shakeIntensity = 0;
      camera.position.copy(this.currentCamPos);
    }

    camera.lookAt(this.currentCamLookAt);

    // Cinematic dynamic FOV:
    // Clean 63° base, subtle +1.8° speed sensation at top speed (zero car shrinking!), and punchy +4.5° rush on Nitro
    const baseFOV = 63;
    const targetFOV = baseFOV + (isAirborne ? 2.5 : speedFraction * 1.8) + (kartToFollow.boostTime > 0 ? 4.5 : 0);
    if (Math.abs(camera.fov - targetFOV) > 0.01) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, dt * 8);
      camera.updateProjectionMatrix();
    }
  }

  public triggerImpactShake(strength: number = 1.0) {
    this.shakeIntensity = Math.min(0.38, 0.18 * strength);
  }

  public getSpeedKmh(): number {
    return Math.max(0, Math.round(this.kart.currentSpeed * 3.6));
  }
}

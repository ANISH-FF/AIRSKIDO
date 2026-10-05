import * as THREE from 'three';
import { RemoteKartTransform } from './MultiplayerManager';

export const INTERPOLATION_DELAY_MS = 65.0; // 65ms buffer window (~2 packets at 30Hz)
export const MAX_EXTRAPOLATION_MS = 250.0;  // Up to 250ms forward projection during packet loss
export const ERROR_DECAY_RATE = 14.0;       // Exponential position correction speed (1/s)
export const SNAPSHOT_BUFFER_CAPACITY = 16; // Maximum snapshots to store in ring queue
export const TELEPORT_THRESHOLD_SQ = 144.0; // 12 meters squared -> snap instantly (respawns)

export interface TransformSnapshot {
  time: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  angvelY: number;
  speed: number;
  steer: number;
  drift: boolean;
  boost: boolean;
}

export class NetworkInterpolator {
  private buffer: TransformSnapshot[] = [];
  private clockOffset: number | null = null;
  private lastSenderTime: number | null = null;
  private errorOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  // Smooth exposed state properties
  public currentSpeed: number = 0;
  public currentSteer: number = 0;
  public isDrifting: boolean = false;
  public isBoosting: boolean = false;

  // Pre-allocated scratch objects to guarantee zero GC allocations per frame
  private static readonly _p0 = new THREE.Vector3();
  private static readonly _p1 = new THREE.Vector3();
  private static readonly _v0 = new THREE.Vector3();
  private static readonly _v1 = new THREE.Vector3();
  private static readonly _q0 = new THREE.Quaternion();
  private static readonly _q1 = new THREE.Quaternion();
  private static readonly _outPos = new THREE.Vector3();
  private static readonly _zero = new THREE.Vector3(0, 0, 0);
  private static readonly _extrapEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private static readonly _extrapQuat = new THREE.Quaternion();

  constructor() {}

  /**
   * Seed the interpolator with starting transform at spawn time
   */
  public init(pos: THREE.Vector3, rot: THREE.Quaternion) {
    this.buffer = [];
    this.clockOffset = null;
    this.lastSenderTime = null;
    this.errorOffset.set(0, 0, 0);
    this.currentSpeed = 0;
    this.currentSteer = 0;
    this.isDrifting = false;
    this.isBoosting = false;

    const now = performance.now();
    this.buffer.push({
      time: now,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      qx: rot.x,
      qy: rot.y,
      qz: rot.z,
      qw: rot.w,
      vx: 0,
      vy: 0,
      vz: 0,
      angvelY: 0,
      speed: 0,
      steer: 0,
      drift: false,
      boost: false,
    });
  }

  /**
   * Ingest a new transform packet received over WebRTC
   */
  public pushSnapshot(data: RemoteKartTransform) {
    const localNow = performance.now();
    const senderTime = data.time ?? localNow;

    // Filter true duplicates from sender clock
    if (this.lastSenderTime !== null && senderTime <= this.lastSenderTime) {
      return;
    }

    // Filter and align sender clock with local client clock
    const measuredOffset = localNow - senderTime;
    if (this.clockOffset === null) {
      this.clockOffset = measuredOffset;
    } else {
      // Smooth low-pass filter (removes jitter spikes while keeping clock aligned)
      this.clockOffset += (measuredOffset - this.clockOffset) * 0.05;
    }

    // Monotonic mapped arrival time based on actual sender interval
    const dtSender = this.lastSenderTime !== null ? Math.max(1, senderTime - this.lastSenderTime) : 33;
    this.lastSenderTime = senderTime;

    const lastTime = this.buffer.length > 0 ? this.buffer[this.buffer.length - 1].time : (localNow - 33);
    const mappedTime = Math.max(lastTime + Math.min(dtSender, 100), senderTime + this.clockOffset);

    // Allocate or reuse oldest snapshot from capacity buffer
    let snap: TransformSnapshot;
    if (this.buffer.length >= SNAPSHOT_BUFFER_CAPACITY) {
      snap = this.buffer.shift()!;
    } else {
      snap = {
        time: 0,
        x: 0, y: 0, z: 0,
        qx: 0, qy: 0, qz: 0, qw: 1,
        vx: 0, vy: 0, vz: 0,
        angvelY: 0,
        speed: 0,
        steer: 0,
        drift: false,
        boost: false,
      };
    }

    snap.time = mappedTime;
    snap.x = data.x;
    snap.y = data.y;
    snap.z = data.z;
    snap.qx = data.qx;
    snap.qy = data.qy;
    snap.qz = data.qz;
    snap.qw = data.qw;

    // Backwards-compatible finite-difference velocity if packet has no explicit linvel
    if (data.vx !== undefined && data.vy !== undefined && data.vz !== undefined) {
      snap.vx = data.vx;
      snap.vy = data.vy;
      snap.vz = data.vz;
    } else if (this.buffer.length > 0) {
      const prev = this.buffer[this.buffer.length - 1];
      const dtSec = Math.max(0.001, (mappedTime - prev.time) / 1000.0);
      snap.vx = (data.x - prev.x) / dtSec;
      snap.vy = (data.y - prev.y) / dtSec;
      snap.vz = (data.z - prev.z) / dtSec;
    } else {
      snap.vx = 0;
      snap.vy = 0;
      snap.vz = 0;
    }

    snap.angvelY = data.angvelY ?? 0;
    snap.speed = data.speed;
    snap.steer = data.steer;
    snap.drift = data.drift;
    snap.boost = data.boost;

    this.buffer.push(snap);
  }

  /**
   * Reset position error offset (e.g. after airborne tumble or respawn)
   */
  public resetError() {
    this.errorOffset.set(0, 0, 0);
  }

  /**
   * Primary 60/120 FPS update call. Computes smooth position and rotation.
   */
  public update(dt: number, outPosition: THREE.Vector3, outQuaternion: THREE.Quaternion) {
    if (this.buffer.length === 0) return;

    if (this.buffer.length === 1) {
      const s = this.buffer[0];
      outPosition.set(s.x, s.y, s.z);
      outQuaternion.set(s.qx, s.qy, s.qz, s.qw);
      this.currentSpeed = s.speed;
      this.currentSteer = s.steer;
      this.isDrifting = s.drift;
      this.isBoosting = s.boost;
      return;
    }

    const localNow = performance.now();
    const renderTime = localNow - INTERPOLATION_DELAY_MS;
    const newest = this.buffer[this.buffer.length - 1];

    // CASE 1: Render time is beyond our latest snapshot -> Projective Dead Reckoning
    if (renderTime >= newest.time) {
      const overdueSec = Math.min((renderTime - newest.time) / 1000.0, MAX_EXTRAPOLATION_MS / 1000.0);

      // Project position forward along last known velocity
      NetworkInterpolator._outPos.set(
        newest.x + newest.vx * overdueSec,
        newest.y + newest.vy * overdueSec,
        newest.z + newest.vz * overdueSec
      );

      // Project rotation forward along local yaw angular velocity
      if (Math.abs(newest.angvelY) > 0.005) {
        NetworkInterpolator._extrapEuler.set(0, newest.angvelY * overdueSec, 0);
        NetworkInterpolator._extrapQuat.setFromEuler(NetworkInterpolator._extrapEuler);
        NetworkInterpolator._q0.set(newest.qx, newest.qy, newest.qz, newest.qw);
        outQuaternion.copy(NetworkInterpolator._q0).multiply(NetworkInterpolator._extrapQuat);
      } else {
        outQuaternion.set(newest.qx, newest.qy, newest.qz, newest.qw);
      }

      this.currentSpeed = newest.speed;
      this.currentSteer = newest.steer;
      this.isDrifting = newest.drift;
      this.isBoosting = newest.boost;

      // Decay error offset
      this.errorOffset.lerp(NetworkInterpolator._zero, Math.min(1.0, dt * ERROR_DECAY_RATE));
      outPosition.copy(NetworkInterpolator._outPos).add(this.errorOffset);
      return;
    }

    // CASE 2: Render time is earlier than our oldest snapshot
    const oldest = this.buffer[0];
    if (renderTime <= oldest.time) {
      outPosition.set(oldest.x, oldest.y, oldest.z);
      outQuaternion.set(oldest.qx, oldest.qy, oldest.qz, oldest.qw);
      this.currentSpeed = oldest.speed;
      this.currentSteer = oldest.steer;
      this.isDrifting = oldest.drift;
      this.isBoosting = oldest.boost;
      return;
    }

    // CASE 3: Normal Snapshot Interpolation using Hermite Cubic Spline
    let idx0 = 0;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].time <= renderTime && renderTime <= this.buffer[i + 1].time) {
        idx0 = i;
        break;
      }
    }

    const s0 = this.buffer[idx0];
    const s1 = this.buffer[idx0 + 1];
    const timeDeltaMs = s1.time - s0.time;
    const alpha = timeDeltaMs > 0.0001 ? Math.max(0.0, Math.min(1.0, (renderTime - s0.time) / timeDeltaMs)) : 0.0;
    const dtSec = timeDeltaMs / 1000.0;

    NetworkInterpolator._p0.set(s0.x, s0.y, s0.z);
    NetworkInterpolator._p1.set(s1.x, s1.y, s1.z);

    // Detect large teleport / respawn
    if (NetworkInterpolator._p0.distanceToSquared(NetworkInterpolator._p1) > TELEPORT_THRESHOLD_SQ) {
      if (alpha < 0.5) {
        NetworkInterpolator._outPos.copy(NetworkInterpolator._p0);
        outQuaternion.set(s0.qx, s0.qy, s0.qz, s0.qw);
      } else {
        NetworkInterpolator._outPos.copy(NetworkInterpolator._p1);
        outQuaternion.set(s1.qx, s1.qy, s1.qz, s1.qw);
      }
      this.errorOffset.set(0, 0, 0);
    } else {
      // Hermite Cubic Spline evaluation: P(alpha) = h00*P0 + h10*(V0*dt) + h01*P1 + h11*(V1*dt)
      const a2 = alpha * alpha;
      const a3 = a2 * alpha;
      const h00 = 2.0 * a3 - 3.0 * a2 + 1.0;
      const h10 = a3 - 2.0 * a2 + alpha;
      const h01 = -2.0 * a3 + 3.0 * a2;
      const h11 = a3 - a2;

      NetworkInterpolator._v0.set(s0.vx, s0.vy, s0.vz).multiplyScalar(dtSec);
      NetworkInterpolator._v1.set(s1.vx, s1.vy, s1.vz).multiplyScalar(dtSec);

      NetworkInterpolator._outPos
        .set(0, 0, 0)
        .addScaledVector(NetworkInterpolator._p0, h00)
        .addScaledVector(NetworkInterpolator._v0, h10)
        .addScaledVector(NetworkInterpolator._p1, h01)
        .addScaledVector(NetworkInterpolator._v1, h11);

      // Spherical linear rotation interpolation
      NetworkInterpolator._q0.set(s0.qx, s0.qy, s0.qz, s0.qw);
      NetworkInterpolator._q1.set(s1.qx, s1.qy, s1.qz, s1.qw);
      outQuaternion.copy(NetworkInterpolator._q0).slerp(NetworkInterpolator._q1, alpha);
    }

    // Blend auxiliary driving states
    this.currentSpeed = THREE.MathUtils.lerp(s0.speed, s1.speed, alpha);
    this.currentSteer = THREE.MathUtils.lerp(s0.steer, s1.steer, alpha);
    this.isDrifting = s1.drift;
    this.isBoosting = s1.boost;

    // Decay position error smoothly
    this.errorOffset.lerp(NetworkInterpolator._zero, Math.min(1.0, dt * ERROR_DECAY_RATE));
    outPosition.copy(NetworkInterpolator._outPos).add(this.errorOffset);

    // Prune stale snapshots older than renderTime (keep idx0 as lower bound)
    if (idx0 > 1) {
      this.buffer.splice(0, idx0);
    }
  }
}

import * as THREE from 'three';
import { Track } from './Track';
import { sounds } from '../core/Sound';

export interface CheckpointGate {
  index: number;
  position: THREE.Vector3;
  forward: THREE.Vector3;
  binormal: THREE.Vector3;
  halfWidth: number;
  safeRespawnPos: THREE.Vector3;
  safeRespawnRot: THREE.Quaternion;
  t: number;
}

export interface RacerProgress {
  id: string;
  name: string;
  isPlayer: boolean;
  lap: number;
  currentCheckpoint: number;
  progressScore: number;
  lastSafePos: THREE.Vector3;
  lastSafeRot: THREE.Quaternion;
  prevPos: THREE.Vector3;
  isRespawning: boolean;
  respawnTimer: number;
  finishTime: number | null;
}

export class CheckpointSystem {
  public gates: CheckpointGate[] = [];
  public racers: Map<string, RacerProgress> = new Map();
  public totalLaps: number = 3;
  public onPlayerLapComplete?: (lap: number) => void;
  public onPlayerFall?: () => void;
  public onPlayerRespawn?: () => void;
  public onRacerFinish?: (racer: RacerProgress) => void;
  public onRaceFinish?: (standings: RacerProgress[]) => void;

  // Reusable scratch vectors for 60fps zero-allocation checks
  private _tempToKart = new THREE.Vector3();
  private _tempPrevToGate = new THREE.Vector3();

  constructor(track: Track) {
    this.createCheckpoints(track);
  }

  public setTotalLaps(laps: number) {
    this.totalLaps = Math.max(1, Math.min(10, laps));
  }

  private createCheckpoints(track: Track) {
    const numGates = 44;
    for (let i = 0; i < numGates; i++) {
      const t = i / numGates;
      const slice = track.getTrackSlice(t);

      // Ensure respawn orientation is 100% level and upright (zero pitch, zero roll)
      const forwardHorizontal = new THREE.Vector3(slice.tangent.x, 0, slice.tangent.z).normalize();
      const safeRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forwardHorizontal);

      let safePos = slice.position.clone().add(new THREE.Vector3(0, 1.2, 0));

      // ── SAFE RESPAWN ANCHORS FOR HAZARDS & STUNT JUMPS ──
      // Flat asphalt approach runways with level upright rotation (zero pitch, zero roll)
      if (!track.isHardcore) {
        if (i === 18 || i === 19) {
          // Sky Turbine Hazard (Slice 172) -> Safe staging runway at Slice 158 (~35m before turbine)
          safePos = new THREE.Vector3(-24.31, 10.2, 232.95);
          const fwdH = new THREE.Vector3(-0.835, 0, -0.549).normalize();
          safeRot.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdH);
        } else if (i === 36 || i === 37) {
          // Swinging Pendulum Hammer (Slice 335) -> Safe staging runway at Slice 322 (~25m before hammer)
          safePos = new THREE.Vector3(-56.28, 3.2, -178.25);
          const fwdH = new THREE.Vector3(0.573, 0, -0.818).normalize();
          safeRot.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdH);
        } else if (slice.position.x <= -55 && (slice.isGap || (slice.position.z < 115 && slice.position.z > -110))) {
          // Jump 1 & Camelback Slopes (West Straight, moving South)
          safePos = new THREE.Vector3(-75.0, 2.5, 105.0);
          safeRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // Facing South down the straight
        } else if (slice.position.x >= 50 && (slice.isGap || (slice.position.z > 20 && slice.position.z < 130))) {
          // Jump 2 (East Main Straight, moving North)
          safePos = new THREE.Vector3(65.0, 1.2, 15.0);
          safeRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0); // Facing North down Main Straight
        }
      } else {
        // In Hardcore mode, safely use the track slice 2 gates behind if inside a jump gap
        if (slice.isGap) {
          const safeT = (i - 2 + numGates) % numGates / numGates;
          const safeSlice = track.getTrackSlice(safeT);
          safePos = safeSlice.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          const fwdH = new THREE.Vector3(safeSlice.tangent.x, 0, safeSlice.tangent.z).normalize();
          safeRot.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdH);
        }
      }

      this.gates.push({
        index: i,
        position: slice.position.clone().add(new THREE.Vector3(0, 1.2, 0)),
        forward: slice.tangent.clone(),
        binormal: slice.binormal.clone(),
        halfWidth: slice.halfWidth,
        safeRespawnPos: safePos,
        safeRespawnRot: safeRot,
        t: t,
      });
    }
  }

  public registerRacer(id: string, name: string, isPlayer: boolean, startPos: THREE.Vector3, startRot: THREE.Quaternion) {
    // Level starting rotation
    const rotEuler = new THREE.Euler().setFromQuaternion(startRot, 'YXZ');
    const safeStartRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotEuler.y);

    this.racers.set(id, {
      id,
      name,
      isPlayer,
      lap: 1,
      currentCheckpoint: 0,
      progressScore: 100.0,
      lastSafePos: startPos.clone(),
      lastSafeRot: safeStartRot,
      prevPos: startPos.clone(),
      isRespawning: false,
      respawnTimer: 0,
      finishTime: null,
    });
  }

  public update(
    racerId: string,
    currentPos: THREE.Vector3,
    currentRot: THREE.Quaternion,
    dt: number,
    respawnCallback: (targetPos: THREE.Vector3, targetRot: THREE.Quaternion) => void,
    isGrounded: boolean = true,
    isAirLaunched: boolean = false
  ) {
    const racer = this.racers.get(racerId);
    if (!racer) return;

    // Handle active respawn delay
    if (racer.isRespawning) {
      racer.respawnTimer -= dt;
      if (racer.respawnTimer <= 0) {
        racer.isRespawning = false;
        // Teleport to guaranteed safe upright asphalt anchor
        respawnCallback(racer.lastSafePos, racer.lastSafeRot);
        racer.prevPos.copy(racer.lastSafePos);
        if (racer.isPlayer) {
          sounds.playRespawn();
          if (this.onPlayerRespawn) this.onPlayerRespawn();
        }
      }
      return;
    }

    // Check Fall off Sky Track into Void or below track elevation
    const currentGate = this.gates[racer.currentCheckpoint];
    const isBelowTrack = !isGrounded && currentGate && (currentGate.position.y - currentPos.y > (isAirLaunched ? 8.0 : 4.5));
    if (currentPos.y < -25 || isBelowTrack) {
      this.triggerFall(racer);
      return;
    }

    // ── ROBUST 4-GATE LOOKAHEAD & STRICT FINISH LINE PLANE CROSSING ────
    const numGates = this.gates.length;
    let bestCapturedIdx: number | null = null;
    let isCrossingFinish = false;

    // Strict local lookahead (1 to 4 gates ahead, preventing across-track teleportation)
    for (let offset = 1; offset <= 4; offset++) {
      const candidateIdx = (racer.currentCheckpoint + offset) % numGates;
      const gate = this.gates[candidateIdx];

      this._tempToKart.set(currentPos.x - gate.position.x, 0, currentPos.z - gate.position.z);
      const vertDist = Math.abs(currentPos.y - gate.position.y);
      const forwardDist = this._tempToKart.dot(gate.forward);
      const lateralDist = Math.abs(this._tempToKart.dot(gate.binormal));

      if (candidateIdx === 0) {
        // Racer MUST have completed at least 75% of gates to be eligible for finish line!
        if (racer.currentCheckpoint < Math.floor(numGates * 0.75)) {
          continue;
        }

        // Check continuous plane crossing from previous frame to current frame
        this._tempPrevToGate.set(racer.prevPos.x - gate.position.x, 0, racer.prevPos.z - gate.position.z);
        const prevForward = this._tempPrevToGate.dot(gate.forward);

        // Plane crossing condition: crossed from behind the line to on/past the line
        const planeCrossed = (prevForward <= 0.0 && forwardDist >= 0.0);
        // Proximity box catch: strictly on or past the finish arch (forwardDist >= 0.0, NEVER negative!)
        const inFinishBox = (forwardDist >= 0.0 && forwardDist <= 7.0);

        if ((planeCrossed || inFinishBox) && lateralDist <= gate.halfWidth + 4.5 && vertDist <= 4.0) {
          bestCapturedIdx = 0;
          isCrossingFinish = true;
          break;
        }
      } else {
        // Intermediate checkpoints: only capture if grounded on road OR in deliberate canyon jump gap!
        // CRITICAL FIX: If swatted by hammer, turbine, or tumbling through air (isAirLaunched), NEVER advance checkpoints!
        if (isAirLaunched) continue;

        // If not grounded, only allow checkpoint if close to road (vertDist <= 3.5m)
        if (!isGrounded && vertDist > 3.5) continue;

        // Intermediate checkpoints: road corridor bounds (strictly near road height, never below under pillars!)
        if (vertDist <= 3.5 && lateralDist <= gate.halfWidth + 6.0 && forwardDist >= -1.0 && forwardDist <= 28.0) {
          bestCapturedIdx = candidateIdx;
        }
      }
    }

    if (bestCapturedIdx !== null) {
      racer.currentCheckpoint = bestCapturedIdx;
      const targetGate = this.gates[bestCapturedIdx];

      // Update safe respawn anchor (strictly level and on solid asphalt)
      racer.lastSafePos.copy(targetGate.safeRespawnPos);
      racer.lastSafeRot.copy(targetGate.safeRespawnRot);

      // Check Lap increment: ONLY when legitimately crossing Finish Line Gate 0!
      if (isCrossingFinish) {
        racer.lap += 1;
        if (racer.isPlayer) {
          sounds.playRespawn();
          if (this.onPlayerLapComplete) this.onPlayerLapComplete(racer.lap);
        }

        // Check if finished total laps
        if (racer.lap > this.totalLaps && racer.finishTime === null) {
          racer.finishTime = performance.now();
          if (this.onRacerFinish) this.onRacerFinish(racer);
        }
      }
    }

    // Always update previous frame position for continuous plane crossing
    racer.prevPos.copy(currentPos);

    // Compute continuous progress score:
    // (lap - 1) * 10000 ensures higher completed laps ALWAYS rank above lower laps!
    const gateFraction = racer.currentCheckpoint / this.gates.length;
    racer.progressScore = (racer.lap - 1) * 10000.0 + gateFraction * 10000.0;
  }

  // Tracking remote racers' checkpoints and laps WITHOUT interfering with their positions
  public updateRemoteProgress(racerId: string, currentPos: THREE.Vector3) {
    const racer = this.racers.get(racerId);
    if (!racer) return;

    const numGates = this.gates.length;
    let bestCapturedIdx: number | null = null;
    let isCrossingFinish = false;

    for (let offset = 1; offset <= 4; offset++) {
      const candidateIdx = (racer.currentCheckpoint + offset) % numGates;
      const gate = this.gates[candidateIdx];
      const toKart = this._tempToKart.set(currentPos.x - gate.position.x, 0, currentPos.z - gate.position.z);
      const vertDist = Math.abs(currentPos.y - gate.position.y);
      const forwardDist = toKart.dot(gate.forward);
      const lateralDist = Math.abs(toKart.dot(gate.binormal));

      if (candidateIdx === 0) {
        if (racer.currentCheckpoint < Math.floor(numGates * 0.75)) continue;
        const prevToGate = this._tempPrevToGate.set(racer.prevPos.x - gate.position.x, 0, racer.prevPos.z - gate.position.z);
        const prevForward = prevToGate.dot(gate.forward);
        const planeCrossed = (prevForward <= 0.0 && forwardDist >= 0.0);
        const inFinishBox = (forwardDist >= 0.0 && forwardDist <= 7.0);

        if ((planeCrossed || inFinishBox) && lateralDist <= gate.halfWidth + 4.5 && vertDist <= 4.0) {
          bestCapturedIdx = 0;
          isCrossingFinish = true;
          break;
        }
      } else {
        if (vertDist <= 3.5 && lateralDist <= gate.halfWidth + 6.0 && forwardDist >= -1.0 && forwardDist <= 28.0) {
          bestCapturedIdx = candidateIdx;
        }
      }
    }

    if (bestCapturedIdx !== null) {
      racer.currentCheckpoint = bestCapturedIdx;
      if (isCrossingFinish) {
        racer.lap += 1;
        if (racer.lap > this.totalLaps && racer.finishTime === null) {
          racer.finishTime = performance.now();
          if (this.onRacerFinish) this.onRacerFinish(racer);
        }
      }
    }

    racer.prevPos.copy(currentPos);
    const gateFraction = racer.currentCheckpoint / this.gates.length;
    racer.progressScore = (racer.lap - 1) * 10000.0 + gateFraction * 10000.0;
  }

  public triggerFall(racer: RacerProgress) {
    if (racer.isRespawning) return;
    racer.isRespawning = true;
    racer.respawnTimer = 1.2; // 1.2 second penalty

    if (racer.isPlayer) {
      sounds.playFall();
      if (this.onPlayerFall) this.onPlayerFall();
    }
  }

  private _standingsList: RacerProgress[] = [];

  public getStandings(): RacerProgress[] {
    this._standingsList.length = 0;
    for (const r of this.racers.values()) {
      this._standingsList.push(r);
    }
    this._standingsList.sort((a, b) => {
      // If finished, rank by finish time
      if (a.finishTime !== null && b.finishTime !== null) {
        return a.finishTime - b.finishTime;
      }
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;

      // Otherwise rank by progress score
      return b.progressScore - a.progressScore;
    });
    return this._standingsList;
  }

  public getPlayerRank(): number {
    const standings = this.getStandings();
    const rank = standings.findIndex((r) => r.isPlayer);
    return rank !== -1 ? rank + 1 : 1;
  }
}

import * as THREE from 'three';
import { Kart } from '../entities/Kart';
import { sounds } from '../core/Sound';
import { RumbleArenaConfig } from './tracks/RumbleArenaConfig';

export type RumbleTeam = 'frost' | 'blaze' | 'none' | 'cyan' | 'crimson';

export interface RumbleRacer {
  id: string;
  name: string;
  team: RumbleTeam;
  isPlayer: boolean;
  kart: Kart;
  kills: number;
  deaths: number;
  lives: number;
  isEliminated: boolean;
  respawnTimer: number;
  lastHitBy?: { attackerId: string; attackerName: string; attackerTeam: RumbleTeam; time: number };
}

export interface KillfeedEntry {
  id: string;
  attackerName: string;
  attackerTeam: RumbleTeam;
  victimName: string;
  victimTeam: RumbleTeam;
  text: string;
  timeRemaining: number;
  isSelfAttacker?: boolean;
  isSelfVictim?: boolean;
}

export class RumbleManager {
  public isTDM: boolean = true;
  public winRule: string = 'kills_10';
  public targetKills: number = 10;
  public matchDurationSeconds: number = 180; // 3 min
  public matchTimer: number = 180;
  public isMatchOver: boolean = false;
  public winningTeam: RumbleTeam | 'draw' | null = null;
  public winnerName: string = '';

  public racers: Map<string, RumbleRacer> = new Map();
  public frostScore: number = 0;
  public blazeScore: number = 0;

  // Legacy score aliases for backward compatibility
  public get cyanScore(): number { return this.frostScore; }
  public set cyanScore(v: number) { this.frostScore = v; }
  public get crimsonScore(): number { return this.blazeScore; }
  public set crimsonScore(v: number) { this.blazeScore = v; }

  public killfeed: KillfeedEntry[] = [];

  public onScoreUpdate?: () => void;
  public onKillfeedEvent?: (entry: KillfeedEntry) => void;
  public onMatchFinish?: (winningTeam: RumbleTeam | 'draw', winnerName: string) => void;
  public onPlayerEliminated?: () => void;
  public onPlayerScoredKill?: (victimName: string, comboCount: number, comboTitle: string) => void;

  private playerComboKills: number = 0;
  private lastPlayerKillTime: number = 0;
  private arenaConfig: RumbleArenaConfig;

  constructor(arenaConfig: RumbleArenaConfig) {
    this.arenaConfig = arenaConfig;
  }

  public configureMatch(isTDM: boolean, winRule: string) {
    this.isTDM = isTDM;
    this.winRule = winRule;
    this.isMatchOver = false;
    this.winningTeam = null;
    this.winnerName = '';
    this.frostScore = 0;
    this.blazeScore = 0;
    this.killfeed = [];

    if (winRule === 'kills_10') this.targetKills = 10;
    else if (winRule === 'kills_20') this.targetKills = 20;
    else if (winRule === 'kills_30') this.targetKills = 30;
    else this.targetKills = 15;

    if (winRule === 'time_3min') {
      this.matchDurationSeconds = 180;
      this.matchTimer = 180;
    } else if (winRule === 'time_5min') {
      this.matchDurationSeconds = 300;
      this.matchTimer = 300;
    } else {
      this.matchDurationSeconds = 300;
      this.matchTimer = 300;
    }
  }

  public registerRacer(id: string, name: string, team: RumbleTeam, isPlayer: boolean, kart: Kart) {
    const startingLives = this.winRule === 'lives_3' ? 3 : 99;
    this.racers.set(id, {
      id,
      name,
      team,
      isPlayer,
      kart,
      kills: 0,
      deaths: 0,
      lives: startingLives,
      isEliminated: false,
      respawnTimer: 0,
    });
  }

  public isRacerKnockedOut(kartId: string): boolean {
    const racer = this.racers.get(kartId);
    return !!racer && (racer.respawnTimer > 0 || racer.isEliminated);
  }

  public getAliveRacers(): RumbleRacer[] {
    return Array.from(this.racers.values()).filter(r => !r.isEliminated);
  }

  /**
   * Record high-impact bumper ramming between two karts
   */
  public recordHit(attackerKart: Kart, victimKart: Kart) {
    const attacker = this.racers.get(attackerKart.id);
    const victim = this.racers.get(victimKart.id);
    if (!attacker || !victim) return;

    // Friendly fire in TDM does not credit attack
    if (this.isTDM && attacker.team === victim.team) return;

    victim.lastHitBy = {
      attackerId: attacker.id,
      attackerName: attacker.name,
      attackerTeam: attacker.team,
      time: performance.now(),
    };
  }

  public update(dt: number) {
    if (this.isMatchOver) return;

    // 1. Update Match Timer (if timed match)
    if (this.winRule.startsWith('time_')) {
      this.matchTimer -= dt;
      if (this.matchTimer <= 0) {
        this.matchTimer = 0;
        this.finishMatchByTime();
        return;
      }
    }

    // 2. Age out Killfeed entries
    for (let i = this.killfeed.length - 1; i >= 0; i--) {
      this.killfeed[i].timeRemaining -= dt;
      if (this.killfeed[i].timeRemaining <= 0) {
        this.killfeed.splice(i, 1);
      }
    }

    // 3. Monitor Karts for Abyss Fall / Knockout
    for (const racer of this.racers.values()) {
      if (racer.isEliminated) continue;

      if (racer.respawnTimer > 0) {
        racer.respawnTimer -= dt;
        if (racer.respawnTimer <= 0) {
          this.executeRespawn(racer);
        }
        continue;
      }

      const pos = racer.kart.group.position;
      const distFromCenter = Math.hypot(pos.x, pos.z);

      // Instant fallout: crossed 96.0m rim or dipped below arena deck into clouds
      if (pos.y < -0.5 || (distFromCenter > 96.0 && pos.y < 0.2) || distFromCenter > 97.2) {
        this.processKnockout(racer);
      }
    }
  }

  private processKnockout(victim: RumbleRacer) {
    victim.deaths++;
    victim.respawnTimer = 1.8; // 1.8s drop-in delay

    const pos = victim.kart.group.position;
    const curLv = victim.kart.rigidBody.linvel();
    const dist = Math.hypot(pos.x, pos.z);
    const uX = dist > 0.1 ? pos.x / dist : 0;
    const uZ = dist > 0.1 ? pos.z / dist : 1;

    // Preserve horizontal flight velocity, ensuring at least natural outward momentum into the open sky
    const outwardSpeed = curLv.x * uX + curLv.z * uZ;
    const launchOutward = Math.max(outwardSpeed, 12.0); // at least 12 m/s (~43 km/h) sailing outward into the clouds!
    const tanX = -uZ;
    const tanZ = uX;
    const tanSpeed = curLv.x * tanX + curLv.z * tanZ;

    victim.kart.rigidBody.setLinvel({
      x: uX * launchOutward + tanX * tanSpeed,
      y: -22.0, // exact same vertical fall velocity!
      z: uZ * launchOutward + tanZ * tanSpeed,
    }, true);

    victim.kart.airLaunchTimer = 1.8;
    victim.kart.isGrounded = false;
    victim.kart.tumbleAngularVel.set(
      (Math.random() - 0.5) * 8.0,
      (Math.random() - 0.5) * 6.0,
      (Math.random() - 0.5) * 8.0
    );

    const now = performance.now();
    let attacker: RumbleRacer | undefined;

    // Credit attacker if hit occurred in the last 5 seconds
    if (victim.lastHitBy && (now - victim.lastHitBy.time < 5000)) {
      attacker = this.racers.get(victim.lastHitBy.attackerId);
    }

    // Reset last hit
    victim.lastHitBy = undefined;

    if (attacker && attacker !== victim) {
      attacker.kills++;
      if (this.isTDM) {
        if (attacker.team === 'frost' || attacker.team === 'cyan') this.frostScore++;
        else if (attacker.team === 'blaze' || attacker.team === 'crimson') this.blazeScore++;
      }

      const isSelfAttacker = !!attacker.isPlayer;
      const isSelfVictim = !!victim.isPlayer;

      if (isSelfAttacker) {
        const timeSinceLast = now - this.lastPlayerKillTime;
        if (timeSinceLast < 4000) {
          this.playerComboKills++;
        } else {
          this.playerComboKills = 1;
        }
        this.lastPlayerKillTime = now;

        let comboTitle = `YOU SMASHED ${victim.name.toUpperCase()}!`;
        if (this.playerComboKills === 2) {
          comboTitle = 'DOUBLE SMASH!';
        } else if (this.playerComboKills === 3) {
          comboTitle = 'TRIPLE SMASH!';
        } else if (this.playerComboKills >= 4) {
          comboTitle = 'SKY DOMINATOR!';
        }

        if (this.onPlayerScoredKill) {
          this.onPlayerScoredKill(victim.name, this.playerComboKills, comboTitle);
        }
      }

      this.addNotification(
        attacker.name,
        attacker.team,
        victim.name,
        victim.team,
        `${attacker.name} smashed ${victim.name} into the clouds!`,
        isSelfAttacker,
        isSelfVictim
      );
    } else {
      // Ring-out / self-fall
      if (this.isTDM) {
        // Point goes to opposing team
        if (victim.team === 'frost' || victim.team === 'cyan') this.blazeScore++;
        else if (victim.team === 'blaze' || victim.team === 'crimson') this.frostScore++;
      }
      this.addNotification(
        '',
        'none',
        victim.name,
        victim.team,
        `${victim.name} fell into the clouds!`,
        false,
        !!victim.isPlayer
      );
    }

    if (this.winRule === 'lives_3') {
      victim.lives--;
      if (victim.lives <= 0) {
        victim.isEliminated = true;
        if (victim.isPlayer && this.onPlayerEliminated) {
          this.onPlayerEliminated();
        }
        this.checkLastKartStanding();
        return;
      }
    }

    // Sound effect
    sounds.playRespawn();

    // Check target kills win condition
    if (this.isTDM && this.winRule.startsWith('kills_')) {
      if (this.frostScore >= this.targetKills) {
        this.finishMatch('frost', 'TEAM FROST');
      } else if (this.blazeScore >= this.targetKills) {
        this.finishMatch('blaze', 'TEAM BLAZE');
      }
    }

    if (this.onScoreUpdate) this.onScoreUpdate();
  }

  private executeRespawn(racer: RumbleRacer) {
    if (racer.isEliminated) return;

    let spawnPos: THREE.Vector3;
    let spawnRot: THREE.Quaternion;

    if (this.isTDM) {
      const slot = Math.floor(Math.random() * 4);
      const teamKey = (racer.team === 'frost' || racer.team === 'cyan') ? 'frost' : 'blaze';
      const sp = this.arenaConfig.getSpawn(teamKey, slot);
      spawnPos = sp.pos.clone();
      spawnRot = sp.rot.clone();
    } else {
      const slot = Math.floor(Math.random() * 8);
      const sp = this.arenaConfig.getSoloSpawn(slot, 8);
      spawnPos = sp.pos.clone();
      spawnRot = sp.rot.clone();
    }

    // Drop down softly onto the arena deck with invulnerability shield
    spawnPos.y = 2.0;
    racer.kart.resetTo(spawnPos, spawnRot);
    racer.kart.setGhost(true, 2.5);
  }

  private checkLastKartStanding() {
    const aliveRacers = Array.from(this.racers.values()).filter(r => !r.isEliminated);
    if (this.isTDM) {
      const aliveFrost = aliveRacers.filter(r => r.team === 'frost' || r.team === 'cyan');
      const aliveBlaze = aliveRacers.filter(r => r.team === 'blaze' || r.team === 'crimson');

      if (aliveFrost.length === 0 && aliveBlaze.length === 0) {
        this.finishMatch('draw', 'DRAW / TIE');
      } else if (aliveFrost.length === 0) {
        this.finishMatch('blaze', 'TEAM BLAZE');
      } else if (aliveBlaze.length === 0) {
        this.finishMatch('frost', 'TEAM FROST');
      }
    } else {
      if (aliveRacers.length <= 1) {
        const winner = aliveRacers[0];
        let champName = winner ? winner.name : '';
        if (!champName) {
          let topRacer: RumbleRacer | null = null;
          for (const r of this.racers.values()) {
            if (!topRacer || r.kills > topRacer.kills) topRacer = r;
          }
          champName = topRacer ? topRacer.name : 'CHAMPION';
        }
        this.finishMatch('none', champName);
      }
    }
  }

  private finishMatchByTime() {
    if (this.isTDM) {
      if (this.frostScore > this.blazeScore) {
        this.finishMatch('frost', 'TEAM FROST');
      } else if (this.blazeScore > this.frostScore) {
        this.finishMatch('blaze', 'TEAM BLAZE');
      } else {
        this.finishMatch('draw', 'DRAW / TIE');
      }
    } else {
      // Find racer with most kills
      let topRacer: RumbleRacer | null = null;
      for (const r of this.racers.values()) {
        if (!topRacer || r.kills > topRacer.kills) {
          topRacer = r;
        }
      }
      this.finishMatch('none', topRacer ? topRacer.name : 'CHAMPION');
    }
  }

  private finishMatch(winningTeam: RumbleTeam | 'draw', winnerName: string) {
    this.isMatchOver = true;
    this.winningTeam = winningTeam;
    this.winnerName = winnerName;

    if (this.onMatchFinish) {
      this.onMatchFinish(winningTeam, winnerName);
    }
  }

  private addNotification(
    attackerName: string,
    attackerTeam: RumbleTeam,
    victimName: string,
    victimTeam: RumbleTeam,
    text: string,
    isSelfAttacker: boolean = false,
    isSelfVictim: boolean = false
  ) {
    const entry: KillfeedEntry = {
      id: Math.random().toString(),
      attackerName,
      attackerTeam,
      victimName,
      victimTeam,
      text,
      timeRemaining: 4.5,
      isSelfAttacker,
      isSelfVictim,
    };
    this.killfeed.unshift(entry);
    if (this.killfeed.length > 5) this.killfeed.pop();

    if (this.onKillfeedEvent) this.onKillfeedEvent(entry);
  }
}

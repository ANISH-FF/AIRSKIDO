/**
 * Leaderboard.ts — Production-Grade Global Time Sprint Leaderboard
 * 
 * Supports:
 * 1. Dual-Track Mode: NORMAL (Classic Sky Track) and HARDCORE (Cyber Canyon Track).
 * 2. Real-time Firebase Firestore synchronization per track mode.
 * 3. Offline-first zero-latency local caching via localStorage.
 * 4. Realistic benchmark records for each track to provide immediate goals.
 * 5. Trackmania-style millisecond precision formatting (00:36.42s).
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './FirebaseConfig';
import { nameSystem } from './NameSystem';
import { RecordManager } from './RecordManager';

export type LeaderboardTrack = 'classic' | 'hardcore';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  timeSeconds: number;
  formattedTime: string;
  timestamp: number;
  isCurrentPlayer?: boolean;
}

export interface LeaderboardSubmitResult {
  isNewPB: boolean;
  rank: number;
  previousBest: number | null;
  timeSeconds: number;
  formattedTime: string;
  delta: number;
}

const STORAGE_KEYS: Record<LeaderboardTrack, { board: string; myBest: string; firestore: string }> = {
  classic: {
    board: 'airskid_time_sprint_leaderboard_v1',
    myBest: 'airskid_my_sprint_best_v1',
    firestore: 'leaderboards_time_sprint',
  },
  hardcore: {
    board: 'airskid_hardcore_sprint_leaderboard_v1',
    myBest: 'airskid_my_hardcore_sprint_best_v1',
    firestore: 'leaderboards_sprint_hardcore',
  },
};

// Realistic benchmark records for Classic Normal Track (34s - 40s)
const BENCHMARK_CLASSIC: Omit<LeaderboardEntry, 'rank'>[] = [
  { playerId: 'AS-990142', username: 'ViperX', timeSeconds: 34.82, formattedTime: '00:34.82s', timestamp: 1727780000000 },
  { playerId: 'AS-841029', username: 'CyberDrifter', timeSeconds: 35.64, formattedTime: '00:35.64s', timestamp: 1727781000000 },
  { playerId: 'AS-719382', username: 'NeonBolt', timeSeconds: 36.15, formattedTime: '00:36.15s', timestamp: 1727782000000 },
  { playerId: 'AS-630291', username: 'AeroGhost', timeSeconds: 36.91, formattedTime: '00:36.91s', timestamp: 1727783000000 },
  { playerId: 'AS-559102', username: 'SpeedDemon99', timeSeconds: 37.48, formattedTime: '00:37.48s', timestamp: 1727784000000 },
  { playerId: 'AS-489201', username: 'SkyMaster', timeSeconds: 38.22, formattedTime: '00:38.22s', timestamp: 1727785000000 },
  { playerId: 'AS-391820', username: 'TurboRacer', timeSeconds: 39.05, formattedTime: '00:39.05s', timestamp: 1727786000000 },
  { playerId: 'AS-281920', username: 'ShadowApex', timeSeconds: 40.18, formattedTime: '00:40.18s', timestamp: 1727787000000 },
];

// Realistic benchmark records for Hardcore Cyber Canyon Track (47s - 58s)
const BENCHMARK_HARDCORE: Omit<LeaderboardEntry, 'rank'>[] = [
  { playerId: 'AS-910221', username: 'VoidReaper', timeSeconds: 47.92, formattedTime: '00:47.92s', timestamp: 1727780000000 },
  { playerId: 'AS-829103', username: 'CanyonKing', timeSeconds: 49.34, formattedTime: '00:49.34s', timestamp: 1727781000000 },
  { playerId: 'AS-740192', username: 'ApexPredator', timeSeconds: 50.81, formattedTime: '00:50.81s', timestamp: 1727782000000 },
  { playerId: 'AS-659201', username: 'HazardMaster', timeSeconds: 51.95, formattedTime: '00:51.95s', timestamp: 1727783000000 },
  { playerId: 'AS-541092', username: 'GravityBuster', timeSeconds: 53.40, formattedTime: '00:53.40s', timestamp: 1727784000000 },
  { playerId: 'AS-439201', username: 'CyberValkyrie', timeSeconds: 54.88, formattedTime: '00:54.88s', timestamp: 1727785000000 },
  { playerId: 'AS-321094', username: 'HyperGlide', timeSeconds: 56.12, formattedTime: '00:56.12s', timestamp: 1727786000000 },
  { playerId: 'AS-219401', username: 'SonicDrift', timeSeconds: 58.05, formattedTime: '00:58.05s', timestamp: 1727787000000 },
];

export class LeaderboardManager {
  private activeTrack: LeaderboardTrack = 'classic';
  private entries: Record<LeaderboardTrack, LeaderboardEntry[]> = {
    classic: [],
    hardcore: [],
  };
  private myBestTime: Record<LeaderboardTrack, number | null> = {
    classic: null,
    hardcore: null,
  };
  private listeners: Array<(entries: LeaderboardEntry[], track: LeaderboardTrack) => void> = [];
  private isFetching: Record<LeaderboardTrack, boolean> = {
    classic: false,
    hardcore: false,
  };

  constructor() {
    this.loadLocalCache('classic');
    this.loadLocalCache('hardcore');
    this.fetchRemoteLeaderboard('classic');
    this.fetchRemoteLeaderboard('hardcore');
  }

  public getActiveTrack(): LeaderboardTrack {
    return this.activeTrack;
  }

  public setActiveTrack(track: LeaderboardTrack) {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    this.notifyListeners(track);
  }

  // ── 1. LOCAL CACHE INITIALIZATION ───────────────────────────────────
  private loadLocalCache(track: LeaderboardTrack) {
    const keys = STORAGE_KEYS[track];
    const benchmarks = track === 'classic' ? BENCHMARK_CLASSIC : BENCHMARK_HARDCORE;

    try {
      const savedBest = localStorage.getItem(keys.myBest);
      if (savedBest) {
        const parsedBest = parseFloat(savedBest);
        if (!isNaN(parsedBest) && parsedBest > 0) {
          this.myBestTime[track] = parsedBest;
        }
      }

      const cached = localStorage.getItem(keys.board);
      if (cached) {
        const parsed = JSON.parse(cached) as LeaderboardEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.entries[track] = parsed;
          this.recalculateRanks(track);
          return;
        }
      }
    } catch {
      // fallback to benchmarks
    }

    // Initialize with benchmark entries
    this.entries[track] = benchmarks.map((b, idx) => ({
      ...b,
      rank: idx + 1,
    }));

    if (this.myBestTime[track] !== null) {
      this.injectPlayerEntry(track, this.myBestTime[track]!);
    }
  }

  private saveLocalCache(track: LeaderboardTrack) {
    const keys = STORAGE_KEYS[track];
    try {
      localStorage.setItem(keys.board, JSON.stringify(this.entries[track].slice(0, 100)));
      if (this.myBestTime[track] !== null) {
        localStorage.setItem(keys.myBest, this.myBestTime[track]!.toString());
      }
    } catch {
      // ignore
    }
  }

  // ── 2. FIRESTORE REMOTE PIPELINE ────────────────────────────────────
  public async fetchRemoteLeaderboard(track: LeaderboardTrack = this.activeTrack) {
    if (!db || !isFirebaseConfigured() || this.isFetching[track]) return;

    try {
      this.isFetching[track] = true;
      const keys = STORAGE_KEYS[track];
      const benchmarks = track === 'classic' ? BENCHMARK_CLASSIC : BENCHMARK_HARDCORE;

      const q = query(
        collection(db, keys.firestore),
        orderBy('timeSeconds', 'asc'),
        limit(100)
      );

      const snap = await getDocs(q);
      if (!snap.empty) {
        const remoteList: LeaderboardEntry[] = [];
        let r = 1;
        const myId = nameSystem.playerId;

        snap.forEach((docSnap) => {
          const d = docSnap.data();
          if (typeof d.timeSeconds === 'number' && d.timeSeconds > 0) {
            const isMe = d.playerId === myId;
            if (isMe) {
              this.myBestTime[track] = d.timeSeconds;
            }
            remoteList.push({
              rank: r++,
              playerId: d.playerId || 'AS-000000',
              username: d.username || 'Racer',
              timeSeconds: d.timeSeconds,
              formattedTime: d.formattedTime || RecordManager.formatTime(d.timeSeconds) + 's',
              timestamp: d.timestamp || Date.now(),
              isCurrentPlayer: isMe,
            });
          }
        });

        // Merge benchmarks if remote list has fewer than benchmarks length
        if (remoteList.length < benchmarks.length) {
          benchmarks.forEach((b) => {
            if (!remoteList.some((e) => e.username.toLowerCase() === b.username.toLowerCase())) {
              remoteList.push({ ...b, rank: 0 });
            }
          });
          remoteList.sort((a, b) => a.timeSeconds - b.timeSeconds);
          remoteList.forEach((e, idx) => { e.rank = idx + 1; });
        }

        this.entries[track] = remoteList;
        this.saveLocalCache(track);
        this.notifyListeners(track);
      }
    } catch (err) {
      console.warn(`[LeaderboardManager] Remote fetch warning for ${track}:`, err);
    } finally {
      this.isFetching[track] = false;
    }
  }

  // ── 3. SUBMIT SPRINT RECORD ─────────────────────────────────────────
  public async submitSprintRecord(
    trackOrTime: LeaderboardTrack | number,
    timeOrDummy?: number | string
  ): Promise<LeaderboardSubmitResult> {
    let track: LeaderboardTrack = 'classic';
    let timeSeconds: number = 0;

    if (typeof trackOrTime === 'string') {
      track = trackOrTime;
      timeSeconds = typeof timeOrDummy === 'number' ? timeOrDummy : 0;
    } else {
      track = this.activeTrack;
      timeSeconds = trackOrTime;
    }

    const prevPB = this.myBestTime[track];
    const isNewPB = prevPB === null || timeSeconds < prevPB;
    const previousBest = prevPB;
    const delta = previousBest !== null ? timeSeconds - previousBest : 0;

    if (isNewPB) {
      this.myBestTime[track] = timeSeconds;
      this.injectPlayerEntry(track, timeSeconds);
      this.saveLocalCache(track);
      this.notifyListeners(track);

      // Submit to Firebase Firestore if online
      if (db && isFirebaseConfigured()) {
        try {
          const keys = STORAGE_KEYS[track];
          const myProfile = nameSystem.getProfile();
          const docRef = doc(db, keys.firestore, myProfile.playerId);
          await setDoc(docRef, {
            playerId: myProfile.playerId,
            username: myProfile.username,
            timeSeconds: timeSeconds,
            formattedTime: RecordManager.formatTime(timeSeconds) + 's',
            track: track,
            timestamp: Date.now(),
          });
          console.log(`[LeaderboardManager] ${track.toUpperCase()} sprint record uploaded to Firestore!`);
        } catch (err) {
          console.warn(`[LeaderboardManager] Failed to upload ${track} record to Firestore:`, err);
        }
      }
    }

    const rank = this.getPlayerRank(track);
    return {
      isNewPB,
      rank,
      previousBest,
      timeSeconds,
      formattedTime: RecordManager.formatTime(timeSeconds) + 's',
      delta,
    };
  }

  private injectPlayerEntry(track: LeaderboardTrack, timeSeconds: number) {
    const myProfile = nameSystem.getProfile();
    const myId = myProfile.playerId;

    // Remove old entry for this player in this track
    this.entries[track] = this.entries[track].filter((e) => e.playerId !== myId);

    // Push new entry
    this.entries[track].push({
      rank: 0,
      playerId: myId,
      username: myProfile.username,
      timeSeconds: timeSeconds,
      formattedTime: RecordManager.formatTime(timeSeconds) + 's',
      timestamp: Date.now(),
      isCurrentPlayer: true,
    });

    this.recalculateRanks(track);
  }

  private recalculateRanks(track: LeaderboardTrack) {
    this.entries[track].sort((a, b) => a.timeSeconds - b.timeSeconds);
    const myId = nameSystem.playerId;
    this.entries[track].forEach((e, idx) => {
      e.rank = idx + 1;
      e.isCurrentPlayer = e.playerId === myId;
    });
  }

  // ── 4. GETTERS & LISTENERS ──────────────────────────────────────────
  public getTopEntries(count: number = 3, track: LeaderboardTrack = this.activeTrack): LeaderboardEntry[] {
    return this.entries[track].slice(0, count);
  }

  public getAllTop100(track: LeaderboardTrack = this.activeTrack): LeaderboardEntry[] {
    return this.entries[track].slice(0, 100);
  }

  public getEntries(track: LeaderboardTrack = this.activeTrack): LeaderboardEntry[] {
    return this.getAllTop100(track);
  }

  public getPlayerRank(track: LeaderboardTrack = this.activeTrack): number {
    const myId = nameSystem.playerId;
    const found = this.entries[track].find((e) => e.playerId === myId);
    return found ? found.rank : (this.myBestTime[track] ? this.entries[track].length + 1 : 999);
  }

  public getPlayerBest(track: LeaderboardTrack = this.activeTrack): { timeSeconds: number | null; formattedTime: string; rank: number } {
    const rank = this.getPlayerRank(track);
    const best = this.myBestTime[track];
    const formattedTime = best !== null ? RecordManager.formatTime(best) + 's' : '--:--.--';
    return {
      timeSeconds: best,
      formattedTime,
      rank: rank <= 100 ? rank : (best ? rank : 0),
    };
  }

  public addListener(cb: (entries: LeaderboardEntry[], track: LeaderboardTrack) => void) {
    this.listeners.push(cb);
    cb(this.entries[this.activeTrack], this.activeTrack);
  }

  public removeListener(cb: (entries: LeaderboardEntry[], track: LeaderboardTrack) => void) {
    this.listeners = this.listeners.filter((fn) => fn !== cb);
  }

  private notifyListeners(track: LeaderboardTrack = this.activeTrack) {
    const data = [...this.entries[track]];
    this.listeners.forEach((cb) => {
      try {
        cb(data, track);
      } catch (e) {
        console.error('Leaderboard listener error:', e);
      }
    });
  }
}

export const leaderboard = new LeaderboardManager();

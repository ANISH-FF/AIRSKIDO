/**
 * Leaderboard.ts — Scalable Single-Doc Snapshot Global Time Sprint Leaderboard
 * 
 * Scalability Architecture ($0 Spark Free Tier):
 * 1. Aggregated Single-Doc Snapshot: Stores the entire Top 100 array in a single Firestore
 *    document per track (leaderboard_snapshots/classic_top100 & hardcore_top100).
 *    Each lobby view consumes exactly 1 document read instead of 100 reads.
 *    50,000 daily free reads = 50,000 leaderboard views / day (100x improvement!).
 * 2. Client-Side Cooldown Cache: 3-minute cooldown via localStorage and memory.
 *    Repeated tab switching or modal opens trigger 0 network reads while cache is fresh.
 * 3. Anti-Cheat Physics Floor: Discards any impossible lap time below theoretical track limit (< 8.0s).
 * 4. Dual-Storage Writes:
 *    - Permanent personal PB saved in users_pbs/{track}_{playerId}.
 *    - Top 100 snapshot updated only if player's PB qualifies for Top 100 rank.
 * 5. Offline-first fallback to realistic benchmarks.
 */

import {
  collection,
  doc,
  getDoc,
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

const SNAPSHOT_COLLECTION = 'leaderboard_snapshots';
const USERS_PBS_COLLECTION = 'users_pbs';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cooldown cache
const MIN_PHYSICS_LAP_TIME = 8.0; // Theoretical minimum lap time in seconds

const STORAGE_KEYS: Record<
  LeaderboardTrack,
  {
    board: string;
    myBest: string;
    cacheTime: string;
    snapshotDoc: string;
    legacyFirestore: string;
  }
> = {
  classic: {
    board: 'airskido_time_sprint_leaderboard_v1',
    myBest: 'airskido_my_sprint_best_v1',
    cacheTime: 'airskido_lb_cache_time_classic_v1',
    snapshotDoc: 'classic_top100',
    legacyFirestore: 'leaderboards_time_sprint',
  },
  hardcore: {
    board: 'airskido_hardcore_sprint_leaderboard_v1',
    myBest: 'airskido_my_hardcore_sprint_best_v1',
    cacheTime: 'airskido_lb_cache_time_hardcore_v1',
    snapshotDoc: 'hardcore_top100',
    legacyFirestore: 'leaderboards_sprint_hardcore',
  },
};

/// Realistic benchmark records for Classic Normal Track (34s - 40s)
const BENCHMARK_CLASSIC: Omit<LeaderboardEntry, 'rank'>[] = [
  { playerId: '99014218', username: 'ViperX', timeSeconds: 34.82, formattedTime: '00:34.82s', timestamp: 1727780000000 },
  { playerId: '84102935', username: 'CyberDrifter', timeSeconds: 35.64, formattedTime: '00:35.64s', timestamp: 1727781000000 },
  { playerId: '71938241', username: 'NeonBolt', timeSeconds: 36.15, formattedTime: '00:36.15s', timestamp: 1727782000000 },
  { playerId: '63029112', username: 'AeroGhost', timeSeconds: 36.91, formattedTime: '00:36.91s', timestamp: 1727783000000 },
  { playerId: '55910287', username: 'SpeedDemon99', timeSeconds: 37.48, formattedTime: '00:37.48s', timestamp: 1727784000000 },
  { playerId: '48920190', username: 'SkyMaster', timeSeconds: 38.22, formattedTime: '00:38.22s', timestamp: 1727785000000 },
  { playerId: '39182064', username: 'TurboRacer', timeSeconds: 39.05, formattedTime: '00:39.05s', timestamp: 1727786000000 },
  { playerId: '28192053', username: 'ShadowApex', timeSeconds: 40.18, formattedTime: '00:40.18s', timestamp: 1727787000000 },
];

// Realistic benchmark records for Hardcore Cyber Canyon Track (47s - 58s)
const BENCHMARK_HARDCORE: Omit<LeaderboardEntry, 'rank'>[] = [
  { playerId: '91022144', username: 'VoidReaper', timeSeconds: 47.92, formattedTime: '00:47.92s', timestamp: 1727780000000 },
  { playerId: '82910382', username: 'CanyonKing', timeSeconds: 49.34, formattedTime: '00:49.34s', timestamp: 1727781000000 },
  { playerId: '74019255', username: 'ApexPredator', timeSeconds: 50.81, formattedTime: '00:50.81s', timestamp: 1727782000000 },
  { playerId: '65920117', username: 'HazardMaster', timeSeconds: 51.95, formattedTime: '00:51.95s', timestamp: 1727783000000 },
  { playerId: '54109230', username: 'GravityBuster', timeSeconds: 53.40, formattedTime: '00:53.40s', timestamp: 1727784000000 },
  { playerId: '43920196', username: 'CyberValkyrie', timeSeconds: 54.88, formattedTime: '00:54.88s', timestamp: 1727785000000 },
  { playerId: '32109471', username: 'HyperGlide', timeSeconds: 56.12, formattedTime: '00:56.12s', timestamp: 1727786000000 },
  { playerId: '21940128', username: 'SonicDrift', timeSeconds: 58.05, formattedTime: '00:58.05s', timestamp: 1727787000000 },
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
  private lastFetchedAt: Record<LeaderboardTrack, number> = {
    classic: 0,
    hardcore: 0,
  };
  private isFetching: Record<LeaderboardTrack, boolean> = {
    classic: false,
    hardcore: false,
  };
  private listeners: Array<(entries: LeaderboardEntry[], track: LeaderboardTrack) => void> = [];

  constructor() {
    this.loadLocalCache('classic');
    this.loadLocalCache('hardcore');
    // Non-blocking initial sync (respects 3-minute cooldown)
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
      const legacyBestKey = keys.myBest.replace('airskido_', 'airskid_');
      const legacyBoardKey = keys.board.replace('airskido_', 'airskid_');
      const legacyCacheKey = keys.cacheTime.replace('airskido_', 'airskid_');

      const savedBest = localStorage.getItem(keys.myBest) || localStorage.getItem(legacyBestKey);
      if (savedBest) {
        const parsedBest = parseFloat(savedBest);
        if (!isNaN(parsedBest) && parsedBest >= MIN_PHYSICS_LAP_TIME) {
          this.myBestTime[track] = parsedBest;
        } else if (!isNaN(parsedBest) && parsedBest < MIN_PHYSICS_LAP_TIME) {
          try {
            localStorage.removeItem(keys.myBest);
            localStorage.removeItem(legacyBestKey);
          } catch {}
          this.myBestTime[track] = null;
        }
      }

      const savedCacheTime = localStorage.getItem(keys.cacheTime) || localStorage.getItem(legacyCacheKey);
      if (savedCacheTime) {
        const parsedTime = parseInt(savedCacheTime, 10);
        if (!isNaN(parsedTime) && parsedTime > 0) {
          this.lastFetchedAt[track] = parsedTime;
        }
      }

      const cached = localStorage.getItem(keys.board) || localStorage.getItem(legacyBoardKey);
      if (cached) {
        let parsed = JSON.parse(cached) as LeaderboardEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed = parsed
            .filter((e) => typeof e.timeSeconds === 'number' && e.timeSeconds >= MIN_PHYSICS_LAP_TIME)
            .map((e) => ({
              ...e,
              playerId: String(e.playerId || '').replace(/^AS-?/i, ''),
            }));
          if (parsed.length > 0) {
            this.entries[track] = parsed;
            this.recalculateRanks(track);
            return;
          }
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

    if (this.myBestTime[track] !== null && this.myBestTime[track]! >= MIN_PHYSICS_LAP_TIME) {
      this.injectPlayerEntry(track, this.myBestTime[track]!);
    }
  }

  private saveLocalCache(track: LeaderboardTrack) {
    const keys = STORAGE_KEYS[track];
    try {
      localStorage.setItem(keys.board, JSON.stringify(this.entries[track].slice(0, 100)));
      localStorage.setItem(keys.cacheTime, this.lastFetchedAt[track].toString());
      if (this.myBestTime[track] !== null) {
        localStorage.setItem(keys.myBest, this.myBestTime[track]!.toString());
      }
    } catch {
      // ignore quota / private mode storage errors
    }
  }

  // ── 2. SINGLE-DOC SNAPSHOT FIRESTORE PIPELINE ───────────────────────
  /**
   * Fetches the Top 100 snapshot for the track.
   * Consumes only 1 Firestore Read per fetch!
   * @param track Target track mode
   * @param force Bypass the 3-minute cooldown cache
   */
  public async fetchRemoteLeaderboard(
    track: LeaderboardTrack = this.activeTrack,
    force: boolean = false
  ) {
    if (!db || !isFirebaseConfigured() || this.isFetching[track]) return;

    // ⏱️ 3-Minute Cooldown Check: 0 Firestore Reads while cache is fresh
    const now = Date.now();
    if (!force && now - this.lastFetchedAt[track] < CACHE_TTL_MS && this.entries[track].length > 0) {
      return;
    }

    try {
      this.isFetching[track] = true;
      const keys = STORAGE_KEYS[track];
      const benchmarks = track === 'classic' ? BENCHMARK_CLASSIC : BENCHMARK_HARDCORE;
      const myId = nameSystem.playerId;

      // 🎯 SINGLE DOCUMENT READ (1 Read consumed)
      const snapshotDocRef = doc(db, SNAPSHOT_COLLECTION, keys.snapshotDoc);
      const snap = await getDoc(snapshotDocRef);

      let list: Array<{
        playerId: string;
        username: string;
        timeSeconds: number;
        formattedTime?: string;
        timestamp?: number;
      }> = [];

      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.entries)) {
          list = data.entries;
        }
      } else {
        // 🚀 First-time Bootstrap: If snapshot doc doesn't exist yet in Firestore,
        // read legacy collection or benchmarks, then write the initial snapshot doc.
        try {
          const legacyQuery = query(
            collection(db, keys.legacyFirestore),
            orderBy('timeSeconds', 'asc'),
            limit(100)
          );
          const legacySnap = await getDocs(legacyQuery);
          if (!legacySnap.empty) {
            legacySnap.forEach((dSnap) => {
              const d = dSnap.data();
              if (typeof d.timeSeconds === 'number' && d.timeSeconds >= MIN_PHYSICS_LAP_TIME) {
                list.push({
                  playerId: d.playerId || '10000000',
                  username: d.username || 'Racer',
                  timeSeconds: d.timeSeconds,
                  formattedTime: d.formattedTime || RecordManager.formatTime(d.timeSeconds) + 's',
                  timestamp: d.timestamp || Date.now(),
                });
              }
            });
          }
        } catch {
          // legacy query failed, fallback to benchmarks
        }

        if (list.length === 0) {
          list = benchmarks.map((b) => ({
            playerId: b.playerId,
            username: b.username,
            timeSeconds: b.timeSeconds,
            formattedTime: b.formattedTime,
            timestamp: b.timestamp,
          }));
        }

        // Initialize snapshot document in Firestore
        try {
          await setDoc(snapshotDocRef, {
            entries: list.slice(0, 100),
            updatedAt: Date.now(),
            track: track,
          });
        } catch (bootstrapErr) {
          console.warn(`[LeaderboardManager] Snapshot bootstrap setDoc warning for ${track}:`, bootstrapErr);
        }
      }

      // Convert data to LeaderboardEntry array
      const remoteList: LeaderboardEntry[] = [];
      let r = 1;

      const myProfile = nameSystem.getProfile();
      const myCleanId = String(myProfile.playerId || '').replace(/^AS-?/i, '');
      const myLowerName = (myProfile.username || '').toLowerCase();

      list.forEach((d) => {
        if (typeof d.timeSeconds === 'number' && d.timeSeconds >= MIN_PHYSICS_LAP_TIME) {
          const cleanPlayerId = String(d.playerId || '10000000').replace(/^AS-?/i, '');
          const entryLowerName = (d.username || '').toLowerCase();
          const isMe = cleanPlayerId === myCleanId || (myLowerName.length > 0 && entryLowerName === myLowerName);
          if (isMe) {
            if (this.myBestTime[track] === null || d.timeSeconds < this.myBestTime[track]!) {
              this.myBestTime[track] = d.timeSeconds;
            }
          }
          remoteList.push({
            rank: 0,
            playerId: cleanPlayerId,
            username: d.username || 'Racer',
            timeSeconds: d.timeSeconds,
            formattedTime: d.formattedTime || RecordManager.formatTime(d.timeSeconds) + 's',
            timestamp: d.timestamp || Date.now(),
            isCurrentPlayer: isMe,
          });
        }
      });

      remoteList.sort((a, b) => a.timeSeconds - b.timeSeconds);
      remoteList.forEach((e, idx) => {
        e.rank = idx + 1;
      });

      // Merge benchmarks if remote list has fewer than benchmarks length
      if (remoteList.length < benchmarks.length) {
        benchmarks.forEach((b) => {
          if (!remoteList.some((e) => e.username.toLowerCase() === b.username.toLowerCase())) {
            remoteList.push({ ...b, rank: 0 });
          }
        });
        remoteList.sort((a, b) => a.timeSeconds - b.timeSeconds);
        remoteList.forEach((e, idx) => {
          e.rank = idx + 1;
        });
      }

      // Inject local player PB if faster
      if (this.myBestTime[track] !== null && this.myBestTime[track]! >= MIN_PHYSICS_LAP_TIME) {
        const myPB = this.myBestTime[track]!;
        const existingMe = remoteList.find((e) => e.playerId === myCleanId || (myLowerName.length > 0 && e.username.toLowerCase() === myLowerName));
        if (!existingMe || myPB < existingMe.timeSeconds) {
          const filtered = remoteList.filter((e) => e.playerId !== myCleanId && (myLowerName.length === 0 || e.username.toLowerCase() !== myLowerName));
          filtered.push({
            rank: 0,
            playerId: myCleanId,
            username: myProfile.username,
            timeSeconds: myPB,
            formattedTime: RecordManager.formatTime(myPB) + 's',
            timestamp: Date.now(),
            isCurrentPlayer: true,
          });
          filtered.sort((a, b) => a.timeSeconds - b.timeSeconds);
          filtered.forEach((e, idx) => {
            e.rank = idx + 1;
          });
          this.entries[track] = filtered.slice(0, 100);
        } else {
          this.entries[track] = remoteList.slice(0, 100);
        }
      } else {
        this.entries[track] = remoteList.slice(0, 100);
      }

      this.lastFetchedAt[track] = Date.now();
      this.saveLocalCache(track);
      this.notifyListeners(track);
      console.log(`[LeaderboardManager] 1-Doc Snapshot synced for ${track.toUpperCase()} (1 Firestore Read)`);
    } catch (err) {
      console.warn(`[LeaderboardManager] Remote fetch warning for ${track}:`, err);
    } finally {
      this.isFetching[track] = false;
    }
  }

  // ── 3. SUBMIT SPRINT RECORD WITH ANTI-CHEAT & SNAPSHOT UPDATE ──────
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

    // 🛡️ ANTI-CHEAT: Reject impossible lap times below theoretical physics limit (< 8.0s)
    if (
      !timeSeconds ||
      isNaN(timeSeconds) ||
      !isFinite(timeSeconds) ||
      timeSeconds < MIN_PHYSICS_LAP_TIME
    ) {
      console.warn(
        `[LeaderboardManager] Rejected impossible lap time: ${timeSeconds}s (< ${MIN_PHYSICS_LAP_TIME}s theoretical limit).`
      );
      const rank = this.getPlayerRank(track);
      return {
        isNewPB: false,
        rank,
        previousBest: this.myBestTime[track],
        timeSeconds: timeSeconds || 0,
        formattedTime: RecordManager.formatTime(timeSeconds || 0) + 's',
        delta: 0,
      };
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
          const cleanPlayerId = String(myProfile.playerId || '').replace(/^AS-?/i, '');
          const formatted = RecordManager.formatTime(timeSeconds) + 's';

          // 1. Write personal best document (permanent archive in users_pbs)
          const myDocRef = doc(db, USERS_PBS_COLLECTION, `${track}_${cleanPlayerId}`);
          await setDoc(myDocRef, {
            playerId: cleanPlayerId,
            username: myProfile.username,
            timeSeconds: timeSeconds,
            formattedTime: formatted,
            track: track,
            timestamp: Date.now(),
          });

          // Also write legacy document for backward compatibility
          const legacyDocRef = doc(db, keys.legacyFirestore, cleanPlayerId);
          setDoc(legacyDocRef, {
            playerId: cleanPlayerId,
            username: myProfile.username,
            timeSeconds: timeSeconds,
            formattedTime: formatted,
            track: track,
            timestamp: Date.now(),
          }).catch(() => {});

          // 2. Check if player qualifies for Top 100 Single-Doc Snapshot
          const currentList = this.entries[track];
          const qualifiesForTop100 =
            currentList.length < 100 ||
            timeSeconds < currentList[currentList.length - 1].timeSeconds;

          if (qualifiesForTop100) {
            // Prepare clean payload for the snapshot document
            const cleanEntries = currentList.slice(0, 100).map((e) => ({
              playerId: String(e.playerId || '').replace(/^AS-?/i, ''),
              username: e.username,
              timeSeconds: e.timeSeconds,
              formattedTime: e.formattedTime,
              timestamp: e.timestamp,
            }));

            const snapshotDocRef = doc(db, SNAPSHOT_COLLECTION, keys.snapshotDoc);
            await setDoc(snapshotDocRef, {
              entries: cleanEntries,
              updatedAt: Date.now(),
              track: track,
            });

            this.lastFetchedAt[track] = Date.now();
            console.log(`[LeaderboardManager] Top 100 Snapshot updated for ${track.toUpperCase()}!`);
          }
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
    const myId = String(myProfile.playerId || '').replace(/^AS-?/i, '');
    const myLower = (myProfile.username || '').toLowerCase();

    // Remove old entry for this player in this track by both playerId and username
    this.entries[track] = this.entries[track].filter(
      (e) => e.playerId !== myId && (myLower.length === 0 || e.username.toLowerCase() !== myLower)
    );

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
    const myProfile = nameSystem.getProfile();
    const myId = String(myProfile.playerId || '').replace(/^AS-?/i, '');
    const myLower = (myProfile.username || '').toLowerCase();
    this.entries[track].forEach((e, idx) => {
      e.rank = idx + 1;
      e.playerId = String(e.playerId || '').replace(/^AS-?/i, '');
      e.isCurrentPlayer = e.playerId === myId || (myLower.length > 0 && e.username.toLowerCase() === myLower);
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
    const myProfile = nameSystem.getProfile();
    const myId = String(myProfile.playerId || '').replace(/^AS-?/i, '');
    const myLower = (myProfile.username || '').toLowerCase();
    const found = this.entries[track].find((e) => e.playerId === myId || (myLower.length > 0 && e.username.toLowerCase() === myLower));
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

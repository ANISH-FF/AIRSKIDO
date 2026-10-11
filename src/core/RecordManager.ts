export interface TrackRecord {
  bestRaceTime: number | null; // in seconds
  bestLapTime: number | null;  // in seconds
  recordedAt: number | null;   // timestamp
}

export interface RecordsState {
  classic: TrackRecord;
  hardcore: TrackRecord;
}

const STORAGE_KEY = 'airskido_track_records_v1';

export class RecordManager {
  private records: RecordsState;

  constructor() {
    this.records = this.loadRecords();
  }

  private loadRecords(): RecordsState {
    const defaultState: RecordsState = {
      classic: { bestRaceTime: null, bestLapTime: null, recordedAt: null },
      hardcore: { bestRaceTime: null, bestLapTime: null, recordedAt: null },
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('airskid_track_records_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          classic: {
            bestRaceTime: typeof parsed.classic?.bestRaceTime === 'number' ? parsed.classic.bestRaceTime : null,
            bestLapTime: typeof parsed.classic?.bestLapTime === 'number' ? parsed.classic.bestLapTime : null,
            recordedAt: typeof parsed.classic?.recordedAt === 'number' ? parsed.classic.recordedAt : null,
          },
          hardcore: {
            bestRaceTime: typeof parsed.hardcore?.bestRaceTime === 'number' ? parsed.hardcore.bestRaceTime : null,
            bestLapTime: typeof parsed.hardcore?.bestLapTime === 'number' ? parsed.hardcore.bestLapTime : null,
            recordedAt: typeof parsed.hardcore?.recordedAt === 'number' ? parsed.hardcore.recordedAt : null,
          },
        };
      }
    } catch {
      // fallback
    }

    return defaultState;
  }

  private saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // ignore
    }
  }

  public getRecord(trackKey: 'classic' | 'hardcore'): TrackRecord {
    return this.records[trackKey] || { bestRaceTime: null, bestLapTime: null, recordedAt: null };
  }

  /**
   * Check if a completed race time beats the Personal Best (PB).
   * Automatically saves if new record!
   */
  public checkRaceTime(
    trackKey: 'classic' | 'hardcore',
    timeSeconds: number
  ): { isNewPB: boolean; prevPB: number | null; delta: number } {
    const rec = this.records[trackKey];
    const prevPB = rec.bestRaceTime;

    if (prevPB === null || timeSeconds < prevPB) {
      const delta = prevPB !== null ? timeSeconds - prevPB : 0;
      rec.bestRaceTime = timeSeconds;
      rec.recordedAt = Date.now();
      this.saveRecords();
      return { isNewPB: true, prevPB, delta };
    }

    return { isNewPB: false, prevPB, delta: timeSeconds - prevPB };
  }

  /**
   * Check if a completed lap time beats the Best Lap record.
   * Automatically saves if new record!
   */
  public checkLapTime(
    trackKey: 'classic' | 'hardcore',
    lapTimeSeconds: number
  ): { isNewPB: boolean; prevPB: number | null; delta: number } {
    const rec = this.records[trackKey];
    const prevPB = rec.bestLapTime;

    if (prevPB === null || lapTimeSeconds < prevPB) {
      const delta = prevPB !== null ? lapTimeSeconds - prevPB : 0;
      rec.bestLapTime = lapTimeSeconds;
      this.saveRecords();
      return { isNewPB: true, prevPB, delta };
    }

    return { isNewPB: false, prevPB, delta: lapTimeSeconds - prevPB };
  }

  /**
   * Format seconds to MM:SS.ms (e.g. 01:14.28)
   */
  public static formatTime(seconds: number): string {
    if (seconds <= 0 || !isFinite(seconds)) return '--:--.--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hundredths = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  }

  /**
   * Format delta to +0.45s or -1.24s
   */
  public static formatDelta(deltaSeconds: number): string {
    const sign = deltaSeconds < 0 ? '-' : '+';
    const abs = Math.abs(deltaSeconds);
    return `${sign}${abs.toFixed(2)}s`;
  }
}

export const recordManager = new RecordManager();

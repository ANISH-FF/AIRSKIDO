/**
 * NameSystem.ts — Production-Grade Player Callsign & ID Architecture
 * 
 * Rules:
 * 1. Alphanumeric only (letters & numbers: a-z, A-Z, 0-9), NO SPACES.
 * 2. 3 to 14 characters limit.
 * 3. Case-insensitive uniqueness check (e.g. 'anish' and 'Anish' cannot be claimed by different players).
 * 4. Permanent immutable 8-digit numeric Player UID (e.g. 84920153) assigned on first visit.
 * 5. Instant Guest mode for zero friction (default: Racer_XXXX).
 * 6. Clean, professional typography & status badges (ZERO emojis).
 */

export interface GoogleUserInfo {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  linkedAt: number;
}

export interface RacerProfile {
  playerId: string;       // Permanent Immutable 8-Digit UID (e.g. "84920153")
  username: string;       // Display Callsign (e.g. "Racer_8492" or "maxx01")
  isCustomName: boolean;  // false for default guest, true once player changes name
  googleUser?: GoogleUserInfo | null; // Linked Google account
  createdAt: number;
  updatedAt: number;
}

export type NameStatusType = 'idle' | 'valid' | 'invalid' | 'taken';

export interface NameValidationResult {
  valid: boolean;
  message: string;
  status: NameStatusType;
}

export interface CloudNameBackend {
  checkAvailability: (lowerName: string) => Promise<boolean>;
  claimName: (lowerName: string, playerId: string) => Promise<boolean>;
  releaseName?: (lowerName: string, playerId: string) => Promise<boolean>;
}

const STORAGE_PROFILE_KEY = 'airskido_racer_profile_v1';
const STORAGE_REGISTRY_KEY = 'airskido_registered_usernames_v1';

import { isBotReservedName } from './BotKartSettings';

export class NameSystem {
  private profile: RacerProfile;
  private cloudBackend: CloudNameBackend | null = null;
  private listeners: Array<(profile: RacerProfile) => void> = [];

  constructor() {
    this.profile = this.loadOrCreateProfile();
  }

  // ── 1. PROFILE INITIALIZATION (Instant Guest Mode) ────────────────
  private loadOrCreateProfile(): RacerProfile {
    try {
      const saved = localStorage.getItem(STORAGE_PROFILE_KEY) || localStorage.getItem('airskid_racer_profile_v1');
      if (saved) {
        const parsed = JSON.parse(saved) as RacerProfile;
        if (parsed.playerId && parsed.username) {
          let cleanId = String(parsed.playerId).trim();

          // Auto-migrate legacy "AS-XXXXXX" or non-numeric IDs to clean pure numeric UID
          if (cleanId.startsWith('AS-') || !/^\d{4,10}$/.test(cleanId)) {
            const digits = cleanId.replace(/\D/g, '');
            if (digits.length >= 4) {
              cleanId = digits;
            } else {
              cleanId = `${Math.floor(10000000 + Math.random() * 90000000)}`;
            }
          }

          let cleanUsername = parsed.username;
          if (cleanUsername.startsWith('Racer_')) {
            cleanUsername = cleanUsername.replace(/^Racer_/, 'Racer');
          }

          const profile: RacerProfile = {
            playerId: cleanId,
            username: cleanUsername,
            isCustomName: !!parsed.isCustomName,
            googleUser: parsed.googleUser || null,
            createdAt: parsed.createdAt || Date.now(),
            updatedAt: parsed.updatedAt || Date.now(),
          };

          if (profile.playerId !== parsed.playerId || profile.username !== parsed.username) {
            this.saveProfile(profile);
          }
          return profile;
        }
      }
    } catch {
      // ignore parse error and generate fresh profile
    }

    // Generate brand-new guest identity with 8-digit pure numeric UID (10,000,000 to 99,999,999)
    const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4-digit code e.g. 8492
    const randomIdNumber = Math.floor(10000000 + Math.random() * 90000000); // 8-digit numeric UID
    const newId = `${randomIdNumber}`;
    const newGuestName = `Racer${randomSuffix}`;

    const newProfile: RacerProfile = {
      playerId: newId,
      username: newGuestName,
      isCustomName: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.saveProfile(newProfile);
    return newProfile;
  }

  private saveProfile(profile: RacerProfile) {
    this.profile = profile;
    try {
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(profile));
    } catch {
      // storage unavailable
    }
    this.notifyListeners();
  }

  // ── 2. NAME REGISTRY STORAGE (Uniqueness Lock Simulation) ───────────
  private loadRegistry(): Record<string, string> {
    try {
      const raw = localStorage.getItem(STORAGE_REGISTRY_KEY) || localStorage.getItem('airskid_registered_usernames_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    return {};
  }

  private saveRegistry(registry: Record<string, string>) {
    try {
      localStorage.setItem(STORAGE_REGISTRY_KEY, JSON.stringify(registry));
    } catch {
      // storage unavailable
    }
  }

  // ── 3. STRICT VALIDATION ENGINE ───────────────────────────────────
  public validateName(rawName: string): NameValidationResult {
    const trimmed = rawName.trim();

    if (!trimmed) {
      return {
        valid: false,
        message: 'ENTER 3 TO 14 CHARACTERS',
        status: 'idle',
      };
    }

    // Check spaces explicitly
    if (/\s/.test(rawName)) {
      return {
        valid: false,
        message: 'NO SPACES ALLOWED',
        status: 'invalid',
      };
    }

    // Length check
    if (trimmed.length < 3) {
      return {
        valid: false,
        message: 'MINIMUM 3 CHARACTERS REQUIRED',
        status: 'invalid',
      };
    }

    if (trimmed.length > 14) {
      return {
        valid: false,
        message: 'MAXIMUM 14 CHARACTERS ALLOWED',
        status: 'invalid',
      };
    }

    // Alphanumeric strictly: /^[a-zA-Z0-9]+$/
    const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(trimmed);
    if (!isAlphanumeric) {
      return {
        valid: false,
        message: 'LETTERS AND NUMBERS ONLY',
        status: 'invalid',
      };
    }

    // Case-insensitive check
    const lower = trimmed.toLowerCase();
    const currentLower = this.profile.username.toLowerCase();

    // If it's already the player's own active username
    if (lower === currentLower) {
      return {
        valid: true,
        message: 'CURRENT ACTIVE CALLSIGN',
        status: 'valid',
      };
    }

    // Check registry for conflict (including leetspeak variants '0' vs 'o')
    const registry = this.loadRegistry();
    const oToZero = lower.replace(/o/g, '0');
    const zeroToO = lower.replace(/0/g, 'o');
    const ownerId = registry[lower] || registry[oToZero] || registry[zeroToO];

    if (ownerId && ownerId !== this.profile.playerId) {
      return {
        valid: false,
        message: 'NAME ALREADY TAKEN BY ANOTHER RACER',
        status: 'taken',
      };
    }

    // Check if name is reserved by official bot racers
    if (isBotReservedName(trimmed)) {
      return {
        valid: false,
        message: 'RESERVED OFFICIAL CALLSIGN',
        status: 'taken',
      };
    }

    return {
      valid: true,
      message: 'NAME AVAILABLE',
      status: 'valid',
    };
  }

  // ── 4. CHANGE NAME PROCEDURE ──────────────────────────────────────
  public async changeName(newName: string): Promise<{ success: boolean; error?: string }> {
    const val = this.validateName(newName);
    if (!val.valid) {
      return { success: false, error: val.message };
    }

    const trimmed = newName.trim();
    const lower = trimmed.toLowerCase();
    const prevLower = this.profile.username.toLowerCase();

    // If Cloud backend adapter is configured, perform remote atomic reservation
    if (this.cloudBackend) {
      try {
        const available = await this.cloudBackend.checkAvailability(lower);
        if (!available && lower !== prevLower) {
          return { success: false, error: 'NAME ALREADY TAKEN BY ANOTHER RACER' };
        }
        const claimed = await this.cloudBackend.claimName(lower, this.profile.playerId);
        if (!claimed) {
          return { success: false, error: 'FAILED TO CLAIM NAME IN DATABASE' };
        }
      } catch (err: any) {
        return { success: false, error: err?.message || 'DATABASE CONNECTION ERROR' };
      }
    }

    // Update local registry
    const registry = this.loadRegistry();
    // Release previous custom name if changing to a new one
    if (this.profile.isCustomName && prevLower !== lower) {
      delete registry[prevLower];
    }
    registry[lower] = this.profile.playerId;
    this.saveRegistry(registry);

    // Save updated profile
    const updatedProfile: RacerProfile = {
      ...this.profile,
      username: trimmed,
      isCustomName: true,
      updatedAt: Date.now(),
    };
    this.saveProfile(updatedProfile);

    return { success: true };
  }

  // ── 5. CLOUD BACKEND ATTACHMENT HOOK ──────────────────────────────
  public setCloudBackend(backend: CloudNameBackend | null) {
    this.cloudBackend = backend;
  }

  // ── 6. GETTERS & LISTENERS ────────────────────────────────────────
  public getProfile(): RacerProfile {
    return { ...this.profile };
  }

  public get username(): string {
    return this.profile.username;
  }

  public get playerId(): string {
    return this.profile.playerId;
  }

  public get isCustomName(): boolean {
    return this.profile.isCustomName;
  }

  public get googleUser(): GoogleUserInfo | null | undefined {
    return this.profile.googleUser;
  }

  public linkGoogleAccount(googleUser: GoogleUserInfo) {
    const updated: RacerProfile = {
      ...this.profile,
      googleUser,
      updatedAt: Date.now(),
    };
    this.saveProfile(updated);
  }

  public unlinkGoogleAccount() {
    const updated: RacerProfile = {
      ...this.profile,
      googleUser: null,
      updatedAt: Date.now(),
    };
    this.saveProfile(updated);
  }

  public syncFromCloud(username: string, playerId?: string, googleUser?: GoogleUserInfo | null) {
    const rawId = playerId || this.profile.playerId;
    const cleanPlayerId = String(rawId || '').trim().replace(/^AS-?/i, '');
    const updated: RacerProfile = {
      ...this.profile,
      username: username || this.profile.username,
      playerId: cleanPlayerId || this.profile.playerId,
      isCustomName: true,
      googleUser: googleUser !== undefined ? googleUser : this.profile.googleUser,
      updatedAt: Date.now(),
    };
    this.saveProfile(updated);
  }

  public addListener(cb: (profile: RacerProfile) => void) {
    this.listeners.push(cb);
    cb(this.getProfile());
  }

  public removeListener(cb: (profile: RacerProfile) => void) {
    this.listeners = this.listeners.filter((fn) => fn !== cb);
  }

  private notifyListeners() {
    const prof = this.getProfile();
    this.listeners.forEach((fn) => {
      try {
        fn(prof);
      } catch {
        // safety
      }
    });
  }
}

export const nameSystem = new NameSystem();

/**
 * CloudSyncService.ts — Production Firebase Google Auth & Cloud Firestore Sync
 * 
 * Responsibilities:
 * 1. Real Google Authentication via official Firebase SDK (signInWithPopup / GoogleAuthProvider).
 * 2. Real-time Cloud Firestore synchronization of Player Economy (Coins, Gems, Level, XP, Unlocked Skins).
 * 3. Worldwide unique Callsign registry in Firestore collection 'usernames'.
 * 4. Automatic session persistence via Firebase onAuthStateChanged.
 * 5. Offline & Unconfigured safety: Gracefully handles missing .env keys with clear setup instructions.
 */

import {
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  isFirebaseConfigured,
  getFirebaseMissingKeys,
} from './FirebaseConfig';
import { economy, EconomyState } from './Economy';
import { nameSystem, RacerProfile, GoogleUserInfo, CloudNameBackend } from './NameSystem';

export interface CloudUserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  playerId: string;
  username: string;
  isCustomName: boolean;
  coins: number;
  gems: number;
  level: number;
  xp: number;
  unlockedItems: string[];
  equippedSkin: string;
  equippedHat?: string;
  equippedTrail?: string;
  equippedGlasses: string;
  createdAt: number;
  updatedAt: number;
}

export interface CloudSyncStatus {
  isConfigured: boolean;
  missingKeys: string[];
  isAuthenticated: boolean;
  user: GoogleUserInfo | null;
  isSyncing: boolean;
  lastSyncTime: number | null;
  errorMessage: string | null;
}

export class CloudSyncService {
  private currentUser: User | null = null;
  private isSyncing: boolean = false;
  private lastSyncTime: number | null = null;
  private lastError: string | null = null;
  private listeners: Array<(status: CloudSyncStatus) => void> = [];
  private saveDebounceTimer: any = null;

  constructor() {
    this.init();
  }

  private init() {
    // 1. Hook up CloudNameBackend into NameSystem for Firestore-level global uniqueness
    const cloudNameBackend: CloudNameBackend = {
      checkAvailability: async (lowerName: string) => {
        return this.isUsernameAvailable(lowerName);
      },
      claimName: async (lowerName: string, playerId: string) => {
        return this.claimUsernameInCloud(lowerName, playerId);
      },
    };
    nameSystem.setCloudBackend(cloudNameBackend);

    // 2. Hook up Economy auto-save listener
    economy.addStateChangeListener((state) => {
      this.triggerDebouncedCloudSave(state);
    });

    // 3. Listen to Firebase Auth state if configured
    if (auth && isFirebaseConfigured()) {
      onAuthStateChanged(auth, async (firebaseUser) => {
        this.currentUser = firebaseUser;
        if (firebaseUser) {
          await this.handleUserSignedIn(firebaseUser);
        } else {
          this.handleUserSignedOut();
        }
        this.notify();
      });
    }
  }

  // ── FIREBASE AUTHENTICATION ─────────────────────────────────────────

  /**
   * Triggers the official Google Sign-In Popup
   */
  public async signInWithGoogle(): Promise<{ success: boolean; error?: string }> {
    if (!isFirebaseConfigured()) {
      const missing = getFirebaseMissingKeys().join(', ');
      const err = `FIREBASE_NOT_CONFIGURED: Missing ${missing} in .env file.`;
      this.lastError = err;
      this.notify();
      return { success: false, error: err };
    }

    if (!auth || !googleProvider) {
      const err = 'Firebase Auth is not initialized. Please verify your .env credentials.';
      this.lastError = err;
      this.notify();
      return { success: false, error: err };
    }

    try {
      this.isSyncing = true;
      this.lastError = null;
      this.notify();

      const cred = await signInWithPopup(auth, googleProvider);
      this.currentUser = cred.user;
      await this.handleUserSignedIn(cred.user);
      this.isSyncing = false;
      this.notify();
      return { success: true };
    } catch (err: any) {
      this.isSyncing = false;
      console.error('[CloudSyncService] Google sign-in failed:', err);
      let message = 'Failed to sign in with Google.';
      if (err.code === 'auth/popup-closed-by-user') {
        message = 'Sign-in window was closed.';
      } else if (err.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your internet connection.';
      } else if (err.message) {
        message = err.message;
      }
      this.lastError = message;
      this.notify();
      return { success: false, error: message };
    }
  }

  /**
   * Signs the user out of Firebase and unlinks Google info
   */
  public async signOut(): Promise<void> {
    if (auth) {
      try {
        await fbSignOut(auth);
      } catch (err) {
        console.error('[CloudSyncService] Firebase sign out error:', err);
      }
    }
    this.currentUser = null;
    nameSystem.unlinkGoogleAccount();
    this.lastError = null;
    this.notify();
  }

  // ── FIRESTORE CLOUD DATA PIPELINE ───────────────────────────────────

  private async handleUserSignedIn(user: User) {
    if (!db) return;

    const googleUser: GoogleUserInfo = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Pilot',
      photoURL: user.photoURL || undefined,
      linkedAt: Date.now(),
    };

    try {
      this.isSyncing = true;
      const userDocRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        // Existing user doc found: restore progress from cloud
        const cloudData = snap.data() as Partial<CloudUserDoc>;
        console.log('[CloudSyncService] Cloud account loaded for:', user.email);

        // 1. Sync Profile & Callsign
        if (cloudData.username) {
          nameSystem.syncFromCloud(cloudData.username, cloudData.playerId, googleUser);
        } else {
          nameSystem.linkGoogleAccount(googleUser);
        }

        // 2. Sync Economy (Coins, Gems, Level, XP, Unlocked Items)
        economy.loadStateFromCloud({
          coins: typeof cloudData.coins === 'number' ? cloudData.coins : undefined,
          gems: typeof cloudData.gems === 'number' ? cloudData.gems : undefined,
          level: typeof cloudData.level === 'number' ? cloudData.level : undefined,
          xp: typeof cloudData.xp === 'number' ? cloudData.xp : undefined,
          unlockedItems: Array.isArray(cloudData.unlockedItems) ? cloudData.unlockedItems : undefined,
          equippedSkin: cloudData.equippedSkin,
          equippedHat: cloudData.equippedHat,
          equippedTrail: cloudData.equippedTrail,
          equippedGlasses: cloudData.equippedGlasses,
        });

        this.lastSyncTime = Date.now();
      } else {
        // First-time Google user: save current local state to cloud
        console.log('[CloudSyncService] Creating new cloud profile for:', user.email);
        const curProfile = nameSystem.getProfile();
        const curEconomy = economy.getState();

        nameSystem.linkGoogleAccount(googleUser);

        const newDoc: CloudUserDoc = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Pilot',
          photoURL: user.photoURL || undefined,
          playerId: curProfile.playerId,
          username: curProfile.username,
          isCustomName: curProfile.isCustomName,
          coins: curEconomy.coins,
          gems: curEconomy.gems,
          level: curEconomy.level,
          xp: curEconomy.xp,
          unlockedItems: curEconomy.unlockedItems,
          equippedSkin: curEconomy.equippedSkin,
          equippedHat: curEconomy.equippedHat,
          equippedTrail: curEconomy.equippedTrail,
          equippedGlasses: curEconomy.equippedGlasses,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await setDoc(userDocRef, newDoc);

        // If user already had a custom name, claim it in usernames collection
        if (curProfile.isCustomName) {
          await this.claimUsernameInCloud(curProfile.username.toLowerCase(), curProfile.playerId);
        }

        this.lastSyncTime = Date.now();
      }
    } catch (err: any) {
      console.error('[CloudSyncService] Error synchronizing cloud account:', err);
      this.lastError = 'Cloud synchronization error: ' + (err.message || 'Unknown');
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  private handleUserSignedOut() {
    nameSystem.unlinkGoogleAccount();
    this.notify();
  }

  // ── DEBOUNCED CLOUD SAVE (Triggered on Coins/Level/Skin changes) ─────

  private triggerDebouncedCloudSave(state: EconomyState) {
    if (!this.currentUser || !db || !isFirebaseConfigured()) return;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      if (!this.currentUser || !db) return;
      try {
        const userDocRef = doc(db, 'users', this.currentUser.uid);
        await updateDoc(userDocRef, {
          coins: state.coins,
          gems: state.gems,
          level: state.level,
          xp: state.xp,
          unlockedItems: state.unlockedItems,
          equippedSkin: state.equippedSkin,
          equippedHat: state.equippedHat,
          equippedTrail: state.equippedTrail,
          equippedGlasses: state.equippedGlasses,
          vipExpiresAt: state.vipExpiresAt,
          updatedAt: Date.now(),
        });
        this.lastSyncTime = Date.now();
        this.notify();
      } catch (err) {
        console.warn('[CloudSyncService] Debounced cloud save warning:', err);
      }
    }, 600);
  }

  // ── GLOBAL USERNAME UNIQUENESS IN FIRESTORE ──────────────────────────

  public async isUsernameAvailable(lowerName: string): Promise<boolean> {
    if (!db || !isFirebaseConfigured()) {
      return true; // Fallback to local uniqueness check
    }

    try {
      // Build normalized variants to catch leetspeak substitutions ('0' vs 'o')
      const oToZero = lowerName.replace(/o/g, '0');
      const zeroToO = lowerName.replace(/0/g, 'o');
      const candidates = Array.from(new Set([lowerName, oToZero, zeroToO]));

      const myUid = this.currentUser?.uid;
      const myPlayerId = nameSystem.playerId;

      // Check all variants in parallel
      const snaps = await Promise.all(
        candidates.map((c) => getDoc(doc(db!, 'usernames', c)))
      );

      for (const snap of snaps) {
        if (snap.exists()) {
          const data = snap.data();
          // Available only if claimed by this same user or playerId
          const isMine = (myUid && data.uid === myUid) || (data.playerId && data.playerId === myPlayerId);
          if (!isMine) {
            return false;
          }
        }
      }

      return true;
    } catch (err) {
      console.warn('[CloudSyncService] Error checking username availability:', err);
      return true;
    }
  }

  public async claimUsernameInCloud(lowerName: string, playerId: string): Promise<boolean> {
    if (!db || !isFirebaseConfigured()) {
      return true;
    }

    try {
      const usernameDocRef = doc(db, 'usernames', lowerName);
      await setDoc(usernameDocRef, {
        uid: this.currentUser ? this.currentUser.uid : null,
        playerId,
        username: nameSystem.username,
        claimedAt: Date.now(),
      });

      if (this.currentUser) {
        const userDocRef = doc(db, 'users', this.currentUser.uid);
        await updateDoc(userDocRef, {
          username: nameSystem.username,
          isCustomName: true,
          updatedAt: Date.now(),
        });
      }

      return true;
    } catch (err) {
      console.error('[CloudSyncService] Failed to claim username in cloud:', err);
      return false;
    }
  }

  // ── STATUS & LISTENERS ──────────────────────────────────────────────

  public getStatus(): CloudSyncStatus {
    const isConfigured = isFirebaseConfigured();
    const missingKeys = getFirebaseMissingKeys();
    const profile = nameSystem.getProfile();

    return {
      isConfigured,
      missingKeys,
      isAuthenticated: Boolean(this.currentUser),
      user: profile.googleUser || null,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      errorMessage: this.lastError,
    };
  }

  public addListener(cb: (status: CloudSyncStatus) => void) {
    this.listeners.push(cb);
    cb(this.getStatus());
  }

  public removeListener(cb: (status: CloudSyncStatus) => void) {
    this.listeners = this.listeners.filter((fn) => fn !== cb);
  }

  private notify() {
    const status = this.getStatus();
    this.listeners.forEach((cb) => {
      try {
        cb(status);
      } catch (e) {
        console.error('CloudSyncService listener error:', e);
      }
    });
  }
}

export const cloudSyncService = new CloudSyncService();

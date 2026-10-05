import { nameSystem, NameValidationResult, RacerProfile } from '../core/NameSystem';
import { cloudSyncService, CloudSyncStatus } from '../core/CloudSyncService';
import { economy } from '../core/Economy';
import { sounds } from '../core/Sound';

export class NameModal {
  private modalEl: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private currentEl: HTMLElement | null = null;
  private playerIdEl: HTMLElement | null = null;
  private cloudStatusEl: HTMLElement | null = null;

  // Google binding elements
  private unlinkedView: HTMLElement | null = null;
  private linkedView: HTMLElement | null = null;
  private googleBindBtn: HTMLButtonElement | null = null;
  private googleSignOutBtn: HTMLButtonElement | null = null;
  private envNoticeEl: HTMLElement | null = null;
  private googleNameEl: HTMLElement | null = null;
  private googleEmailEl: HTMLElement | null = null;
  private googleAvatarEl: HTMLElement | null = null;
  private googleCoinsEl: HTMLElement | null = null;
  private googleLvlEl: HTMLElement | null = null;

  // Callsign dual-state containers
  private nameClaimContainer: HTMLElement | null = null;
  private nameLockedContainer: HTMLElement | null = null;
  private nameLockedDisplay: HTMLElement | null = null;

  constructor() {
    this.modalEl = document.getElementById('change-name-modal');
    this.inputEl = document.getElementById('change-name-input') as HTMLInputElement | null;
    this.statusEl = document.getElementById('change-name-status');
    this.saveBtn = document.getElementById('btn-save-change-name') as HTMLButtonElement | null;
    this.currentEl = document.getElementById('change-name-current-val');
    this.playerIdEl = document.getElementById('change-name-id-val');
    this.cloudStatusEl = document.getElementById('change-name-cloud-val');

    this.nameClaimContainer = document.getElementById('name-claim-container');
    this.nameLockedContainer = document.getElementById('name-locked-container');
    this.nameLockedDisplay = document.getElementById('name-locked-callsign-display');

    this.unlinkedView = document.getElementById('modal-google-unlinked');
    this.linkedView = document.getElementById('modal-google-linked');
    this.googleBindBtn = document.getElementById('btn-google-bind-action') as HTMLButtonElement | null;
    this.googleSignOutBtn = document.getElementById('btn-google-signout-action') as HTMLButtonElement | null;
    this.envNoticeEl = document.getElementById('google-env-notice');
    this.googleNameEl = document.getElementById('google-linked-name');
    this.googleEmailEl = document.getElementById('google-linked-email');
    this.googleAvatarEl = document.getElementById('google-user-avatar');
    this.googleCoinsEl = document.getElementById('google-sync-coins');
    this.googleLvlEl = document.getElementById('google-sync-lvl');

    this.bindEvents();

    // Listen to Cloud Sync changes
    cloudSyncService.addListener((status) => {
      this.updateGoogleUI(status);
      this.updateLobbyIndicator(status);
    });

    // Listen to NameSystem profile changes
    nameSystem.addListener((prof) => {
      this.syncProfileToModal(prof);
    });
  }

  private bindEvents() {
    // Open trigger (Pilot Card in Navbar)
    const openBtn = document.getElementById('btn-open-change-name');
    if (openBtn) {
      openBtn.onclick = () => this.open();
    }

    // Close triggers
    const closeBtn = document.getElementById('btn-close-change-name');
    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }

    const cancelBtn = document.getElementById('btn-cancel-change-name');
    if (cancelBtn) {
      cancelBtn.onclick = () => this.close();
    }

    // Modal background click
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.close();
        }
      });
    }

    // Keystroke live validation
    if (this.inputEl) {
      this.inputEl.addEventListener('input', () => {
        this.updateValidationUI();
      });

      this.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleSave();
        } else if (e.key === 'Escape') {
          this.close();
        }
      });
    }

    // Save Callsign button
    if (this.saveBtn) {
      this.saveBtn.onclick = () => {
        this.handleSave();
      };
    }

    // Google Sign-In button
    if (this.googleBindBtn) {
      this.googleBindBtn.onclick = async () => {
        sounds.playSelect();
        const status = cloudSyncService.getStatus();
        if (!status.isConfigured) {
          if (this.envNoticeEl) {
            this.envNoticeEl.style.display = 'block';
            this.envNoticeEl.scrollIntoView({ behavior: 'smooth' });
          }
          return;
        }

        this.googleBindBtn!.disabled = true;
        const btnText = document.getElementById('google-bind-btn-text');
        if (btnText) btnText.textContent = 'CONNECTING GOOGLE...';

        const res = await cloudSyncService.signInWithGoogle();
        this.googleBindBtn!.disabled = false;
        if (btnText) btnText.textContent = 'SIGN IN WITH GOOGLE';

        if (res.success) {
          sounds.playCoin();
        } else {
          sounds.playCrash(0.8);
          if (res.error && res.error.includes('FIREBASE_NOT_CONFIGURED') && this.envNoticeEl) {
            this.envNoticeEl.style.display = 'block';
          }
        }
      };
    }

    // Google Sign-Out button
    if (this.googleSignOutBtn) {
      this.googleSignOutBtn.onclick = async () => {
        sounds.playSelect();
        await cloudSyncService.signOut();
      };
    }
  }

  public open() {
    sounds.playSelect();

    const profile = nameSystem.getProfile();
    this.syncProfileToModal(profile);

    // If user has already chosen a custom name: Show locked card, hide claim input!
    if (profile.isCustomName) {
      if (this.nameClaimContainer) this.nameClaimContainer.style.display = 'none';
      if (this.nameLockedContainer) this.nameLockedContainer.style.display = 'block';
      if (this.nameLockedDisplay) this.nameLockedDisplay.textContent = profile.username.toUpperCase();
    } else {
      if (this.nameClaimContainer) this.nameClaimContainer.style.display = 'block';
      if (this.nameLockedContainer) this.nameLockedContainer.style.display = 'none';
      if (this.inputEl) {
        this.inputEl.value = '';
        setTimeout(() => this.inputEl?.focus(), 50);
      }
      this.updateValidationUI();
    }

    this.updateGoogleUI(cloudSyncService.getStatus());

    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
    }
  }

  public close() {
    sounds.playSelect();
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  private syncProfileToModal(profile: RacerProfile) {
    if (this.playerIdEl) {
      this.playerIdEl.textContent = '#' + profile.playerId;
    }
    if (this.currentEl) {
      this.currentEl.textContent = profile.username.toUpperCase();
    }
  }

  private updateGoogleUI(status: CloudSyncStatus) {
    // 1. Env missing notice
    if (this.envNoticeEl) {
      this.envNoticeEl.style.display = status.isConfigured ? 'none' : 'block';
    }

    // 2. Cloud status badge in info strip
    if (this.cloudStatusEl) {
      if (status.isAuthenticated && status.user) {
        this.cloudStatusEl.textContent = 'LINKED ✔';
        this.cloudStatusEl.style.color = '#16a34a';
      } else {
        this.cloudStatusEl.textContent = 'GUEST';
        this.cloudStatusEl.style.color = '#64748B';
      }
    }

    // 3. Toggle View A (Unlinked) vs View B (Linked)
    if (status.isAuthenticated && status.user) {
      if (this.unlinkedView) this.unlinkedView.style.display = 'none';
      if (this.linkedView) this.linkedView.style.display = 'block';

      if (this.googleNameEl) this.googleNameEl.textContent = status.user.displayName || 'Google Pilot';
      if (this.googleEmailEl) this.googleEmailEl.textContent = status.user.email;

      if (this.googleAvatarEl) {
        if (status.user.photoURL) {
          this.googleAvatarEl.innerHTML = `<img src="${status.user.photoURL}" alt="avatar" />`;
        } else {
          const initial = (status.user.displayName || 'G').charAt(0).toUpperCase();
          this.googleAvatarEl.textContent = initial;
        }
      }

      if (this.googleCoinsEl) {
        this.googleCoinsEl.textContent = economy.getCoins().toLocaleString();
      }
      if (this.googleLvlEl) {
        this.googleLvlEl.textContent = `LVL ${economy.getLevel()}`;
      }
    } else {
      if (this.unlinkedView) this.unlinkedView.style.display = 'block';
      if (this.linkedView) this.linkedView.style.display = 'none';
    }
  }

  private updateLobbyIndicator(_status: CloudSyncStatus) {
    const chip = document.getElementById('lobby-cloud-chip');
    if (chip) {
      chip.style.display = 'none';
    }
  }

  private updateValidationUI() {
    const val = this.inputEl?.value || '';
    const res: NameValidationResult = nameSystem.validateName(val);

    if (this.statusEl) {
      this.statusEl.textContent = res.message;
      this.statusEl.className = `name-status-badge status-${res.status}`;
    }

    if (this.saveBtn) {
      const isSameAsCurrent = val.trim().toLowerCase() === nameSystem.username.toLowerCase();
      this.saveBtn.disabled = !res.valid || isSameAsCurrent;
      if (this.saveBtn.disabled) {
        this.saveBtn.classList.add('btn-disabled');
      } else {
        this.saveBtn.classList.remove('btn-disabled');
      }
    }
  }

  private async handleSave() {
    if (!this.inputEl || !this.saveBtn || this.saveBtn.disabled) return;

    const newName = this.inputEl.value.trim();
    this.saveBtn.disabled = true;
    if (this.statusEl) {
      this.statusEl.textContent = 'CHECKING AVAILABILITY...';
      this.statusEl.className = 'name-status-badge status-checking';
    }

    const res = await nameSystem.changeName(newName);

    if (res.success) {
      sounds.playCoin();
      if (this.nameClaimContainer) this.nameClaimContainer.style.display = 'none';
      if (this.nameLockedContainer) this.nameLockedContainer.style.display = 'block';
      if (this.nameLockedDisplay) this.nameLockedDisplay.textContent = newName;
      this.close();
    } else {
      sounds.playCrash(0.8);
      if (this.statusEl) {
        this.statusEl.textContent = res.error || 'INVALID CALLSIGN';
        this.statusEl.className = 'name-status-badge status-taken';
      }
      this.saveBtn.disabled = false;
    }
  }
}

export let nameModal: NameModal;

export function initNameModal(): NameModal {
  if (!nameModal) {
    nameModal = new NameModal();
  }
  return nameModal;
}

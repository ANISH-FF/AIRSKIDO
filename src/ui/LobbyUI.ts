import { economy } from '../core/Economy';
import { sounds } from '../core/Sound';
import { storeModal } from './StoreModal';
import { settingsModal } from './SettingsModal';
import confetti from 'canvas-confetti';

export class LobbyUI {
  constructor() {
    this.bindEvents();
    this.updateLobbyElements();
  }

  private bindEvents() {
    // 1. Store Modal Triggers
    const btnStore = document.getElementById('btn-open-store');
    const vipBadge = document.getElementById('lobby-vip-badge');
    const btnCoins = document.getElementById('btn-open-coins');
    const btnGems = document.getElementById('btn-open-gems');

    if (btnStore) btnStore.onclick = () => storeModal.open('skins');
    if (vipBadge) vipBadge.onclick = () => storeModal.open('vip');
    if (btnCoins) btnCoins.onclick = () => storeModal.open('vip');
    if (btnGems) btnGems.onclick = () => storeModal.open('vip');

    // 2. Daily Mystery Gift Chest Trigger
    const btnDailyGift = document.getElementById('btn-daily-gift');
    const btnCloseRewards = document.getElementById('btn-close-rewards');
    const btnClaimLoot = document.getElementById('btn-claim-loot');
    const rewardsModal = document.getElementById('rewards-modal');

    if (btnDailyGift) {
      btnDailyGift.onclick = () => {
        this.updateDailyChestModal();
        if (rewardsModal) rewardsModal.style.display = 'flex';
        sounds.playSelect();
      };
    }

    if (btnCloseRewards && rewardsModal) {
      btnCloseRewards.onclick = () => {
        rewardsModal.style.display = 'none';
      };
    }

    if (btnClaimLoot) {
      btnClaimLoot.onclick = () => {
        if (economy.canClaimDaily()) {
          const res = economy.claimDaily();
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
          sounds.playCoin();
          this.updateDailyChestModal();
          this.updateLobbyElements();
        }
      };
    }

    // 3. Guide & Tutorial Modals (Privacy, Terms & About Us are standalone Brutopia HTML pages)
    this.bindModal('btn-open-guide', 'guide-modal', 'btn-close-guide', 'btn-accept-guide');

    // 4. Settings Modal Trigger (Lobby Top Bar)
    const settingsBtn = document.getElementById('btn-open-settings');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        settingsModal.open();
      };
    }



    // Close on backdrop click
    ['privacy-modal', 'terms-modal', 'guide-modal', 'rewards-modal', 'settings-modal'].forEach((id) => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.onclick = (e) => {
          if (e.target === modal) modal.style.display = 'none';
        };
      }
    });

    economy.onVipChange = () => {
      this.updateLobbyElements();
    };
  }

  private bindModal(openBtnId: string, modalId: string, closeBtnId: string, acceptBtnId: string) {
    const openBtn = document.getElementById(openBtnId);
    const modal = document.getElementById(modalId);
    const closeBtn = document.getElementById(closeBtnId);
    const acceptBtn = document.getElementById(acceptBtnId);

    if (openBtn && modal) {
      openBtn.onclick = () => {
        modal.style.display = 'flex';
        sounds.playSelect();
      };
    }
    if (closeBtn && modal) {
      closeBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }
    if (acceptBtn && modal) {
      acceptBtn.onclick = () => {
        modal.style.display = 'none';
      };
    }
  }

  public updateDailyChestModal() {
    const canClaim = economy.canClaimDaily();
    const claimBtn = document.getElementById('btn-claim-loot') as HTMLButtonElement | null;
    const descEl = document.getElementById('rewards-modal-desc');

    if (claimBtn) {
      if (canClaim) {
        claimBtn.disabled = false;
        claimBtn.innerText = '🎉 OPEN CRATE & CLAIM 🎉';
        claimBtn.style.opacity = '1';
        claimBtn.style.cursor = 'pointer';
      } else {
        claimBtn.disabled = true;
        claimBtn.innerText = 'CLAIMED TODAY! (CHECK BACK TOMORROW)';
        claimBtn.style.opacity = '0.6';
        claimBtn.style.cursor = 'not-allowed';
      }
    }

    if (descEl) {
      descEl.innerText = canClaim
        ? 'Claim your free daily mystery loot crate to get Coins & Gems for your garage!'
        : 'You have already unlocked today\'s crate! Race more laps to earn extra bonus coins.';
    }
  }

  public updateLobbyElements() {
    economy.updateUI();
  }
}

export const lobbyUI = new LobbyUI();

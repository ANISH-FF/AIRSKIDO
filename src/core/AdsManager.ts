import { sounds } from './Sound';

export interface AdRewardConfig {
  id: string;
  title: string;
  rewardType: 'vip_15m' | 'coins_500' | 'gems_5';
  description: string;
}

export class AdsManager {
  private isAdPlaying: boolean = false;
  private adTimer: number = 0;
  private adDuration: number = 6; // 6 seconds arcade rewarded ad duration
  private adInterval: any = null;

  // Extension hook for Real Ad SDKs (Google H5, Poki, CrazyGames)
  public externalAdProvider: 'simulator' | 'poki' | 'crazygames' | 'google_h5' = 'simulator';

  constructor() {
    this.createAdModalDOM();
  }

  private createAdModalDOM() {
    // If modal already exists in DOM, skip
    if (document.getElementById('ad-player-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'ad-player-modal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.style.zIndex = '99999';

    modal.innerHTML = `
      <div class="ad-player-card">
        <div class="ad-top-bar">
          <div class="ad-badge-live">
            <span class="ad-live-dot">●</span>
            <span>ARCADE REWARD SPONSOR</span>
          </div>
          <div class="ad-countdown-pill" id="ad-countdown-sec">6s</div>
        </div>

        <div class="ad-video-mockup">
          <div class="ad-sponsor-icon">🎮</div>
          <h3 class="ad-sponsor-title" id="ad-reward-title">WATCH AD TO EARN REWARD</h3>
          <p class="ad-sponsor-desc" id="ad-reward-desc">Support AIRSKIDO to claim free VIP perks & coin bonuses!</p>
          <div class="ad-progress-bar-bg">
            <div class="ad-progress-fill" id="ad-progress-fill"></div>
          </div>
        </div>

        <div class="ad-bottom-actions">
          <button type="button" class="brut-btn btn-white" id="btn-cancel-ad" style="font-size: 11px; padding: 6px 14px;">CANCEL</button>
          <button type="button" class="brut-btn btn-yellow" id="btn-claim-ad-reward" style="font-size: 13px; padding: 8px 18px;" disabled>
            ⏳ WATCHING (6s)...
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  public showRewardedAd(config: AdRewardConfig, onReward: () => void, onCancel?: () => void) {
    if (this.isAdPlaying) return;
    this.isAdPlaying = true;

    // Check if external SDK is configured
    if (this.externalAdProvider === 'poki' && (window as any).PokiSDK) {
      (window as any).PokiSDK.rewardedBreak().then((success: boolean) => {
        this.isAdPlaying = false;
        if (success) onReward();
        else if (onCancel) onCancel();
      });
      return;
    }

    if (this.externalAdProvider === 'crazygames' && (window as any).CrazyGames?.SDK) {
      (window as any).CrazyGames.SDK.ad.requestAd('rewarded', {
        adFinished: () => {
          this.isAdPlaying = false;
          onReward();
        },
        adError: () => {
          this.isAdPlaying = false;
          if (onCancel) onCancel();
        },
      });
      return;
    }

    // Default: High-polish integrated arcade ad simulator
    const modal = document.getElementById('ad-player-modal');
    const titleEl = document.getElementById('ad-reward-title');
    const descEl = document.getElementById('ad-reward-desc');
    const countdownEl = document.getElementById('ad-countdown-sec');
    const progressFill = document.getElementById('ad-progress-fill');
    const claimBtn = document.getElementById('btn-claim-ad-reward') as HTMLButtonElement | null;
    const cancelBtn = document.getElementById('btn-cancel-ad');

    if (!modal) {
      this.isAdPlaying = false;
      onReward();
      return;
    }

    if (titleEl) titleEl.innerText = config.title;
    if (descEl) descEl.innerText = config.description;

    modal.style.display = 'flex';
    this.adTimer = this.adDuration;

    if (claimBtn) {
      claimBtn.disabled = true;
      claimBtn.innerText = `⏳ WATCHING (${this.adTimer}s)...`;
      claimBtn.style.opacity = '0.6';
    }

    if (progressFill) progressFill.style.width = '0%';
    if (countdownEl) countdownEl.innerText = `${this.adTimer}s`;

    const cleanup = () => {
      if (this.adInterval) {
        clearInterval(this.adInterval);
        this.adInterval = null;
      }
      this.isAdPlaying = false;
      modal.style.display = 'none';
    };

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        cleanup();
        if (onCancel) onCancel();
      };
    }

    this.adInterval = setInterval(() => {
      this.adTimer -= 1;
      const progressPct = ((this.adDuration - this.adTimer) / this.adDuration) * 100;

      if (progressFill) progressFill.style.width = `${progressPct}%`;
      if (countdownEl) countdownEl.innerText = `${Math.max(0, this.adTimer)}s`;

      if (this.adTimer <= 0) {
        clearInterval(this.adInterval);
        this.adInterval = null;

        if (claimBtn) {
          claimBtn.disabled = false;
          claimBtn.innerText = '🎉 CLAIM REWARD! 🎉';
          claimBtn.style.opacity = '1';
          sounds.playCoin();

          claimBtn.onclick = () => {
            cleanup();
            onReward();
          };
        }
      } else {
        if (claimBtn) {
          claimBtn.innerText = `⏳ WATCHING (${this.adTimer}s)...`;
        }
      }
    }, 1000);
  }
}

export const adsManager = new AdsManager();

import { sounds } from './Sound';
import { ENABLE_VIP_AND_ADS } from './GameConfig';

export interface EconomyState {
  coins: number;
  gems: number;
  level: number;
  xp: number;
  lastDailyClaim: number;
  lastDailyRaceDate: string;
  vipExpiresAt: number; // 0: none, -1: permanent, >0: timestamp
  unlockedItems: string[];
  equippedSkin: string;
  equippedHat: string;
  equippedGlasses: string;
  equippedTrail?: string;
}

const STORAGE_KEY = 'airskido_economy_v2';

export class EconomyManager {
  public static readonly MAX_LEVEL = 100;
  private state: EconomyState;
  public onVipChange?: (isVip: boolean) => void;
  private changeListeners: Array<(state: EconomyState) => void> = [];

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): EconomyState {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem('airskid_economy_v2') ||
        localStorage.getItem('aerocarts_economy_v2') ||
        localStorage.getItem('aerocarts_economy_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          coins: typeof parsed.coins === 'number' ? parsed.coins : 1500,
          gems: typeof parsed.gems === 'number' ? parsed.gems : 45,
          level: typeof parsed.level === 'number' ? Math.min(EconomyManager.MAX_LEVEL, Math.max(1, parsed.level)) : 1,
          xp: typeof parsed.xp === 'number' ? parsed.xp : 40,
          lastDailyClaim: typeof parsed.lastDailyClaim === 'number' ? parsed.lastDailyClaim : 0,
          lastDailyRaceDate: typeof parsed.lastDailyRaceDate === 'string' ? parsed.lastDailyRaceDate : '',
          vipExpiresAt: typeof parsed.vipExpiresAt === 'number' ? parsed.vipExpiresAt : 0,
          unlockedItems: Array.isArray(parsed.unlockedItems) ? parsed.unlockedItems : ['skin_default', 'hat_none', 'hat_party', 'glasses_none', 'glasses_speed_matrix'],
          equippedSkin: typeof parsed.equippedSkin === 'string' ? parsed.equippedSkin : 'skin_default',
          equippedHat: typeof parsed.equippedHat === 'string' ? parsed.equippedHat : 'hat_none',
          equippedGlasses: typeof parsed.equippedGlasses === 'string' ? parsed.equippedGlasses : 'glasses_none',
          equippedTrail: typeof parsed.equippedTrail === 'string' ? parsed.equippedTrail : 'trail_cyan',
        };
      }
    } catch {
      // fallback
    }

    // Default starter package for new racers
    return {
      coins: 1500,
      gems: 45,
      level: 1,
      xp: 40,
      lastDailyClaim: 0,
      lastDailyRaceDate: '',
      vipExpiresAt: 0,
      unlockedItems: ['skin_default', 'hat_none', 'hat_party', 'glasses_none', 'glasses_speed_matrix'],
      equippedSkin: 'skin_default',
      equippedHat: 'hat_none',
      equippedGlasses: 'glasses_none',
      equippedTrail: 'trail_cyan',
    };
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore
    }
    this.notifyStateChange();
  }

  public getState(): EconomyState {
    return { ...this.state };
  }

  public loadStateFromCloud(cloudState: Partial<EconomyState>) {
    if (typeof cloudState.coins === 'number') this.state.coins = cloudState.coins;
    if (typeof cloudState.gems === 'number') this.state.gems = cloudState.gems;
    if (typeof cloudState.level === 'number') this.state.level = Math.min(EconomyManager.MAX_LEVEL, Math.max(1, cloudState.level));
    if (typeof cloudState.xp === 'number') this.state.xp = cloudState.xp;
    if (Array.isArray(cloudState.unlockedItems)) this.state.unlockedItems = [...cloudState.unlockedItems];
    if (typeof cloudState.equippedSkin === 'string') this.state.equippedSkin = cloudState.equippedSkin;
    if (typeof cloudState.equippedHat === 'string') this.state.equippedHat = cloudState.equippedHat;
    if (typeof cloudState.equippedTrail === 'string') this.state.equippedTrail = cloudState.equippedTrail;
    if (typeof cloudState.equippedGlasses === 'string') this.state.equippedGlasses = cloudState.equippedGlasses;
    if (typeof cloudState.vipExpiresAt === 'number') this.state.vipExpiresAt = cloudState.vipExpiresAt;
    
    // Save to local cache so offline access preserves cloud state
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore
    }
    this.updateUI();
  }

  public addStateChangeListener(listener: (state: EconomyState) => void) {
    this.changeListeners.push(listener);
  }

  private notifyStateChange() {
    for (const listener of this.changeListeners) {
      try {
        listener(this.getState());
      } catch (e) {
        console.error('Economy state listener error:', e);
      }
    }
  }

  public get coins(): number {
    return this.state.coins;
  }

  public getCoins(): number {
    return this.state.coins;
  }

  public getGems(): number {
    return this.state.gems;
  }

  public getLevel(): number {
    return this.state.level;
  }

  public getXp(): number {
    return this.state.xp;
  }

  public getXpNeeded(): number {
    // Balanced arcade curve: Level 1 needs 250 XP (~3-4 races), Level 2 needs 350 XP, etc.
    return 150 + this.state.level * 100;
  }

  public isVip(): boolean {
    if (!ENABLE_VIP_AND_ADS) return false;
    if (this.state.vipExpiresAt === -1) return true;
    return this.state.vipExpiresAt > Date.now();
  }

  public getVipRemainingTime(): string {
    if (this.state.vipExpiresAt === -1) return 'PERMANENT';
    const leftMs = this.state.vipExpiresAt - Date.now();
    if (leftMs <= 0) return 'EXPIRED';
    const totalSec = Math.floor(leftMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }

  public activateVip(durationMinutes: number) {
    if (durationMinutes === -1) {
      this.state.vipExpiresAt = -1;
    } else {
      const now = Date.now();
      const currentExpiry = Math.max(now, this.state.vipExpiresAt);
      this.state.vipExpiresAt = currentExpiry + durationMinutes * 60 * 1000;
    }
    this.saveState();
    this.updateUI();
    if (this.onVipChange) {
      this.onVipChange(true);
    }
  }

  public isItemUnlocked(itemId: string): boolean {
    if (
      itemId === 'skin_default' ||
      (itemId.startsWith('paint_') && itemId !== 'paint_white') ||
      itemId === 'hat_none' ||
      itemId === 'hat_party' ||
      itemId === 'trail_cyan' ||
      itemId === 'glasses_none' ||
      itemId === 'glasses_speed_matrix'
    ) return true;
    return this.state.unlockedItems.includes(itemId);
  }

  public unlockItem(itemId: string) {
    if (!this.state.unlockedItems.includes(itemId)) {
      this.state.unlockedItems.push(itemId);
      this.saveState();
      this.updateUI();
    }
  }

  public getEquippedSkin(): string {
    const skin = this.state.equippedSkin || 'skin_default';
    if (skin === 'paint_white' && !this.isItemUnlocked('paint_white')) {
      return 'skin_default';
    }
    return skin;
  }

  public setEquippedSkin(skinId: string) {
    this.state.equippedSkin = skinId;
    this.saveState();
    this.updateUI();
  }

  public getEquippedHat(): string {
    const hat = this.state.equippedHat || 'hat_none';
    if (!this.isItemUnlocked(hat)) return 'hat_none';
    return hat;
  }

  public setEquippedHat(hatId: string) {
    this.state.equippedHat = hatId;
    this.saveState();
    this.updateUI();
  }

  public getEquippedTrail(): string {
    return this.state.equippedTrail || 'trail_cyan';
  }

  public setEquippedTrail(trailId: string) {
    this.state.equippedTrail = trailId;
    this.saveState();
    this.updateUI();
  }

  public getEquippedGlasses(): string {
    const glasses = this.state.equippedGlasses || 'glasses_none';
    if (!this.isItemUnlocked(glasses)) return 'glasses_none';
    return glasses;
  }

  public setEquippedGlasses(glassesId: string) {
    this.state.equippedGlasses = glassesId;
    this.saveState();
    this.updateUI();
  }

  public addCoins(amount: number, playSound: boolean = true): number {
    // 1.5x VIP bonus on all earned coins!
    const multiplier = this.isVip() && amount > 0 ? 1.5 : 1.0;
    const finalAmount = Math.round(amount * multiplier);

    this.state.coins = Math.max(0, this.state.coins + finalAmount);
    this.saveState();
    this.updateUI();
    if (playSound && finalAmount > 0) {
      sounds.playCoin();
    }
    return this.state.coins;
  }

  public deductCoins(amount: number): boolean {
    if (this.state.coins < amount) return false;
    this.state.coins -= amount;
    this.saveState();
    this.updateUI();
    return true;
  }

  public addGems(amount: number): number {
    this.state.gems = Math.max(0, this.state.gems + amount);
    this.saveState();
    this.updateUI();
    return this.state.gems;
  }

  public deductGems(amount: number): boolean {
    if (this.state.gems < amount) return false;
    this.state.gems -= amount;
    this.saveState();
    this.updateUI();
    return true;
  }

  public addXp(amount: number): {
    leveledUp: boolean;
    oldLevel: number;
    newLevel: number;
    oldXp: number;
    newXp: number;
    oldNeeded: number;
    xpNeeded: number;
    earnedXp: number;
    bonusCoins: number;
  } {
    const MAX_LEVEL = EconomyManager.MAX_LEVEL;
    const oldLevel = this.state.level;
    const oldXp = this.state.xp;
    const oldNeeded = this.getXpNeeded();

    if (this.state.level >= MAX_LEVEL) {
      this.state.level = MAX_LEVEL;
      this.state.xp = oldNeeded; // Full XP bar at MAX Level
      this.saveState();
      this.updateUI();
      return {
        leveledUp: false,
        oldLevel: MAX_LEVEL,
        newLevel: MAX_LEVEL,
        oldXp: oldNeeded,
        newXp: oldNeeded,
        oldNeeded,
        xpNeeded: oldNeeded,
        earnedXp: 0,
        bonusCoins: 0,
      };
    }

    const multiplier = this.isVip() ? 1.5 : 1.0;
    const earnedXp = Math.round(amount * multiplier);
    this.state.xp += earnedXp;
    let leveledUp = false;
    let needed = oldNeeded;
    let bonusCoins = 0;

    while (this.state.xp >= needed && this.state.level < MAX_LEVEL) {
      this.state.xp -= needed;
      this.state.level += 1;
      leveledUp = true;
      bonusCoins += 200; // +200 Coins reward on each level up!
      needed = this.getXpNeeded();
    }

    if (this.state.level >= MAX_LEVEL) {
      this.state.level = MAX_LEVEL;
      this.state.xp = needed; // Cap at 100% full bar
    }

    if (bonusCoins > 0) {
      this.state.coins += bonusCoins;
    }

    this.saveState();
    this.updateUI();

    if (leveledUp) {
      sounds.playVictory();
    }

    return {
      leveledUp,
      oldLevel,
      newLevel: this.state.level,
      oldXp,
      newXp: this.state.xp,
      oldNeeded,
      xpNeeded: needed,
      earnedXp,
      bonusCoins,
    };
  }

  public canClaimDailyFirstRace(): boolean {
    const today = new Date().toDateString();
    return this.state.lastDailyRaceDate !== today;
  }

  public claimDailyFirstRace(): number {
    if (!this.canClaimDailyFirstRace()) return 0;
    const baseReward = 500; // Boosted to 500 Coins for Daily 1st Race!
    const multiplier = this.isVip() ? 1.5 : 1.0;
    const finalReward = Math.round(baseReward * multiplier);
    this.state.coins += finalReward;
    this.state.lastDailyRaceDate = new Date().toDateString();
    this.saveState();
    this.updateUI();
    sounds.playCoin();
    return finalReward;
  }

  public canClaimDaily(): boolean {
    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours
    return (now - this.state.lastDailyClaim) >= cooldownMs;
  }

  public claimDaily(): { coins: number; gems: number } {
    const coinsReward = 250;
    const gemsReward = 5; // Daily gift diamonds set to 5
    this.state.coins += coinsReward;
    this.state.gems += gemsReward;
    this.state.lastDailyClaim = Date.now();
    this.addXp(50);
    this.saveState();
    this.updateUI();
    sounds.playCoin();
    return { coins: coinsReward, gems: gemsReward };
  }

  public updateUI() {
    // 1. Coins
    const coinEl = document.getElementById('coin-amount-display');
    if (coinEl) {
      coinEl.innerText = this.state.coins.toLocaleString();
    }

    // 2. Gems
    const gemEl = document.getElementById('gem-amount-display');
    if (gemEl) {
      gemEl.innerText = this.state.gems.toLocaleString();
    }

    // 3. Level & XP
    const lvlEl = document.getElementById('level-badge-display');
    if (lvlEl) {
      lvlEl.innerText = this.state.level >= EconomyManager.MAX_LEVEL ? 'LVL 100 (MAX)' : `LVL ${this.state.level}`;
    }

    const xpFill = document.getElementById('xp-bar-fill');
    if (xpFill) {
      const pct = this.state.level >= EconomyManager.MAX_LEVEL
        ? 100
        : Math.min(100, Math.round((this.state.xp / this.getXpNeeded()) * 100));
      xpFill.style.width = `${pct}%`;
    }

    // 4. Daily Gift Notification Pip
    const giftPip = document.getElementById('daily-gift-badge');
    if (giftPip) {
      if (this.canClaimDaily()) {
        giftPip.innerText = 'FREE!';
        giftPip.style.display = 'inline-block';
        giftPip.classList.add('pulse-anim');
      } else {
        giftPip.style.display = 'none';
        giftPip.classList.remove('pulse-anim');
      }
    }

    // 5. VIP Badge & Status in Lobby (Hidden if ENABLE_VIP_AND_ADS is false)
    const vipBadge = document.getElementById('lobby-vip-badge');
    if (vipBadge) {
      if (!ENABLE_VIP_AND_ADS) {
        vipBadge.style.display = 'none';
      } else {
        vipBadge.style.display = 'inline-flex';
        const crownSvg = `<svg viewBox="0 0 24 24" width="15" height="15" style="fill: #000; vertical-align: middle;"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>`;
        if (this.isVip()) {
          vipBadge.classList.add('is-vip');
          vipBadge.innerHTML = `${crownSvg} <span class="vip-text">VIP</span>`;
          vipBadge.title = `VIP Active (${this.getVipRemainingTime()}) • 1.5x Coins & XP Bonus!`;
        } else {
          vipBadge.classList.remove('is-vip');
          vipBadge.innerHTML = `${crownSvg} <span class="vip-text">VIP PASS</span>`;
          vipBadge.title = 'Unlock VIP Crown & 1.5x Coin Boost!';
        }
      }
    }

    // 6. Lobby Daily Bounty & First Race Sync
    const eventCard = document.getElementById('lobby-event-card');
    if (eventCard) {
      const isDailyReady = this.canClaimDailyFirstRace();
      const bountyTitle = eventCard.querySelector('.bounty-title');
      const bountyReward = eventCard.querySelector('.bounty-reward-pill');
      const bountyFill = eventCard.querySelector('.bounty-bar-fill') as HTMLElement | null;
      const bountySub = eventCard.querySelector('.bounty-subtext');

      if (bountyTitle) bountyTitle.textContent = 'DAILY FIRST RACE // BONUS';
      if (bountyReward) bountyReward.textContent = '+500 COINS';
      if (bountyFill) {
        bountyFill.style.width = isDailyReady ? '0%' : '100%';
        bountyFill.style.background = isDailyReady ? 'var(--brut-yellow)' : '#22c55e';
      }
      if (bountySub) {
        bountySub.innerHTML = isDailyReady
          ? 'STATUS: <strong style="color: #f59e0b;">READY 🎁 (500 BONUS ON 1ST RACE)</strong>'
          : 'STATUS: <strong style="color: #16a34a;">CLAIMED ✔ (RESETS AT MIDNIGHT)</strong>';
      }
    }
  }
}

export const economy = new EconomyManager();

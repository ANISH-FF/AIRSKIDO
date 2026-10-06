import { store, STORE_CATALOG, StoreItem } from '../core/Store';
import { economy } from '../core/Economy';
import { sounds } from '../core/Sound';
import { KART_CONFIGS } from '../entities/Kart';
import confetti from 'canvas-confetti';

export type ShowroomTab = 'machines' | 'skins' | 'glasses' | 'hats' | 'vip';

export class StoreModal {
  private viewEl: HTMLElement | null = null;
  private currentTab: ShowroomTab = 'skins';
  private selectedMachineIndex: number = 0;
  private previewedSkinId: string | null = null;
  private previewedGlassesId: string | null = null;
  private previewedHatId: string | null = null;

  // Callbacks hooked by main.ts
  public onSelectMachine?: (kartIndex: number) => void;
  public onPreviewSkin?: (skinId: string) => void;
  public onPreviewGlasses?: (glassesId: string) => void;
  public onPreviewHat?: (hatId: string) => void;
  public onOpen?: () => void;
  public onClose?: () => void;
  public onEquipChanged?: () => void;

  constructor() {
    this.createShowroomDOM();
    this.bindEvents();
  }

  private createShowroomDOM() {
    if (document.getElementById('garage-store-view')) return;

    const showroom = document.createElement('div');
    showroom.id = 'garage-store-view';
    showroom.className = 'garage-showroom-overlay';
    showroom.style.display = 'none';

    showroom.innerHTML = `
      <!-- ── BOTTOM SHOWROOM DOCK (Leaves middle 70% open for 3D car) ── -->
      <div class="showroom-bottom-deck">
        <!-- Category Tabs -->
        <div class="showroom-tabs-bar">
          <button type="button" class="showroom-tab-btn active" data-tab="skins">
            <span class="tab-icon">🎨</span>
            <span class="tab-text">PAINTS & LIVERIES</span>
          </button>
          <button type="button" class="showroom-tab-btn" data-tab="glasses">
            <span class="tab-icon">🕶️</span>
            <span class="tab-text">CHASMA & SHADES</span>
          </button>
          <button type="button" class="showroom-tab-btn" data-tab="hats">
            <span class="tab-icon">🎩</span>
            <span class="tab-text">HATS & CAPS</span>
          </button>
          <button type="button" class="showroom-tab-btn" data-tab="vip">
            <span class="tab-icon">👑</span>
            <span class="tab-text">VIP & STORE</span>
          </button>
        </div>

        <!-- Horizontal Shelf Container -->
        <div class="showroom-shelf-wrap">
          <div class="showroom-shelf-scroll" id="showroom-shelf-scroll">
            <!-- Dynamic item cards rendered here -->
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(showroom);
    this.viewEl = showroom;
  }

  private bindEvents() {
    const closeBtn = document.getElementById('btn-close-showroom');
    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }

    // Category Tabs click
    const tabs = document.querySelectorAll('.showroom-tab-btn');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        sounds.playSelect();
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = (tab.getAttribute('data-tab') || 'skins') as ShowroomTab;
        this.renderItems();
      });
    });

    // ESC key closes showroom cleanly
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Horizontal wheel scroll convenience on shelf
    const shelf = document.getElementById('showroom-shelf-scroll');
    if (shelf) {
      shelf.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          shelf.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }
  }

  public isOpen(): boolean {
    return this.viewEl?.style.display === 'flex';
  }

  public open(tab: ShowroomTab = 'skins', initialMachineIndex?: number) {
    if (!this.viewEl) return;
    if (initialMachineIndex !== undefined) {
      this.selectedMachineIndex = initialMachineIndex;
    }

    this.currentTab = tab;
    this.viewEl.style.display = 'flex';
    document.body.classList.add('showroom-store-open');

    // Highlight active tab button
    const tabs = document.querySelectorAll('.showroom-tab-btn');
    tabs.forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });

    sounds.playSelect();
    this.render();

    if (this.onOpen) {
      this.onOpen();
    }
  }

  public close() {
    if (!this.viewEl) return;
    this.viewEl.style.display = 'none';
    document.body.classList.remove('showroom-store-open');

    // Restore equipped skin, glasses & hat if user previewed without saving
    this.previewedSkinId = null;
    this.previewedGlassesId = null;
    this.previewedHatId = null;

    sounds.playSelect();
    if (this.onClose) {
      this.onClose();
    }
  }

  public setMachineIndex(idx: number) {
    this.selectedMachineIndex = idx;
    if (this.currentTab === 'machines') {
      this.renderItems();
    }
  }

  public render() {
    // 1. Update live balances across the unified persistent game navbar
    economy.updateUI();

    // 2. Render shelf contents
    this.renderItems();
  }

  private renderItems() {
    const shelf = document.getElementById('showroom-shelf-scroll');
    if (!shelf) return;
    shelf.innerHTML = '';

    switch (this.currentTab) {
      case 'machines':
        this.renderMachinesTab(shelf);
        break;
      case 'skins':
        this.renderSkinsTab(shelf);
        break;
      case 'glasses':
        this.renderGlassesTab(shelf);
        break;
      case 'hats':
        this.renderHatsTab(shelf);
        break;
      case 'vip':
        this.renderVipTab(shelf);
        break;
    }
  }

  // ── 1. MACHINES TAB ──
  private renderMachinesTab(container: HTMLElement) {
    KART_CONFIGS.forEach((cfg, idx) => {
      const isSelected = idx === this.selectedMachineIndex;
      const card = document.createElement('div');
      card.className = `showroom-card machine-card${isSelected ? ' active-selection' : ''}`;

      const speedPct = Math.round(((cfg.topSpeed - 40) / 14) * 100);
      const accelPct = Math.round(((cfg.acceleration - 40) / 16) * 100);
      const gripPct = Math.round(((cfg.driftGrip - 1.0) / 0.9) * 100);
      const weightPct = Math.round(((cfg.weight - 0.8) / 1.1) * 100);

      const colorHex = `#${cfg.color.toString(16).padStart(6, '0')}`;
      const subtitle =
        cfg.name === 'APEX' ? 'SPEEDSTER // VELOCITY BULLET' :
        cfg.name === 'VIPER' ? 'DRIFT KING // SHARP CORNERING' :
        cfg.name === 'TITAN' ? 'HEAVY TANK // BRAWLER JUGGERNAUT' : 'ALL-ROUND RACER';

      card.innerHTML = `
        <div class="showroom-card-header">
          <div class="machine-color-badge" style="background: ${colorHex};"></div>
          <span class="showroom-badge-tag">${cfg.name}</span>
        </div>
        <div class="showroom-card-title">${cfg.name}</div>
        <div class="showroom-card-subtitle">${subtitle}</div>

        <div class="machine-specs-bars">
          <div class="spec-row">
            <span>SPD</span>
            <div class="spec-bar-track"><div class="spec-bar-fill" style="width: ${speedPct}%;"></div></div>
          </div>
          <div class="spec-row">
            <span>ACC</span>
            <div class="spec-bar-track"><div class="spec-bar-fill" style="width: ${accelPct}%;"></div></div>
          </div>
          <div class="spec-row">
            <span>DRFT</span>
            <div class="spec-bar-track"><div class="spec-bar-fill" style="width: ${gripPct}%;"></div></div>
          </div>
          <div class="spec-row">
            <span>MASS</span>
            <div class="spec-bar-track"><div class="spec-bar-fill" style="width: ${weightPct}%;"></div></div>
          </div>
        </div>

        <button type="button" class="brut-btn ${isSelected ? 'btn-white' : 'btn-yellow'} showroom-action-btn">
          ${isSelected ? 'CURRENT MACHINE' : 'SELECT MACHINE'}
        </button>
      `;

      card.onclick = () => {
        this.selectedMachineIndex = idx;
        sounds.playSelect();
        if (this.onSelectMachine) {
          this.onSelectMachine(idx);
        }
        this.renderItems();
      };

      container.appendChild(card);
    });
  }

  // ── 2. SKINS & LIVERIES TAB ──
  private renderSkinsTab(container: HTMLElement) {
    const skinItems = STORE_CATALOG.filter((i) => i.category === 'skin');
    const equippedSkin = economy.getEquippedSkin();

    skinItems.forEach((item) => {
      const isOwned = item.id === 'skin_default' || economy.isItemUnlocked(item.id);
      const isEquipped = equippedSkin === item.id;
      const isPreviewing = this.previewedSkinId === item.id;
      const isLevelLocked = !isOwned && Boolean(item.requiredLevel && economy.getLevel() < item.requiredLevel);

      const card = document.createElement('div');
      card.className = `showroom-card skin-card${isEquipped ? ' equipped' : ''}${isPreviewing ? ' previewing' : ''}${isLevelLocked ? ' level-locked' : ''}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (isEquipped) {
        btnLabel = 'EQUIPPED';
        btnClass = 'btn-white';
      } else if (isOwned) {
        btnLabel = 'EQUIP';
        btnClass = 'btn-yellow';
      } else if (isLevelLocked) {
        btnLabel = `🔒 LVL ${item.requiredLevel}`;
        btnClass = 'btn-gray locked-level-btn';
      } else {
        btnLabel = item.currency === 'coins'
          ? `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#FFDE59" stroke="#000" stroke-width="2"/><polygon points="12,6.5 13.7,10 17.5,10.5 14.7,13.2 15.4,17 12,15.2 8.6,17 9.3,13.2 6.5,10.5 10.3,10" fill="#FFF"/></svg> ${item.price.toLocaleString()}`
          : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;
      }

      const swatchColor = item.previewColor !== undefined
        ? `#${item.previewColor.toString(16).padStart(6, '0')}`
        : '#ffffff';

      const lockBadgeHtml = isLevelLocked
        ? `<span class="showroom-badge-tag tag-level-locked">🔒 LVL ${item.requiredLevel}</span>`
        : (item.badge ? `<span class="showroom-badge-tag">${item.badge}</span>` : '');

      card.innerHTML = `
        <div class="showroom-card-header">
          <div class="skin-swatch-circle" style="background: ${swatchColor};"></div>
          ${lockBadgeHtml}
        </div>
        <div class="showroom-card-title">${item.name}</div>
        <div class="showroom-card-desc">${item.description}</div>
        <div class="showroom-card-hint">${isLevelLocked ? `⭐ UNLOCKS AT LEVEL ${item.requiredLevel}` : '⚡ FULL RACER & APEX SUITE'}</div>
        <button type="button" class="brut-btn ${btnClass} showroom-action-btn" id="btn-skin-${item.id}">
          ${btnLabel}
        </button>
      `;

      // Live 3D preview on card click!
      card.onclick = (e) => {
        const isActionBtn = (e.target as HTMLElement).closest('.showroom-action-btn');

        // Apply 3D preview immediately
        this.previewedSkinId = item.id;
        sounds.playSelect();
        if (this.onPreviewSkin) {
          this.onPreviewSkin(item.id);
        }

        if (isActionBtn) {
          if (isEquipped) return;

          if (isLevelLocked) {
            sounds.playCrash(0.5);
            alert(`🔒 ${item.name} unlocks at Level ${item.requiredLevel}!\nYour current level: Level ${economy.getLevel()}.\nKeep racing to level up!`);
            return;
          }

          if (isOwned) {
            economy.setEquippedSkin(item.id);
            sounds.playSelect();
            this.render();
            if (this.onEquipChanged) this.onEquipChanged();
            return;
          }

          // Purchase skin
          const res = store.buyItem(item.id);
          if (res.success) {
            economy.setEquippedSkin(item.id);
            confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
            sounds.playCoin();
            this.render();
            if (this.onEquipChanged) this.onEquipChanged();
          } else {
            alert(res.message);
          }
        } else {
          // Just clicked card to preview
          this.renderItems();
        }
      };

      container.appendChild(card);
    });
  }

  // ── 3. CHASMA & SUNGLASSES TAB ──
  private renderGlassesTab(container: HTMLElement) {
    const glassesItems = STORE_CATALOG.filter((i) => i.category === 'glasses');
    const equippedGlasses = economy.getEquippedGlasses();
    const currentLevel = economy.getLevel();

    glassesItems.forEach((item) => {
      const isOwned = item.id === 'glasses_none' || item.id === 'glasses_speed_matrix' || economy.isItemUnlocked(item.id);
      const isEquipped = equippedGlasses === item.id;
      const isPreviewing = this.previewedGlassesId === item.id;
      const isLevelLocked = !isOwned && !!item.requiredLevel && currentLevel < item.requiredLevel;

      const card = document.createElement('div');
      card.className = `showroom-card glasses-card${isEquipped ? ' equipped' : ''}${isPreviewing ? ' previewing' : ''}${isLevelLocked ? ' level-locked' : ''}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (isEquipped) {
        btnLabel = 'EQUIPPED';
        btnClass = 'btn-white';
      } else if (isOwned) {
        btnLabel = isPreviewing ? 'EQUIP NOW' : 'EQUIP';
        btnClass = 'btn-yellow';
      } else if (isLevelLocked) {
        btnLabel = `🔒 LVL ${item.requiredLevel}`;
        btnClass = 'locked-level-btn';
      } else {
        btnLabel = item.currency === 'coins'
          ? `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#FFDE59" stroke="#000" stroke-width="2"/><polygon points="12,6.5 13.7,10 17.5,10.5 14.7,13.2 15.4,17 12,15.2 8.6,17 9.3,13.2 6.5,10.5 10.3,10" fill="#FFF"/></svg> ${item.price.toLocaleString()}`
          : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;
      }

      card.innerHTML = `
        <div class="showroom-card-header">
          <span class="store-card-icon" style="font-size: 26px;">${item.icon}</span>
          ${item.badge ? `<span class="showroom-badge-tag${isLevelLocked ? ' tag-level-locked' : ''}">${item.badge}</span>` : ''}
        </div>
        <div class="showroom-card-title">${item.name}</div>
        <div class="showroom-card-desc">${item.description}</div>
        <button type="button" class="brut-btn ${btnClass} showroom-action-btn">
          ${btnLabel}
        </button>
      `;

      card.onclick = (e) => {
        const target = e.target as HTMLElement;
        const isBtnClick = !!target.closest('.showroom-action-btn');

        // Always live-preview on 3D kart turntable
        this.previewedGlassesId = item.id;
        if (this.onPreviewGlasses) {
          this.onPreviewGlasses(item.id);
        }

        if (isEquipped) {
          this.renderItems();
          return;
        }

        if (isBtnClick || isOwned) {
          if (isOwned) {
            economy.setEquippedGlasses(item.id);
            this.previewedGlassesId = null;
            sounds.playSelect();
            this.render();
            if (this.onEquipChanged) this.onEquipChanged();
            return;
          }

          if (isLevelLocked) {
            alert(`🔒 This chasma requires Driver Level ${item.requiredLevel}! Keep racing to earn XP.`);
            return;
          }

          // Purchase chasma
          const res = store.buyItem(item.id);
          if (res.success) {
            economy.setEquippedGlasses(item.id);
            this.previewedGlassesId = null;
            confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
            sounds.playCoin();
            this.render();
            if (this.onEquipChanged) this.onEquipChanged();
          } else {
            alert(res.message);
          }
        } else {
          // Just clicked card to preview
          this.renderItems();
        }
      };

      container.appendChild(card);
    });
  }

  // ── 4. CUTE HATS & CAPS TAB ──
  private renderHatsTab(container: HTMLElement) {
    const hatItems = STORE_CATALOG.filter((i) => i.category === 'hat');
    const equippedHat = economy.getEquippedHat();
    const currentLevel = economy.getLevel();

    hatItems.forEach((item) => {
      const isOwned = item.id === 'hat_none' || item.id === 'hat_party' || economy.isItemUnlocked(item.id);
      const isEquipped = equippedHat === item.id;
      const isPreviewing = this.previewedHatId === item.id;
      const isLevelLocked = !isOwned && !!item.requiredLevel && currentLevel < item.requiredLevel;

      const card = document.createElement('div');
      card.className = `showroom-card hat-card${isEquipped ? ' equipped' : ''}${isPreviewing ? ' previewing' : ''}${isLevelLocked ? ' level-locked' : ''}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (isEquipped) {
        btnLabel = 'EQUIPPED';
        btnClass = 'btn-white';
      } else if (isOwned) {
        btnLabel = isPreviewing ? 'EQUIP NOW' : 'EQUIP';
        btnClass = 'btn-yellow';
      } else if (isLevelLocked) {
        btnLabel = `🔒 LVL ${item.requiredLevel}`;
        btnClass = 'locked-level-btn';
      } else {
        btnLabel = item.currency === 'coins'
          ? `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#FFDE59" stroke="#000" stroke-width="2"/><polygon points="12,6.5 13.7,10 17.5,10.5 14.7,13.2 15.4,17 12,15.2 8.6,17 9.3,13.2 6.5,10.5 10.3,10" fill="#FFF"/></svg> ${item.price.toLocaleString()}`
          : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;
      }

      card.innerHTML = `
        <div class="showroom-card-header">
          <span class="store-card-icon" style="font-size: 26px;">${item.icon}</span>
          ${item.badge ? `<span class="showroom-badge-tag${isLevelLocked ? ' tag-level-locked' : ''}">${item.badge}</span>` : ''}
        </div>
        <div class="showroom-card-title">${item.name}</div>
        <div class="showroom-card-desc">${item.description}</div>
        <button type="button" class="brut-btn ${btnClass} showroom-action-btn">
          ${btnLabel}
        </button>
      `;

      card.onclick = (e) => {
        const target = e.target as HTMLElement;
        const isBtnClick = !!target.closest('.showroom-action-btn');

        // Live-preview hat on 3D kart turntable
        this.previewedHatId = item.id;
        if (this.onPreviewHat) {
          this.onPreviewHat(item.id);
        }

        if (isEquipped) {
          this.renderItems();
          return;
        }

        if (isBtnClick || isOwned) {
          if (isOwned) {
            economy.setEquippedHat(item.id);
            this.previewedHatId = null;
            sounds.playSelect();
            this.render();
            if (this.onEquipChanged) this.onEquipChanged();
            return;
          }

          if (isLevelLocked) {
            alert(`🔒 This hat requires Driver Level ${item.requiredLevel}! Keep racing to earn XP.`);
            return;
          }

          // Purchase hat
          const res = store.buyItem(item.id);
          if (res.success) {
            economy.setEquippedHat(item.id);
            this.previewedHatId = null;
            confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
            sounds.playCoin();
            this.render();
            if (this.onEquipChanged) this.onEquipChanged();
          } else {
            alert(res.message);
          }
        } else {
          this.renderItems();
        }
      };

      container.appendChild(card);
    });
  }

  // ── 4. VIP & CURRENCY BUNDLES TAB ──
  private renderVipTab(container: HTMLElement) {
    const isVip = economy.isVip();
    const vipRemaining = economy.getVipRemainingTime();

    // 1. VIP Status Card
    const vipStatusCard = document.createElement('div');
    vipStatusCard.className = `showroom-card vip-status-card${isVip ? ' active-vip' : ''}`;
    vipStatusCard.innerHTML = `
      <div class="showroom-card-header">
        <span class="store-card-icon" style="font-size: 26px;">👑</span>
        <span class="showroom-badge-tag ${isVip ? 'tag-green' : 'tag-yellow'}">${isVip ? 'VIP ACTIVE' : 'INACTIVE'}</span>
      </div>
      <div class="showroom-card-title">${isVip ? `ROYAL VIP (${vipRemaining})` : 'BECOME ROYAL VIP'}</div>
      <div class="showroom-card-desc">
        Golden crown badge in races & leaderboards, +50% bonus coins & XP on every lap!
      </div>
      <button type="button" class="brut-btn btn-cyan showroom-action-btn" id="btn-showroom-watch-ad">
        WATCH AD (15M VIP FREE)
      </button>
    `;

    const adBtn = vipStatusCard.querySelector('#btn-showroom-watch-ad') as HTMLButtonElement | null;
    if (adBtn) {
      adBtn.onclick = (e) => {
        e.stopPropagation();
        store.watchAdForVip(() => {
          showVipCelebrationModal();
          this.render();
          if (this.onEquipChanged) this.onEquipChanged();
        });
      };
    }
    container.appendChild(vipStatusCard);

    // 2. VIP & Currency catalog items
    const vipItems = STORE_CATALOG.filter((i) => (i.category === 'vip' && i.id !== 'vip_ad_15m') || i.category === 'currency');

    vipItems.forEach((item) => {
      const isOwned = item.category === 'vip' && economy.isItemUnlocked(item.id);
      const card = document.createElement('div');
      card.className = `showroom-card bundle-card${isOwned ? ' owned' : ''}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (item.currency === 'ad') {
        btnLabel = 'WATCH AD';
        btnClass = 'btn-cyan';
      } else if (isOwned) {
        btnLabel = 'ACTIVE';
        btnClass = 'btn-white';
      } else {
        btnLabel = item.currency === 'coins'
          ? `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><circle cx="12" cy="12" r="10" fill="#FFDE59" stroke="#000" stroke-width="2"/><polygon points="12,6.5 13.7,10 17.5,10.5 14.7,13.2 15.4,17 12,15.2 8.6,17 9.3,13.2 6.5,10.5 10.3,10" fill="#FFF"/></svg> ${item.price.toLocaleString()}`
          : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;
      }

      card.innerHTML = `
        <div class="showroom-card-header">
          <span class="store-card-icon" style="font-size: 24px;">${item.icon}</span>
          ${item.badge ? `<span class="showroom-badge-tag">${item.badge}</span>` : ''}
        </div>
        <div class="showroom-card-title">${item.name}</div>
        <div class="showroom-card-desc">${item.description}</div>
        <button type="button" class="brut-btn ${btnClass} showroom-action-btn">
          ${btnLabel}
        </button>
      `;

      card.onclick = () => {
        if (item.id === 'ad_coins_500') {
          store.watchAdForCoins(() => {
            confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
            sounds.playCoin();
            this.render();
          });
          return;
        }

        if (isOwned) return;

        const res = store.buyItem(item.id);
        if (res.success) {
          if (item.category === 'vip') {
            showVipCelebrationModal();
          } else {
            confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
            sounds.playCoin();
          }
          this.render();
          if (this.onEquipChanged) this.onEquipChanged();
        } else {
          alert(res.message);
        }
      };

      container.appendChild(card);
    });
  }
}

export function showVipCelebrationModal() {
  const modal = document.getElementById('vip-unlocked-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  sounds.playVictory();
  confetti({
    particleCount: 160,
    spread: 90,
    origin: { y: 0.55 },
    colors: ['#FFDE59', '#FFB703', '#FFFFFF', '#00D2FF', '#FF385C']
  });

  const closeBtn = document.getElementById('btn-close-vip-unlocked');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      sounds.playSelect();
    };
  }
}

export const storeModal = new StoreModal();

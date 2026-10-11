import { store, STORE_CATALOG, StoreItem, ENABLE_VIP_AND_ADS } from '../core/Store';
import { economy } from '../core/Economy';
import { sounds } from '../core/Sound';
import { KART_CONFIGS } from '../entities/Kart';
import confetti from 'canvas-confetti';

export type ShowroomTab = 'machines' | 'skins' | 'glasses' | 'hats' | 'vip';

export function get3DGoldCoinSvg(size: number = 15): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="vertical-align: -2px; margin-right: 4px; display: inline-block; flex-shrink: 0;" class="racer-currency-svg"><circle cx="12" cy="12" r="10" fill="#FFDE59" stroke="#000" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="#F59E0B" stroke="#000" stroke-width="1.5"/><polygon points="12,6.5 13.7,10 17.5,10.5 14.7,13.2 15.4,17 12,15.2 8.6,17 9.3,13.2 6.5,10.5 10.3,10" fill="#FFF"/></svg>`;
}

function getStoreItemSvg(item: StoreItem): string {
  switch (item.id) {
    // Glasses & Shades
    case 'glasses_none':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21" stroke="#FF385C" stroke-width="2.5"/></svg>`;
    case 'glasses_speed_matrix':
      return `<svg viewBox="0 0 24 24"><polygon points="2,11 6,7 18,7 22,11" fill="#FFE600" stroke="#000" stroke-width="1.5"/><path d="M2 11h20v4c0 2.2-1.8 4-4 4h-3c-1.5 0-2.8-.8-3-2.2-.2 1.4-1.5 2.2-3 2.2H6c-2.2 0-4-1.8-4-4v-4z" fill="#000"/><rect x="5" y="12" width="5" height="2" fill="#00f0ff"/><rect x="14" y="12" width="5" height="2" fill="#00f0ff"/></svg>`;
    case 'glasses_thug_life':
      return `<svg viewBox="0 0 24 24" fill="#000"><rect x="2" y="10" width="9" height="5"/><rect x="13" y="10" width="9" height="5"/><rect x="10" y="10" width="4" height="2"/><rect x="4" y="15" width="5" height="2"/><rect x="15" y="15" width="5" height="2"/><rect x="3" y="11" width="2" height="2" fill="#FFF"/><rect x="14" y="11" width="2" height="2" fill="#FFF"/></svg>`;
    case 'glasses_retro_3d':
      return `<svg viewBox="0 0 24 24"><rect x="2" y="9" width="20" height="8" rx="2" fill="#FFF" stroke="#000" stroke-width="2"/><rect x="4" y="11" width="6" height="4" rx="1" fill="#FF385C"/><rect x="14" y="11" width="6" height="4" rx="1" fill="#00D2FF"/><line x1="10" y1="13" x2="14" y2="13" stroke="#000" stroke-width="2"/></svg>`;
    case 'glasses_top_gun':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="1.8"><path d="M3 10h18"/><path d="M4 10c0 4 3 6.5 6 6.5s4-2.5 4-6.5" fill="#1E293B"/><path d="M14 10c0 4 1 6.5 4 6.5s6-2.5 6-6.5" fill="#1E293B"/></svg>`;
    case 'glasses_star_party':
      return `<svg viewBox="0 0 24 24" fill="#FFE600" stroke="#000" stroke-width="1.5"><polygon points="7,8 8.5,12 12,12 9,14 10,18 7,15.5 4,18 5,14 2,12 5.5,12"/><polygon points="17,8 18.5,12 22,12 19,14 20,18 17,15.5 14,18 15,14 12,12 15.5,12"/><line x1="9" y1="12" x2="15" y2="12" stroke="#000" stroke-width="2"/></svg>`;
    case 'glasses_heart_rave':
      return `<svg viewBox="0 0 24 24" fill="#FF385C" stroke="#000" stroke-width="1.5"><path d="M7 9a2.5 2.5 0 0 0-2.5 2.5c0 2.5 3.5 4.5 3.5 4.5s3.5-2 3.5-4.5A2.5 2.5 0 0 0 9 9c-1 0-1.7.5-2 1.2C6.7 9.5 6 9 7 9z"/><path d="M17 9a2.5 2.5 0 0 0-2.5 2.5c0 2.5 3.5 4.5 3.5 4.5s3.5-2 3.5-4.5A2.5 2.5 0 0 0 19 9c-1 0-1.7.5-2 1.2-.3-.7-1-1.2-2-1.2z"/><line x1="11" y1="12" x2="13" y2="12" stroke="#000" stroke-width="2"/></svg>`;
    case 'glasses_cyber_visor':
      return `<svg viewBox="0 0 24 24"><polygon points="2,9 22,9 20,16 4,16" fill="#00D2FF" stroke="#000" stroke-width="2"/><line x1="4" y1="12.5" x2="20" y2="12.5" stroke="#FFF" stroke-width="2"/></svg>`;
    case 'glasses_steampunk':
      return `<svg viewBox="0 0 24 24" fill="#D97706" stroke="#000" stroke-width="2"><circle cx="7" cy="13" r="4.5" fill="#78350F"/><circle cx="17" cy="13" r="4.5" fill="#78350F"/><line x1="11.5" y1="13" x2="12.5" y2="13" stroke="#000" stroke-width="3"/></svg>`;
    case 'glasses_night_vision':
      return `<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="5" rx="1" fill="#334155" stroke="#000" stroke-width="1.5"/><circle cx="7" cy="14" r="3.5" fill="#10B981" stroke="#000" stroke-width="2"/><circle cx="17" cy="14" r="3.5" fill="#10B981" stroke="#000" stroke-width="2"/></svg>`;

    // Hats & Headwear
    case 'hat_none':
      return `<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2"><circle cx="12" cy="12" r="7"/><line x1="5" y1="5" x2="19" y2="19" stroke="#FF385C" stroke-width="2.5"/></svg>`;
    case 'hat_party':
      return `<svg viewBox="0 0 24 24"><polygon points="12,3 6,20 18,20" fill="#FFE600" stroke="#000" stroke-width="2"/><circle cx="12" cy="3" r="2.5" fill="#FF385C"/><circle cx="10" cy="11" r="1.5" fill="#00D2FF"/><circle cx="14" cy="15" r="1.5" fill="#10B981"/></svg>`;
    case 'hat_crown':
      return `<svg viewBox="0 0 24 24" fill="#FFE600" stroke="#000" stroke-width="1.8"><polygon points="3,17 4,7 8.5,12 12,5 15.5,12 20,7 21,17"/><circle cx="4" cy="6" r="1.5" fill="#FF385C"/><circle cx="12" cy="4" r="1.5" fill="#00D2FF"/><circle cx="20" cy="6" r="1.5" fill="#10B981"/></svg>`;
    case 'hat_cowboy':
      return `<svg viewBox="0 0 24 24" fill="#92400E" stroke="#000" stroke-width="2"><path d="M2 16c3-1 6-2 10-2s7 1 10 2c-2 2-6 3-10 3s-8-1-10-3z"/><path d="M7 14c0-4 1-7 5-7s5 3 5 7z"/><polygon points="12,10 13,12 11,12" fill="#FFE600"/></svg>`;
    case 'hat_frog':
      return `<svg viewBox="0 0 24 24" fill="#22C55E" stroke="#000" stroke-width="2"><path d="M4 17h16c-1-4-3-8-8-8s-7 4-8 8z"/><circle cx="7" cy="8" r="3" fill="#22C55E"/><circle cx="7" cy="8" r="1.5" fill="#000"/><circle cx="17" cy="8" r="3" fill="#22C55E"/><circle cx="17" cy="8" r="1.5" fill="#000"/></svg>`;
    case 'hat_cat_ears':
      return `<svg viewBox="0 0 24 24"><path d="M4 18c2-3 5-5 8-5s6 2 8 5" fill="none" stroke="#000" stroke-width="2.5"/><polygon points="4,16 6,5 11,12" fill="#FFF" stroke="#000" stroke-width="2"/><polygon points="6,14 7,8 10,12" fill="#FF385C"/><polygon points="20,16 18,5 13,12" fill="#FFF" stroke="#000" stroke-width="2"/><polygon points="18,14 17,8 14,12" fill="#FF385C"/></svg>`;
    case 'hat_tophat':
      return `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="18" rx="10" ry="2.5" fill="#18181B" stroke="#000" stroke-width="2"/><rect x="7" y="5" width="10" height="12" rx="1" fill="#18181B" stroke="#000" stroke-width="2"/><rect x="7" y="14" width="10" height="3" fill="#DC2626"/></svg>`;
    case 'hat_chef':
      return `<svg viewBox="0 0 24 24" fill="#FFF" stroke="#000" stroke-width="2"><rect x="7" y="14" width="10" height="5" rx="1"/><circle cx="8" cy="11" r="3.5"/><circle cx="12" cy="9" r="4"/><circle cx="16" cy="11" r="3.5"/></svg>`;
    case 'hat_duck':
      return `<svg viewBox="0 0 24 24" fill="#FFE600" stroke="#000" stroke-width="2"><circle cx="11" cy="9" r="5"/><ellipse cx="12" cy="16" rx="7" ry="4"/><polygon points="6,9 2,10 6,12" fill="#F97316"/><circle cx="10" cy="8" r="1" fill="#000"/></svg>`;
    case 'hat_propeller':
      return `<svg viewBox="0 0 24 24"><path d="M5 18c0-5 3-9 7-9s7 4 7 9H5z" fill="#00D2FF" stroke="#000" stroke-width="2"/><line x1="12" y1="9" x2="12" y2="5" stroke="#000" stroke-width="2"/><line x1="6" y1="5" x2="18" y2="5" stroke="#FF385C" stroke-width="2.5"/><circle cx="12" cy="5" r="1.5" fill="#FFE600"/></svg>`;
    case 'hat_wizard':
      return `<svg viewBox="0 0 24 24"><polygon points="12,2 5,18 19,18" fill="#4338CA" stroke="#000" stroke-width="2"/><ellipse cx="12" cy="18" rx="9" ry="2.5" fill="#4338CA" stroke="#000" stroke-width="2"/><polygon points="12,8 13,10 11,10" fill="#FFE600"/></svg>`;
    case 'hat_beanie':
      return `<svg viewBox="0 0 24 24"><path d="M6 16c0-5 3-9 6-9s6 4 6 9H6z" fill="#F97316" stroke="#000" stroke-width="2"/><rect x="5" y="15" width="14" height="4" rx="1" fill="#EA580C" stroke="#000" stroke-width="2"/><circle cx="12" cy="6" r="2" fill="#FFF" stroke="#000" stroke-width="1.5"/></svg>`;
    case 'hat_flower':
      return `<svg viewBox="0 0 24 24"><path d="M12 21c0-4 1-7 1-10" fill="none" stroke="#16A34A" stroke-width="2.5"/><path d="M12 16c-3-1-4 2-4 2s3 1 4-2z" fill="#22C55E"/><circle cx="13" cy="8" r="3.5" fill="#FFE600" stroke="#000" stroke-width="1.5"/><circle cx="13" cy="4.5" r="2" fill="#FFF"/><circle cx="13" cy="11.5" r="2" fill="#FFF"/><circle cx="9.5" cy="8" r="2" fill="#FFF"/><circle cx="16.5" cy="8" r="2" fill="#FFF"/></svg>`;
    case 'hat_santa':
      return `<svg viewBox="0 0 24 24"><path d="M6 16c1-6 8-12 13-10-1 4-4 8-9 10" fill="#DC2626" stroke="#000" stroke-width="2"/><rect x="4" y="15" width="14" height="4" rx="2" fill="#FFF" stroke="#000" stroke-width="2"/><circle cx="20" cy="7" r="2.5" fill="#FFF" stroke="#000" stroke-width="1.5"/></svg>`;
    case 'hat_viking':
      return `<svg viewBox="0 0 24 24"><path d="M6 17c0-5 3-8 6-8s6 3 6 8H6z" fill="#94A3B8" stroke="#000" stroke-width="2"/><path d="M6 14c-4-2-4-7-3-10 1 3 2 6 5 7" fill="#FEF3C7" stroke="#000" stroke-width="1.5"/><path d="M18 14c4-2 4-7 3-10-1 3-2 6-5 7" fill="#FEF3C7" stroke="#000" stroke-width="1.5"/></svg>`;
    case 'hat_pirate':
      return `<svg viewBox="0 0 24 24"><polygon points="3,17 12,8 21,17 12,19" fill="#18181B" stroke="#000" stroke-width="2"/><circle cx="12" cy="14" r="2" fill="#FFF"/><line x1="9" y1="17" x2="15" y2="17" stroke="#FFE600" stroke-width="2"/></svg>`;
    case 'hat_halo':
      return `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="11" rx="8" ry="3" fill="none" stroke="#FFE600" stroke-width="3"/></svg>`;
    case 'hat_cyber_horns':
      return `<svg viewBox="0 0 24 24"><path d="M6 18c0-5-3-9-3-12 3 3 5 7 5 12" fill="#FF0055" stroke="#000" stroke-width="2"/><path d="M18 18c0-5 3-9 3-12-3 3-5 7-5 12" fill="#FF0055" stroke="#000" stroke-width="2"/></svg>`;
    case 'hat_sombrero':
      return `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="17" rx="10" ry="3" fill="#D97706" stroke="#000" stroke-width="2"/><path d="M9 16c0-5 1-9 3-9s3 4 3 9" fill="#F59E0B" stroke="#000" stroke-width="2"/><path d="M4 17q4-1 8 0t8 0" stroke="#FF385C" stroke-width="1.5" fill="none"/></svg>`;
    case 'hat_police':
      return `<svg viewBox="0 0 24 24"><path d="M5 15c0-4 3-7 7-7s7 3 7 7H5z" fill="#1E3A8A" stroke="#000" stroke-width="2"/><path d="M5 15c2 2 5 3 7 3s5-1 7-3" fill="#18181B" stroke="#000" stroke-width="2"/><polygon points="12,9 13.5,12 10.5,12" fill="#FFE600"/></svg>`;

    // VIP & Currencies
    case 'vip_ad_15m':
      return `<svg viewBox="0 0 24 24" fill="#00D2FF" stroke="#000" stroke-width="2"><polygon points="13,2 4,14 11,14 9,22 20,10 13,10"/></svg>`;
    case 'vip_permanent':
      return `<svg viewBox="0 0 24 24" fill="#FFE600" stroke="#000" stroke-width="2"><polygon points="3,18 4,7 8.5,12 12,4 15.5,12 20,7 21,18"/></svg>`;
    case 'ad_coins_500':
      return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#FFDE59" stroke="#000" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="#F59E0B" stroke="#000" stroke-width="1.5"/><polygon points="12,6.5 13.7,10 17.5,10.5 14.7,13.2 15.4,17 12,15.2 8.6,17 9.3,13.2 6.5,10.5 10.3,10" fill="#FFF"/></svg>`;
    case 'gem_swap_1000':
      return `<svg viewBox="0 0 24 24"><polygon points="6,5 18,5 22,10 12,21 2,10" fill="#00D2FF" stroke="#000" stroke-width="2"/><polygon points="6,5 18,5 15,10 9,10" fill="#E0F7FA"/><polygon points="9,10 15,10 12,21" fill="#0284C7"/></svg>`;

    default:
      return `<svg viewBox="0 0 24 24" fill="#FFE600" stroke="#000" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>`;
  }
}

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

  private toastTimer?: number;

  public showCuteToast(opts: { title: string; subtitle: string; icon?: string }) {
    let toast = document.getElementById('showroom-cute-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'showroom-cute-toast';
      toast.className = 'showroom-cute-toast';
      document.body.appendChild(toast);
    }

    if (this.toastTimer) {
      window.clearTimeout(this.toastTimer);
    }

    const iconHtml = opts.icon || '🔒';
    toast.innerHTML = `
      <div class="cute-toast-icon">${iconHtml}</div>
      <div class="cute-toast-content">
        <div class="cute-toast-title">${opts.title}</div>
        <div class="cute-toast-sub">${opts.subtitle}</div>
      </div>
      <button type="button" class="cute-toast-close" aria-label="Dismiss">✕</button>
    `;

    const closeBtn = toast.querySelector('.cute-toast-close') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        toast?.classList.remove('active');
      };
    }

    toast.onclick = () => {
      toast?.classList.remove('active');
    };

    requestAnimationFrame(() => {
      toast?.classList.add('active');
    });

    sounds.playRecoil();

    this.toastTimer = window.setTimeout(() => {
      toast?.classList.remove('active');
    }, 2800);
  }

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
            <span class="tab-icon">🧢</span>
            <span class="tab-text">HATS & CAPS</span>
          </button>
          <button type="button" class="showroom-tab-btn" data-tab="vip"${ENABLE_VIP_AND_ADS ? '' : ' style="display: none;"'}>
            <span class="tab-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
              </svg>
            </span>
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

    if (tab === 'vip' && !ENABLE_VIP_AND_ADS) {
      tab = 'skins';
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
        if (ENABLE_VIP_AND_ADS) {
          this.renderVipTab(shelf);
        } else {
          this.renderSkinsTab(shelf);
        }
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

      const coinIcon = get3DGoldCoinSvg(14);
      const priceFormatted = item.currency === 'coins'
        ? `${coinIcon}${item.price.toLocaleString()}`
        : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (isEquipped) {
        btnLabel = 'EQUIPPED';
        btnClass = 'btn-white';
      } else if (isOwned) {
        btnLabel = 'EQUIP';
        btnClass = 'btn-yellow';
      } else if (isLevelLocked) {
        btnLabel = priceFormatted;
        btnClass = 'locked-level-btn';
      } else {
        btnLabel = priceFormatted;
      }

      const swatchColor = item.previewColor !== undefined
        ? `#${item.previewColor.toString(16).padStart(6, '0')}`
        : '#ffffff';

      const lockBadgeHtml = isLevelLocked
        ? `<span class="showroom-badge-tag tag-level-locked">🔒 LVL ${item.requiredLevel}</span>`
        : (item.badge ? `<span class="showroom-badge-tag">${item.badge}</span>` : '<span class="showroom-badge-tag" style="visibility: hidden;">STOCK</span>');

      card.innerHTML = `
        <div class="showroom-card-header">
          <div class="skin-swatch-circle" style="background: ${swatchColor};"></div>
          ${lockBadgeHtml}
        </div>
        <div class="showroom-card-title">${item.name}</div>
        <div class="showroom-card-desc">${item.description}</div>
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
            this.showCuteToast({
              title: `LEVEL ${item.requiredLevel} REQUIRED!`,
              subtitle: `${item.name} unlocks at Level ${item.requiredLevel} (You: Level ${economy.getLevel()}) • ${get3DGoldCoinSvg(13)}${item.price.toLocaleString()}`,
              icon: '🔒',
            });
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
            this.showCuteToast({
              title: 'CANNOT PURCHASE',
              subtitle: res.message,
              icon: '🪙',
            });
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

      const coinIcon = get3DGoldCoinSvg(14);
      const priceFormatted = item.currency === 'coins'
        ? `${coinIcon}${item.price.toLocaleString()}`
        : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (isEquipped) {
        btnLabel = 'EQUIPPED';
        btnClass = 'btn-white';
      } else if (isOwned) {
        btnLabel = isPreviewing ? 'EQUIP NOW' : 'EQUIP';
        btnClass = 'btn-yellow';
      } else if (isLevelLocked) {
        btnLabel = priceFormatted;
        btnClass = 'locked-level-btn';
      } else {
        btnLabel = priceFormatted;
      }

      const badgeHtml = item.badge
        ? `<span class="showroom-badge-tag${isLevelLocked ? ' tag-level-locked' : ''}">${item.badge}</span>`
        : '<span class="showroom-badge-tag" style="visibility: hidden;">SHADES</span>';

      card.innerHTML = `
        <div class="showroom-card-header">
          <span class="showroom-card-emoji">${item.icon}</span>
          ${badgeHtml}
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
            this.showCuteToast({
              title: `LEVEL ${item.requiredLevel} REQUIRED!`,
              subtitle: `${item.name} unlocks at Level ${item.requiredLevel} (You: Level ${currentLevel}) • ${get3DGoldCoinSvg(12)}${item.price.toLocaleString()}`,
              icon: '🔒',
            });
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
            this.showCuteToast({
              title: 'CANNOT PURCHASE',
              subtitle: res.message,
              icon: '🪙',
            });
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

      const coinIcon = get3DGoldCoinSvg(14);
      const priceFormatted = item.currency === 'coins'
        ? `${coinIcon}${item.price.toLocaleString()}`
        : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;

      let btnLabel = 'BUY';
      let btnClass = 'btn-yellow';

      if (isEquipped) {
        btnLabel = 'EQUIPPED';
        btnClass = 'btn-white';
      } else if (isOwned) {
        btnLabel = isPreviewing ? 'EQUIP NOW' : 'EQUIP';
        btnClass = 'btn-yellow';
      } else if (isLevelLocked) {
        btnLabel = priceFormatted;
        btnClass = 'locked-level-btn';
      } else {
        btnLabel = priceFormatted;
      }

      const badgeHtml = item.badge
        ? `<span class="showroom-badge-tag${isLevelLocked ? ' tag-level-locked' : ''}">${item.badge}</span>`
        : '<span class="showroom-badge-tag" style="visibility: hidden;">HAT</span>';

      card.innerHTML = `
        <div class="showroom-card-header">
          <span class="showroom-card-emoji">${item.icon}</span>
          ${badgeHtml}
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
            this.showCuteToast({
              title: `LEVEL ${item.requiredLevel} REQUIRED!`,
              subtitle: `${item.name} unlocks at Level ${item.requiredLevel} (You: Level ${currentLevel}) • ${get3DGoldCoinSvg(12)}${item.price.toLocaleString()}`,
              icon: '🔒',
            });
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
            this.showCuteToast({
              title: 'CANNOT PURCHASE',
              subtitle: res.message,
              icon: '🪙',
            });
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
        <span class="showroom-card-svg">${getStoreItemSvg({ id: 'vip_permanent' } as any)}</span>
        <span class="showroom-badge-tag ${isVip ? 'tag-green' : 'tag-yellow'}">${isVip ? 'VIP ACTIVE' : 'INACTIVE'}</span>
      </div>
      <div class="showroom-card-title">${isVip ? `ROYAL VIP (${vipRemaining})` : 'BECOME ROYAL VIP'}</div>
      <div class="showroom-card-desc">
        Golden crown badge in races & leaderboards, +50% bonus coins & XP on every lap!
      </div>
      <div class="showroom-card-hint"><svg viewBox="0 0 24 24" width="12" height="12" style="fill: #000; vertical-align: -1px; margin-right: 3px;"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>ROYAL STATUS PASS</div>
      <button type="button" class="brut-btn btn-cyan showroom-action-btn" id="btn-showroom-watch-ad">
        WATCH AD (15M FREE)
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
          ? `${get3DGoldCoinSvg(14)}${item.price.toLocaleString()}`
          : `<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align: middle;"><polygon points="6,4 18,4 22,9 12,21 2,9" fill="#00D2FF" stroke="#000" stroke-width="2"/></svg> ${item.price}`;
      }

      const badgeHtml = item.badge
        ? `<span class="showroom-badge-tag">${item.badge}</span>`
        : '<span class="showroom-badge-tag" style="visibility: hidden;">BUNDLE</span>';

      card.innerHTML = `
        <div class="showroom-card-header">
          <span class="showroom-card-svg">${getStoreItemSvg(item)}</span>
          ${badgeHtml}
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
          this.showCuteToast({
            title: 'CANNOT PURCHASE',
            subtitle: res.message,
            icon: '🪙',
          });
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

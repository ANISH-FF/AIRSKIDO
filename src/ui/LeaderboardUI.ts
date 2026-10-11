/**
 * LeaderboardUI.ts — User Interface Controller for Time Sprint Top 100
 * 
 * Manages:
 * 1. Compact Showroom Lobby Widget (Top 3 records + Player PB row).
 * 2. Fullscreen / Centered Top 100 Modal with live search & gap telemetry.
 */

import { leaderboard, LeaderboardEntry, LeaderboardTrack } from '../core/Leaderboard';
import { sounds } from '../core/Sound';

export class LeaderboardUI {
  private compactContainer: HTMLElement | null = null;
  private modalEl: HTMLElement | null = null;
  private tableBody: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private allEntries: LeaderboardEntry[] = [];
  private currentTrack: LeaderboardTrack = 'classic';

  constructor() {
    this.compactContainer = document.getElementById('lobby-leaderboard-dock');
    this.modalEl = document.getElementById('leaderboard-modal');
    this.tableBody = document.getElementById('lb-table-body');
    this.searchInput = document.getElementById('lb-search-input') as HTMLInputElement | null;

    this.bindEvents();

    // Initial data load
    this.allEntries = leaderboard.getEntries(this.currentTrack);
    this.renderCompactWidget(this.allEntries);

    // Listen to Leaderboard core updates
    leaderboard.addListener((entries, track) => {
      if (track === this.currentTrack) {
        this.allEntries = entries;
        this.renderCompactWidget(entries);
        if (this.modalEl && this.modalEl.style.display !== 'none') {
          this.renderModalTable(this.getFilteredEntries());
        }
      }
    });
  }

  private bindEvents() {
    // Dock track tabs
    const dockTabs = document.getElementById('lb-dock-tabs');
    if (dockTabs) {
      const btns = dockTabs.querySelectorAll<HTMLButtonElement>('.lb-tab-btn');
      btns.forEach((btn) => {
        btn.onclick = () => {
          const track = btn.dataset.track as LeaderboardTrack;
          if (track) this.switchTrack(track);
        };
      });
    }

    // Modal track tabs
    const modalTabs = document.getElementById('lb-modal-tabs');
    if (modalTabs) {
      const btns = modalTabs.querySelectorAll<HTMLButtonElement>('.lb-modal-tab-btn');
      btns.forEach((btn) => {
        btn.onclick = () => {
          const track = btn.dataset.track as LeaderboardTrack;
          if (track) this.switchTrack(track);
        };
      });
    }

    // Open Full Leaderboard Modal button
    const openBtn = document.getElementById('btn-open-full-leaderboard');
    if (openBtn) {
      openBtn.onclick = () => this.openModal();
    }

    // Close Modal triggers
    const closeBtn = document.getElementById('btn-close-leaderboard');
    if (closeBtn) {
      closeBtn.onclick = () => this.closeModal();
    }

    const closeBtnDone = document.getElementById('btn-close-leaderboard-done');
    if (closeBtnDone) {
      closeBtnDone.onclick = () => this.closeModal();
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.closeModal();
        }
      });
    }

    // Live Search Filter
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        this.renderModalTable(this.getFilteredEntries());
      });
    }
  }

  public switchTrack(track: LeaderboardTrack) {
    if (this.currentTrack === track) return;
    sounds.playSelect();
    this.currentTrack = track;
    leaderboard.setActiveTrack(track);
    leaderboard.fetchRemoteLeaderboard(track);

    // Update active class in dock tabs
    document.querySelectorAll('#lb-dock-tabs .lb-tab-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.track === track);
    });

    // Update active class in modal tabs
    document.querySelectorAll('#lb-modal-tabs .lb-modal-tab-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.track === track);
    });

    this.allEntries = leaderboard.getEntries(track);
    this.renderCompactWidget(this.allEntries);
    if (this.modalEl && this.modalEl.style.display !== 'none') {
      this.renderModalTable(this.getFilteredEntries());
    }
  }

  // ── 1. COMPACT LOBBY WIDGET RENDERING ───────────────────────────────
  private renderCompactWidget(entries: LeaderboardEntry[]) {
    if (!this.compactContainer) return;

    const top3 = entries.slice(0, 3);
    const rowsContainer = document.getElementById('lb-compact-rows');
    if (rowsContainer) {
      rowsContainer.innerHTML = '';

      top3.forEach((e) => {
        const row = document.createElement('div');
        row.className = `lb-compact-row ${e.isCurrentPlayer ? 'highlight-me' : ''}`;

        const rankClass = e.rank === 1 ? 'rank-gold' : e.rank === 2 ? 'rank-silver' : 'rank-bronze';

        row.innerHTML = `
          <div class="lb-pilot-group">
            <span class="lb-rank-badge ${rankClass}">#${e.rank}</span>
            <span class="lb-pilot-name" title="${e.username}">${e.username}</span>
          </div>
          <span class="lb-time-text">${e.formattedTime}</span>
        `;
        rowsContainer.appendChild(row);
      });
    }

    // Player personal best footer
    const playerFooterVal = document.getElementById('lb-player-footer-val');
    if (playerFooterVal) {
      const pb = leaderboard.getPlayerBest(this.currentTrack);
      if (pb.timeSeconds !== null) {
        playerFooterVal.textContent = `#${pb.rank} • ${pb.formattedTime}`;
      } else {
        playerFooterVal.textContent = 'NO RECORD YET (RACE NOW!)';
      }
    }
  }

  // ── 2. FULL TOP 100 MODAL RENDERING ─────────────────────────────────
  public openModal() {
    sounds.playSelect();
    if (this.searchInput) {
      this.searchInput.value = '';
    }

    // Sync active tabs in modal
    document.querySelectorAll('#lb-modal-tabs .lb-modal-tab-btn').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.track === this.currentTrack);
    });

    leaderboard.fetchRemoteLeaderboard(this.currentTrack, true);
    this.allEntries = leaderboard.getEntries(this.currentTrack);
    this.renderModalTable(this.getFilteredEntries());
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
    }
  }

  public closeModal() {
    sounds.playSelect();
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  private getFilteredEntries(): LeaderboardEntry[] {
    const q = (this.searchInput?.value || '').trim().toLowerCase();
    if (!q) return this.allEntries;
    return this.allEntries.filter(
      (e) =>
        e.username.toLowerCase().includes(q) ||
        e.playerId.toLowerCase().includes(q)
    );
  }

  private renderModalTable(entries: LeaderboardEntry[]) {
    const tbody = this.tableBody;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (entries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 24px; color: #64748B; font-weight: 700;">
            NO MATCHING RACERS FOUND
          </td>
        </tr>
      `;
      return;
    }

    const leaderTime = entries.length > 0 ? entries[0].timeSeconds : 0;

    entries.forEach((e) => {
      const tr = document.createElement('tr');
      const rowRankClass = `row-rank-${e.rank}`;
      tr.className = `${e.isCurrentPlayer ? 'row-player' : ''} ${rowRankClass}`.trim();

      const rankBadgeClass =
        e.rank === 1 ? 'rank-gold' : e.rank === 2 ? 'rank-silver' : e.rank === 3 ? 'rank-bronze' : 'rank-other';

      const gapText =
        e.rank === 1
          ? 'LEADER'
          : `+${(e.timeSeconds - leaderTime).toFixed(2)}s`;

      const cleanPlayerId = String(e.playerId || '').replace(/^AS-?/i, '');

      tr.innerHTML = `
        <td class="td-rank">
          <span class="lb-rank-badge ${rankBadgeClass}">#${e.rank}</span>
        </td>
        <td class="td-pilot">
          <strong>${e.username}</strong>
          <span class="pilot-id-sub">#${cleanPlayerId}</span>
        </td>
        <td class="td-time">${e.formattedTime}</td>
        <td class="td-gap">${gapText}</td>
      `;

      tbody.appendChild(tr);
    });
  }
}

export let leaderboardUI: LeaderboardUI;

export function initLeaderboardUI(): LeaderboardUI {
  if (!leaderboardUI) {
    leaderboardUI = new LeaderboardUI();
  }
  return leaderboardUI;
}


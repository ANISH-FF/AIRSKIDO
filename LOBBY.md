# AIRSKID // LOBBY OVERHAUL & MONETIZATION BLUEPRINT
> **Document Purpose:** Complete blueprint for commercial lobby UI overhaul, monetization (Ads & Micro-transactions), and in-game economy inspired by *Smash Karts*. To be executed after core gameplay modes (including Hardcore Mode) are complete.

---

## 1. Visual & Layout Comparison

| Feature | Reference (*Smash Karts*) | AirSkid Target Layout |
| :--- | :--- | :--- |
| **Top-Left Identity** | Level Bar (XP) + 3 Currencies (Coins, Gems, Tickets) | Level Pill (XP progress) + Coins 🪙 + Gems 💎 |
| **Top-Right Monetization** | 🛍️ Shop + 🎬 "Free" Video Ad + 🎡 Daily Spin + 🚫 "Remove Ads" | 🛍️ Shop + 🎬 "Free Coins" + 🎡 Lucky Spin + 🚫 "Remove Ads" |
| **Right Side Ad Slot** | 300x600 Standard Skyscraper Display Ad (e.g. GoDaddy) | Clean 300x600 Dedicated `#ad-banner-container` |
| **Bottom Navigation** | ⚙️ Settings + 🌍 Server Region + 🖥️ Fullscreen + 💬 Discord | ⚙️ Settings Modal + 🖥️ Fullscreen + 💬 Community/Discord |
| **Left Sidebar** | 🎨 Customize Button + 👤 Login Banner + 📢 Event News | 🎨 Customize / Skin Selector + 👤 Game ID Login + 📢 News Card |
| **Center Stage** | 3D Kart on Turntable + Big PLAY + Create/Join Rooms | 3D Sky Island Turntable + PLAY SOLO / HARDCORE / MULTIPLAYER |

---

## 2. Web Game Monetization Blueprint (How We Earn)

### A. Rewarded Video Ads (Highest Earner — 65% of Total Revenue) 💰
- **Concept:** Players voluntarily watch a 15–30 second video ad in exchange for in-game perks.
- **Placements:**
  1. Top-Right **"🎬 Free Coins (+100)"** button (max 5 per day).
  2. Post-Race Podium: **"Double Coins (2X)"** watch button.
  3. **Daily Lucky Wheel Spin:** 1 free spin per day; extra spins by watching an ad.
- **Target CPM:** ₹150 – ₹600 ($2.00 – $7.50 USD per 1,000 completed views).
- **Ad Networks:**
  - **AdinPlay** (Top network for .io and 3D web games, used by Smash Karts and Krunker).
  - **CrazyGames / GameDistribution SDK** (Turn-key SDK with automated rewarded video and preroll ads).
  - **Google AdSense for Games (H5 Games)**.

### B. Display Banner Ads (Passive Earning — 25% of Total Revenue)
- **Placements:**
  1. **Lobby Right Sidebar:** 300x600 Skyscraper banner (only active in Lobby, never during the race!).
  2. **Race Over / Standings Card:** 300x250 Medium rectangle banner below the winner podium.
- **Safety Rule:** ZERO banner ads during active racing gameplay to guarantee 60+ FPS and zero player frustration.

### C. Paid Passes & In-App Purchases (Direct Cash — 10% of Total Revenue) 💳
- **"VIP Pass / Remove Ads" (₹49 or ₹99 One-Time):**
  - Permanently removes all display banners and forced interstitial ads.
  - Grants a special Gold Crown VIP badge next to player's gamer tag.
  - Grants 250 bonus Gems.
- **Exclusive Cosmetic Skins (Never Pay-to-Win!):**
  - Mythic Kart models (e.g., 'CYBER DRAGON', 'PHANTOM STEALTH').
  - Custom wheel drift smoke effects (Rainbow Smoke, Electric Flame trails).
- **Payment Gateway Integration:**
  - Web checkout via **Razorpay / Cashfree / Stripe** (Instant 1-click UPI QR Code, GPay, PhonePe, Cards).

---

## 3. Architecture & Implementation Specification

### A. Modular `AdManager.ts`
```typescript
export class AdManager {
  private isAdsRemoved: boolean = false;
  
  public init(publisherId: string): void;
  public showLobbyBanner(containerId: string): void;
  public hideLobbyBanner(): void;
  public showPodiumBanner(containerId: string): void;
  public showRewardedAd(onReward: () => void, onError?: () => void): void;
}
```
*Benefits:* During development and testing, `AdManager` runs in mock mode (showing clean placeholder artwork / tips). When live credentials are added, it enables production ads with 0 code changes.

### B. In-Game Economy (`EconomyManager.ts`)
- Stored safely in `localStorage` (with optional cloud sync when Firebase is connected):
  - `coins: number` (Earned: 1st place = +50, 2nd = +30, 3rd = +15, Lap = +5).
  - `gems: number` (Earned from rewarded ads or VIP pass).
  - `level: number` (Level 1 to 50).
  - `xp: number` (XP to next level).
  - `unlockedKarts: string[]`.
  - `isVip: boolean`.

### C. Comprehensive ⚙️ Settings Modal
- **Audio Controls:**
  - Master Volume Slider (0% – 100%).
  - Engine Pitch & Sound Slider.
  - Sound FX (Drift, Nitro, Collisions) Slider.
- **Graphics Quality:**
  - Performance Mode (Locked 60 FPS on low-end mobile devices).
  - High Quality (Dynamic shadows & higher resolution).
- **Controls Reference & Rebinds:**
  - PC keyboard mappings (WASD, Arrows, Space, Shift, R).
  - Mobile touch sensitivity.

---

## 4. Execution Plan (Post-Core Gameplay)
1. Build `EconomyManager.ts` (XP, Coins, Gems, LocalStorage persistence).
2. Construct Smash Karts HTML/CSS layout (Top bar currencies, 300x600 right ad slot, bottom bar settings).
3. Build Settings Modal with audio & graphics toggles.
4. Implement `AdManager.ts` with mock fallbacks ready for production ad tags.
5. Create Shop & Customize previews for karts and trails.

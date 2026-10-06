# Airskido Sound Standards & Audio Mixing Matrix (`SOUND.md`)

## 1. Executive Summary & Design Philosophy
Airskido audio is engineered following standard AAA arcade racing audio guidelines (similar to *Mario Kart 8 Deluxe*, *Need for Speed*, *Asphalt 9*).

### The Golden Rule: Acoustic Hierarchy at 100% Device Volume
- **Zero Ear Fatigue:** Even if a player plays with their headphones or device volume at **100%**, the game must feel silky smooth, warm, exciting, and punchy — never piercing, screeching, or causing acoustic shock.
- **Dynamic Headroom:** Persistent background sounds (Engine) must sit gently underneath action events.
- **Skill Events (Drift, Nitro, Smash):** Must feel rewarding and crisp, but properly clamped so they do not blast through the player's ears with sudden transients.
- **Untouchable Core (Lobby & Coins):** Lobby music/UI clicks, carousel select, and coin collect chimes are locked as "Perfect".

---

## 2. Audio Category Breakdown & Gain Target Standards

| Category | Typical Frequency Focus | Target Mix Level | Peak Gain Limit | Dynamic Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Engine (Ambient Bed)** | 50 Hz – 4,600 Hz | -12 dB to -8 dB | **0.32 max** | Smooth flywheel inertia, ducks by 22% during drifts |
| **Drift / Tire Screech** | 1,000 Hz – 7,500 Hz | -3 dB to 0 dB | **2.20 max** | Hero skill action, full acoustic presence |
| **Nitro Boost SFX** | 32 Hz – 850 Hz | -6 dB to -3 dB | **0.52 max** | 20% calibrated reduction; warm sub NOS blast + smooth jet whoosh (zero harsh turbine screech) |
| **Crash / Impact SFX** | 34 Hz – 750 Hz | -6 dB to -4 dB | **0.68 max** | 20% calibrated reduction; organic bumper thud + damped chassis vibration (100% free of synthetic sine beeps) |
| **Countdown (3, 2, 1, GO)** | 440 Hz – 1,800 Hz | -8 dB to -5 dB | **0.27 / 0.24** | 15% calibrated reduction; gentle arcade guide blips, pleasant fanfare |
| **Lobby & UI / Coins** | 600 Hz – 2,000 Hz | -10 dB to -6 dB | **0.18 – 0.24** | **LOCKED (Perfect, untouched)** |

---

## 3. In-Game SFX Audit: Implemented Balanced Standards

### A. Nitro Turbo Boost (`playBoost`)
- **Fix Applied:** Dropped gain by exactly **20%** from `0.65` down to **`0.52`**.
- **Acoustic Redesign:** Softened high turbine screech harmonics and elevated warm jet whoosh and sub-bass NOS body ($32\text{ Hz} \to 850\text{ Hz}$). Silky smooth, punchy, zero ear piercing.

### B. Crash & Obstacle Collision Impact (`playCrash`)
- **Fix Applied:** Removed artificial synthetic sine chimes and harsh friction treble.
- **Acoustic Redesign (Warm Bass Bumper Thud):**
  - Primary warm bumper thud dropping from $190\text{ Hz} \to 78\text{ Hz}$.
  - Deep sub-bass chassis weight dropping from $110\text{ Hz} \to 58\text{ Hz}$ for rich tactile mass.
  - Low-mid kart frame resonance at $135\text{ Hz}$.
  - 2-pole smooth low-pass contact friction ($<550\text{ Hz}$, zero harsh treble sizzle).
- **Mix Level:** Calibrated gain `0.48 – 0.82` max with master limiter protection.

### C. Countdown Beeps (`playCountdown`)
- **Fix Applied:** 15% subtle reduction for zero ear shock.
- **Levels:** `3, 2, 1` blip reduced from $0.32 \to \mathbf{0.27}$, `GO!` fanfare reduced from $0.28 \to \mathbf{0.24}$.

### D. Fall Off Track (`playFall`) & Respawn (`playRespawn`)
- **Fix Applied:** 15% subtle reduction.
- **Levels:** Fall drop reduced from $0.35 \to \mathbf{0.30}$, Respawn shimmer reduced from $0.20 \to \mathbf{0.17}$.

### E. Arena Smash Hit (`playSmash`)
- **Fix Applied:** 15% subtle reduction.
- **Levels:** Sub drop reduced from $0.35 \to \mathbf{0.30}$, bell confirmation harmonic from $0.25 \to \mathbf{0.21}$.

### F. Nitro Canister Collect (`playNitro`)
- **Fix Applied:** 15% subtle reduction.
- **Levels:** Double ping reduced from $0.28 \to \mathbf{0.24}$.

### G. Engine & Drift (Locked & Untouched)
- **Engine:** `0.14` idle $\to$ `0.32` peak under throttle (Smooth luxury sports-car purr, 2400 Hz – 4600 Hz warm contour).
- **Drift (`drift.mp3`):** `1.45` to `2.40` with 22% engine ducking. Hero sound of the race.

### H. UI & Lobby (Locked & Untouched)
- `playSelect()` (Car select): `0.18` (Untouched)
- `playCoin()` (Coin collect): `0.24` (Untouched)
- Lobby theme & button clicks: (Untouched)

---

## 4. Master Limiter & Anti-Clipping Protection
- A dynamic soft-knee compressor/limiter is integrated into the Web Audio graph before destination:
  - **Threshold:** -2 dBFS
  - **Knee:** 6 dB
  - **Ratio:** 8:1
  - **Attack:** 0.003s
  - **Release:** 0.15s
- **Guarantee:** Even if Nitro, Drift, and Collision happen simultaneously at 100% volume, the master audio will NEVER clip, crackle, or distort.

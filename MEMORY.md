# AIRSKID RACING // PROJECT SYSTEM MEMORY & CORE ARCHITECTURAL RULES

> **CRITICAL ARCHITECTURAL DIRECTIVE — READ BEFORE TOUCHING ANY CAR, UI, OR LEADERBOARD CODE**

---

## 1. 🏎️ SINGLE CAR ARCHITECTURE (NO MULTIPLE CAR MODELS)

### **THE CORE RULE:**
There is **STRICTLY ONE AND ONLY ONE CAR** in Airskid Racing. 
Multiple car models/machines **DO NOT EXIST**.

### **HISTORICAL CONTEXT (WHAT NOT TO RE-INTRODUCE):**
In early prototype builds, there were placeholder names and configurations for different car models (such as `APEX`, `GOLIATH`, `KITSUNE`, `VOLT`, `PHANTOM`, `TITAN`, `CRUSHER`, `LIGHTNING`).
**ALL OF THESE HAVE BEEN PERMANENTLY REMOVED.**
Do **NOT** under any circumstances re-introduce or display car model names anywhere in the game!

### **WHAT CUSTOMIZATION ACTUALLY IS:**
Customization in Airskid is **100% COSMETIC ONLY**, applied directly onto the single unified car chassis:
1. **Paints & Liveries (Skins):** E.g., Factory Stock, Magma Inferno, Neon Cyberpunk, 24K Royal Gold, Stealth Carbon, Arcadia Pearl.
2. **Chasma & Shades (Glasses):** E.g., Pixel Thug Life, Cyber Visor, Aviators, Retro Star, Heart Eyes.
3. **Drift Particle Trails:** E.g., Golden Spark, Neon Cyan, Plasma Violet, Crimson Fire.
4. **Royal VIP Status:** Golden Crown Nametag & 1.5x multiplier.

---

## 2. 🏁 FINISH SCREEN & LEADERBOARD RULES

### **NO "KART" OR "MACHINE" COLUMNS:**
- The Finish Modal results table (`#results-table`) must **ONLY** have 3 columns:
  1. **POS** (`#1`, `#2`, etc.)
  2. **RACER** (Pilot Callsign + VIP/AI/P2P tag)
  3. **TIME** (Exact completion time `00:36.42s` + split delta `+1.14s`)
- **NEVER** add a `KART` column or display `"KART-PLAYER"`, `"APEX"`, `"VOLT"`, etc.

### **LEADERBOARD ENTRIES:**
- The Global Time Sprint Leaderboard (both `NORMAL` and `HARDCORE` tracks) displays:
  - **Rank** (`#1`, `#2`, `#3`...)
  - **Pilot Callsign & ID** (`Speedster #AS-123456`)
  - **Lap Time** (`00:34.82s`)
  - **Split** (`LEADER`, `+0.82s`)
- **NO KART TAGS**: Do not display kart badges (`.lb-kart-tag`) or filter by kart model names.

---

## 3. 👥 MULTIPLAYER & LOBBY PODIUM ROSTER

- Lobby player cards (`.mp-podium-card`) must **NEVER** show a machine tag (`.kart-label`).
- If an equipped skin is active, show only the cosmetic livery/skin name (`.skin-label`).
- All players, AI bots, and remote peers share the same universal racing chassis.

---

## 4. 🗄️ DATABASE & CLOUD CLEANLINESS

- Do not expose backend/cloud implementation details (e.g. "Firecloud", internal database IDs, raw entity keys) in player-facing UI.
- All user-facing UI must remain purely arcade, stylish Neo-Brutalist, and immersive.

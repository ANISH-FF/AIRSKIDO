# AirSkid Racing // Time Sprint Hall of Fame Scalability Solutions

This document outlines the architectural blueprints for scaling the **Time Sprint Global Leaderboard (Hall of Fame)** to support from 50,000 up to 1,000,000+ (1 Million) active players while staying **100% free or near-zero cost**.

---

## 📌 Problem Analysis: Why Default Firestore Fails at Scale

In the initial implementation:
* **The Read Bottleneck:** Each time a player views the Hall of Fame in the lobby, the client queries `limit(100)` documents from `leaderboards_time_sprint`. That consumes **100 document reads per view**.
* **Free Tier Quota:** Firebase Spark (Free) plan allows **50,000 reads/day**.
  $$\frac{50,000 \text{ reads}}{100 \text{ docs/view}} = 500 \text{ views per day}$$
  At just 500 leaderboard views, the daily free quota is completely depleted, throwing `RESOURCE_EXHAUSTED` errors.
* **1 Million Player Scale:** 1,000,000 players opening the lobby 3 times/day would cause **300 Million document reads/day**, leading to significant server bills if unmanaged.

---

## 🌟 OPTION 1: The "Single-Doc Snapshot" Architecture
> **Best for:** Immediate implementation within existing Firebase setup (Zero new services or servers required).  
> **Capacity:** **50,000+ Daily Active Users (100x improvement on Free Tier)**.  
> **Cost:** **$0.00 (100% Free within Firebase Spark Plan)**.

### How It Works:
Instead of saving each player's PB as an independent document in a large collection and reading 100 separate documents on every lobby load:
1. **Aggregated Document Storage:**
   We store the **entire Top 100 array** inside a single Firestore document:
   - `doc(db, 'leaderboard_snapshots', 'classic_top100')`
   - `doc(db, 'leaderboard_snapshots', 'hardcore_top100')`
   *(Firestore allows up to 1 MB per document; an array of 100 players takes ~5 KB, easily fitting within limits).*
2. **Single Read per View:**
   When a player opens the lobby or modal, the client reads **1 single document**.
   $$\frac{50,000 \text{ daily free reads}}{1 \text{ read per view}} = \mathbf{50,000 \text{ leaderboard views / day}}$$
3. **Record Submission Logic:**
   - **Personal Best Doc:** Each player still writes their individual PB to `users_pbs/{playerId}` (handles up to 20,000 free writes/day).
   - **Snapshot Updater:** If the player's new PB is faster than the current #100 record in the snapshot, the snapshot document is updated with the new sorted array.
4. **Client-Side Cooldown Cache:**
   The client caches the snapshot in memory/`localStorage` for **3 to 5 minutes**. A player switching tabs 20 times in a session only fires 1 network read.

---

## ⚡ OPTION 2: Cloudflare Workers + Edge KV / Static CDN
> **Best for:** Commercial scale of **1 Million to 10 Million+ players**.  
> **Capacity:** **Unlimited Reads, 100,000 Writes/day on Free Tier**.  
> **Cost:** **$0.00 (Cloudflare Free Tier)**.

### How It Works:
This approach completely decouples leaderboard reads from traditional database reads by serving a static, edge-cached JSON snapshot.

### Architecture Diagram:
```
[1,000,000+ Players]
        │
        ▼ (GET /api/leaderboard)
[Cloudflare Edge CDN] ─── (Cache Hit: 99.9%) ───► Returns top100.json in <20ms (FREE)
        │
        ▼ (POST /api/submit-record on new PB)
[Cloudflare Worker]
        │
        ├─► Validates theoretical physics floor (time > 8.0s)
        ├─► Compares against #100 rank in Cloudflare KV
        └─► Updates Cloudflare KV & invalidates CDN cache
```

### Key Advantages:
1. **Unlimited Free Reads:** Cloudflare does not charge for static edge bandwidth or cached requests. Even 100 Million leaderboard views cost **₹0**.
2. **Instant Global Latency:** The JSON snapshot is distributed across 300+ global Cloudflare edge cities, giving players sub-30ms load times anywhere in the world.
3. **Built-in Rate Limiting & Anti-DDoS:** Prevents spam and bot attacks automatically.

### API Endpoints:
* `GET https://race-api.yourdomain.com/leaderboard?track=classic`
  - Headers: `Cache-Control: public, max-age=60, s-maxage=300`
  - Response: Static JSON containing top 100 ranked records.
* `POST https://race-api.yourdomain.com/submit`
  - Body: `{ playerId, username, timeSeconds, track, signature }`
  - Action: Validates physics constraints, inserts into sorted array, updates edge cache.

---

## 🛡️ Complementary Safeguards for Both Options

1. **Double-Submission Prevention:**
   Eliminate duplicate calls between `onLapComplete` and `finishRace` in `src/main.ts` so only 1 network write occurs upon race completion.
2. **Impossible Physics Floor (< 8.0s):**
   Reject any submission faster than the theoretical physics limit of the track (< 8.0s) to block script injection while allowing legitimate pro runs (e.g., 17s - 18s).
3. **Strict Firestore Rule Security (If using Option 1):**
   ```javascript
   match /leaderboards_time_sprint/{playerId} {
     allow read: if true;
     allow write: if request.resource.data.timeSeconds >= 8.0
                  && (!resource.data.timeSeconds || request.resource.data.timeSeconds < resource.data.timeSeconds);
   }
   ```

# AIRSKID MULTIPLAYER ARCHITECTURE & HOST MIGRATION SPECIFICATION

This document details the production networking architecture, connection lifecycle, and the **Lightweight Host Migration Protocol** implemented for the AirSkid browser multiplayer racing engine.

---

## 1. Network Topology & Signaling Overview

AirSkid employs a high-performance **WebRTC Peer-to-Peer (DataChannel / SCTP)** architecture rather than a centralized cloud-hosted dedicated game server:

- **Signaling Layer:** WebRTC SDP offer/answer handshakes are negotiated via PeerJS signaling (`0.peerjs.com`). The room code (`AERO-XXXXX`) acts as the direct lookup key.
- **NAT / Firewall Traversal:** Guaranteed mobile CGNAT & symmetric firewall traversal using Google STUN clusters (`stun:stun.l.google.com:19302`) and Metered TURN relays (`turn:relay.metered.ca:80`).
- **Data Transmission Topology (Star Relay):**
  - The Room Creator acts as the **Host Relay**.
  - All joining guests connect to the Host via encrypted WebRTC DataChannels (`reliable: true` for state/events, fixed 30Hz for kart transforms).
  - **Bandwidth Efficiency:** In an 8-player room, each guest maintains exactly **1 connection**, while the Host maintains **7 connections**. Total active network links = 7 (compared to 28 links in full mesh), preserving mobile device battery and preventing thermal CPU throttling.

```
                  ┌──────────────┐
                  │   GUEST 01   │
                  └──────┬───────┘
                         │ (WebRTC)
                         ▼
┌──────────────┐  WebRTC ┌──────────────┐  WebRTC ┌──────────────┐
│   GUEST 02   │◄───────►│  HOST RELAY │◄───────►│   GUEST 03   │
└──────────────┘         └──────────────┘         └──────────────┘
                         ▲
                         │ (WebRTC)
                  ┌──────┴───────┐
                  │   GUEST 04   │
                  └──────────────┘
```

---

## 2. Room Lifecycle & "Zero Ghost Room" Guarantee

A common concern in multiplayer web games is whether empty or abandoned rooms remain alive in the background on servers:

1. **No Cloud Instance Waste:** There is NO central Node.js or C++ game process running in the cloud. The "Server" is the **Host's local browser tab itself**.
2. **Instant Destruction:** When the Host closes their browser tab, refreshes, or leaves the room:
   - WebRTC DataChannels are closed immediately.
   - `peer.destroy()` unregisters the room ID from the signaling cluster.
   - The room disappears from the internet in sub-millisecond time.
3. **Post-Match Idle State:** When a race finishes (`GameState.FINISHED`), the 30Hz transform streaming loop stops immediately. No packets are sent while racers inspect the leaderboard, eliminating unnecessary mobile data and CPU drain.

---

## 3. Lightweight Host Migration Protocol

If the Host's Wi-Fi drops, battery dies, browser tab crashes, or they accidentally close the page mid-race, **the game does NOT terminate for the other players**. Instead, AirSkid triggers an automatic, deterministic **Host Migration**.

```
[ HOST DROPS ] ──► [ DETECTED VIA WebRTC CLOSE ]
                          │
                          ▼
            [ DETERMINISTIC ELECTION ]
       (Next-in-line guest in lobbyPlayers)
       ┌──────────────────┴──────────────────┐
       ▼                                     ▼
[ ELECTED NEW HOST ]               [ REMAINING GUESTS ]
Promotes self (isHost = true)      Wait 150ms backoff
Listens on peer.on('connection')   Connect to New Host's Peer ID
Purges old host 3D car             Purge old host 3D car
Broadcasts updated lobby_sync      Resume 30Hz transforms
RACE CONTINUES SEAMLESSLY!         RACE CONTINUES SEAMLESSLY!
```

### Deterministic Election Algorithm
Every client maintains an identical, synchronized `lobbyPlayers` roster ordered by join sequence:
```ts
// 1. Remove old disconnected host
this.lobbyPlayers = this.lobbyPlayers.filter((p) => p.peerId !== oldHostPeerId);

// 2. Deterministic: The oldest active guest (index 0) becomes the New Host
const newHostInfo = this.lobbyPlayers[0];
newHostInfo.isHost = true;
const isMeNewHost = newHostInfo.peerId === this.myPeerId;
```
Because all peers evaluate the exact same roster, every client elects the **exact same New Host simultaneously** with zero split-brain ambiguity.

### Handshake & Re-Routing Mechanics
1. **The Elected Host:**
   - Sets `this.isHost = true`.
   - Starts listening for incoming guest connections on its existing Peer instance:
     `this.peer.on('connection', (conn) => this.handleIncomingConnection(conn));`
   - Emits `onHostMigrated(newHostInfo, true)`.
   - Displays HUD alert: `HOST MIGRATED // YOU ARE NOW ROOM HOST!`.
2. **The Remaining Guests:**
   - Wait 150ms backoff to allow the new host's socket to enter listening state.
   - Automatically establish a direct connection to the new host's `peerId`:
     `const newConn = this.peer.connect(newHostInfo.peerId, { reliable: true });`
   - Send `{ type: 'player_join', player: selfInfo }` upon connection.
   - Display HUD alert: `HOST MIGRATED // NEW HOST: [PILOT NAME]`.
3. **Recursive Safety:**
   - If the new host disconnects later, the election recurses to the next player. The room survives until the final remaining player leaves.

---

## 4. Entity Lifecycle & Memory Safety (Rule Compliance)

### Dynamic Disconnect Cleanup (`onPlayerLeft`)
When any player drops (Host or Guest) during an active race or rumble match:
1. **Three.js Scene:** `engine.scene.remove(remote.kart.group)`.
2. **Rapier Physics:** `physics.world.removeRigidBody(remote.kart.rigidBody)`.
3. **GPU VRAM Cleanup:** Both `CanvasTexture.dispose()` and `SpriteMaterial.dispose()` are called on the player's 3D Brutalist name tag to prevent WebGL memory leaks.
4. **Data Structures:** Removed from `remoteRacers`, `allKarts`, `checkpoints.racers`, and `rumbleManager.racers`.
5. **No Ghost Karts:** Zero orphaned rigid bodies or frozen cars remain on the track.

### Rematch Authority (`restartBtn`)
- **Singleplayer:** Standard local race reset.
- **Multiplayer Guest:** "WAITING FOR HOST..." (disabled; clicks prompt "WAITING FOR HOST TO START REMATCH").
- **Multiplayer Host:** "REMATCH (START ALL)" -> Host broadcasts `start_countdown` with synchronized network timestamp, closing all modals and launching all peers into the new match simultaneously.

---

## 5. Packet Protocol Reference

| Packet Type | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `lobby_sync` | Host ➔ Guests | `players, laps, mode, rumbleRule, rumbleFormat` | Full authoritative staging room roster & game rules. |
| `player_join` | Guest ➔ Host | `player: RemotePlayerInfo` | Initial handshake with kart type, skin ID, and squad. |
| `player_left` | Host ➔ Guests | `peerId: string, name?: string` | Broadcasted by Host when a guest drops so all clients remove the kart and display the HUD alert. |
| `team_change` | Peer ➔ Host ➔ All | `peerId, team: 'frost' \| 'blaze'` | Sky Rumble squad toggle (Frost vs Blaze). |
| `start_countdown`| Host ➔ Guests | `startTime, laps, mode, ...` | Synchronized countdown trigger timestamp ($T = \text{now} + 3200\text{ms}$). |
| `kart_transform` | Peer ➔ Host ➔ All | `RemoteKartTransform (x, y, z, qx, qy, qz, qw, linvel, ...)` | Quantized 30Hz transform stream for Hermite interpolation. |
| `race_first_finish`| Peer ➔ Host ➔ All | `winnerPeerId, winnerName, countdownSeconds` | Star-relayed 20-second finish countdown trigger. |
| `room_closed` | Host ➔ Guests | `reason?: string` | Graceful shutdown when all players exit. |
| `smash` | Peer ➔ Target | `targetPeerId, impulseX, impulseY, impulseZ` | Combat impulse packet for ballistic sky ejections and bumps. |

---

## 6. Zero Sticker / Emoji Design System

All multiplayer UI components strictly adhere to the Neo-Brutalist Brutopia design system:
- **Zero Emojis:** No unicode emojis (`🏎️`, `⚔️`, `💀`, `⏱️`, `❄️`, `🔥`, `👑`, `📋`, `🚀`) in headings, tags, or buttons.
- **Typography:** High-contrast uppercase text badges (`[HOST]`, `[YOU]`, `[READY]`, `[SQUAD 01]`, `[SQUAD 02]`).
- **Icons:** Crisp vector SVGs with 2.5px solid black borders and 3.5px drop shadows (`3.5px 3.5px 0 #000`).
- **Dual Mode Staging:**
  - *Standard Modes:* Dynamic Elastic Roster with single `[+ INVITE RACER]` card.
  - *Sky Rumble TDM:* Two-column Versus Split Deck (`FROST` vs `BLAZE`) with centered `VS` divider.

---

## 7. 6-Minute AFK Inactivity Watchdog (Staging Lobby)

To prevent orphaned rooms and unused peer connections from remaining open indefinitely when players leave browser tabs unattended:
1. **Scope:** Active solely during the multiplayer staging lobby (`GameState.MENU` with active room code). Inactive during live races.
2. **Activity Resets:** Any player interaction instantly resets the AFK timer to 0:
   - Pointer events (`pointerdown`, `pointermove`)
   - Keyboard events (`keydown`)
   - Touch gestures (`touchstart`)
   - Scroll wheel (`wheel`)
   - Squad changes (`JOIN FROST`, `JOIN BLAZE`)
   - Roster changes (new player joins or leaves via `net.onLobbyUpdated`)
3. **Inactivity Warning at 5:30:** At 330 seconds (5m 30s) of zero user input, a prominent HUD alert displays: `AFK WARNING // ROOM CLOSING IN 30 SECONDS` with an audio cue.
4. **Clean Exit at 6:00:** At 360 seconds (6m 00s), the room is cleanly closed (`leaveMultiplayerLobby()`), WebRTC connections are terminated, peer IDs released, and the player returns safely to the main menu with alert `ROOM CLOSED // 6-MINUTE AFK INACTIVITY`.

---

## 8. Client-Only Real-Time Ping Telemetry

Multiplayer latency is continuously measured and displayed strictly to the local player:
1. **WebRTC Ping-Pong Protocol:**
   - Every 2000ms, the guest client transmits `{ type: 'ping', t: performance.now() }` over the reliable WebRTC DataChannel to the Host.
   - The Host immediately returns `{ type: 'pong', t: packet.t }`.
   - The guest computes round-trip time: $\text{RTT} = \text{Math.max}(1, \text{performance.now()} - t)$.
   - The Host (local loopback) displays `0 MS`.
2. **Telemetry UI:**
   - **In-Game:** Neo-brutalist pill in top status bar (`● 28 MS`) next to the room badge.
   - **Staging Lobby:** Clean `PING: 28 MS` tag inside the room information strip.
3. **Dynamic Status Indicators:**
   - Green (`#10B981`): $< 80\text{ ms}$ (Excellent)
   - Amber (`#F59E0B`): $80 - 160\text{ ms}$ (Moderate)
   - Red (`#EF4444`): $> 160\text{ ms}$ (High Latency)
4. **Privacy:** Ping is purely client-side; no ping numbers are broadcast to other players, eliminating clutter and 3D billboard noise.

---

## 9. Mid-Race Join (Mario Kart Spectator Queue)

When a player joins a room with a race already in progress (`matchState === 'in_race'`), they do NOT get stuck in a blank waiting room or crash:
1. **Immediate Spectator Mode:** The joining guest receives `lobby_sync` with `matchState: 'in_race'`, immediately closes the menu, sets up the track, and activates live Spectator Mode.
2. **Real-Time Stream:** The spectator receives live 30Hz transform updates from all active racers, watching them drift, boost, and crash in real-time.
3. **HUD Queue Banner:** Top spectator overlay displays:
   `QUEUED FOR NEXT ROUND // SPECTATING: RACER_NAME`
4. **Cycle Controls:** Spectator can click `PREV` and `NEXT` to cycle through all racers on track.
5. **Seamless Drop-In:** When the race finishes and the Host launches the next match/rematch (`net.onCountdownTriggered`), the queued spectator automatically drops onto the starting grid as an active racer!

---

## 10. Competitive Outro & Celebration Phase (Sky Rumble Match Point)

In competitive arena games (Smash Karts, Rocket League, Overwatch), the match does not abruptly terminate the instant match point is reached. A 3.0-second celebration outro provides visceral emotional closure:

1. **Scoring Lock Invariant:**
   - The moment target kills (e.g. 10 kills in TDM) or final elimination is reached, `rumbleManager.isMatchOver = true`.
   - `update(dt)` stops recording knockouts, fallouts, or score increments, eliminating phantom kills or late draws.
2. **Synchronized Network Packet (`rumble_finish`):**
   - Host broadcasts `{ type: 'rumble_finish', winningTeam, winnerName }` over reliable WebRTC DataChannel to all connected peers.
   - All clients receive the packet and enter the celebration outro simultaneously.
3. **Continuous 3.0s Simulation:**
   - Game state remains `GameState.RACING` for 3.0 seconds (`rumbleOutroTimer = 3.0`).
   - WASM physics, kart controls, engine audio, particles, and victim karts plummeting through clouds continue running at full 60fps.
   - Winners can do victory donuts, drifts, and boosts inside the arena deck.
4. **Neo-Brutalist Victory Banner:**
   - Center-screen animated banner pops in with spring physics:
     - `TEAM FROST WINS!` (`#00F0FF` Cyan)
     - `TEAM BLAZE WINS!` (`#FF385C` Crimson)
     - `[RACER] WINS!` (`#FFE600` Gold)
     - `DRAW MATCH!` (`#FFFFFF` White)
   - Triumphant audio fanfare + particle confetti blast.
5. **Graceful Scoreboard Transition:**
   - When the 3.0s celebration timer expires, `finalizeRumbleMatch()` cleanly sets `GameState.FINISHED`, hides the victory banner, and opens the `#finish-modal` scoreboard with XP tickers, coin rewards, and the rematch button.

---

## 11. Signaling Resilience & Creation Safeguards

To prevent UI lockups during network volatility:
1. **Cleanup-First Invariant:** In both `initHost` and `joinRoom`, `this.cleanup()` is invoked *before* setting state properties, ensuring existing peer connections and room state are completely flushed without overwriting the newly selected room configuration or host role.
2. **10-Second Creation Timeout:** If the cloud signaling handshake does not open within 10,000ms, the promise safely rejects with `HOST TIMEOUT // CHECK NETWORK`, freeing UI buttons from infinite disabled states.
3. **Collision Recovery:** If the generated room code happens to collide with an active peer ID on the signaling cluster (`unavailable-id`), `initHost` automatically recurses with a newly generated alphanumeric key until a unique room ID opens.


# 🌐 AirSkid Multiplayer Networking Architecture & Production Guide

This document describes the real-time P2P multiplayer architecture of AirSkid, covering the WebRTC transport layer, Snapshot Interpolation with Jitter Buffer, Projective Dead Reckoning, and tuning guidelines.

---

## 1. High-Level Architecture Overview

```
+-------------------------------------------------------------------------+
|                              LOCAL CLIENT                               |
|                                                                         |
|  [Keyboard / Touch Input]                                               |
|             │                                                           |
|             ▼                                                           |
|  [Rapier 3D Physics Step] ──── (60 FPS local execution)                 |
|             │                                                           |
|             ▼                                                           |
|  [Transform Broadcast] ─────── (30 Hz rate-limited outbound stream)     |
+-------------┼-----------------------------------------------------------+
              │ WebRTC DataChannel (SCTP over UDP, low-latency, ordered:false)
              ▼
+-------------------------------------------------------------------------+
|                              REMOTE CLIENT                              |
|                                                                         |
|  [Inbound Packet] (Arrival jitter: 20ms - 80ms)                         |
|             │                                                           |
|             ▼                                                           |
|  [NetworkInterpolator Jitter Buffer] (65ms target delay window)         |
|             │                                                           |
|             ▼                                                           |
|  [Hermite Cubic Spline Interpolation]                                   |
|             ├── Under normal conditions: C1 continuous spline           |
|             └── Under lag spike / packet drop: Projective Dead Reckoning|
|             │                                                           |
|             ▼                                                           |
|  [Remote Kart 3D Mesh & Kinematic Body] ── (60/120 FPS buttery-smooth)  |
+-------------------------------------------------------------------------+
```

---

## 2. Why Naive `lerp()` Caused Jitter (The Problem)

In earlier versions, the game updated remote karts using a single target variable:
```typescript
// ❌ Naive approach: Instant reactive exponential lerp
k.group.position.lerp(remote.targetPos, Math.min(1.0, dt * 20.0));
```
### Why this failed:
1. **Network Jitter:** Real-world networks (especially 4G/5G mobile data and WiFi) deliver packets in bursts with variable ping (e.g. Packet 1 at 0ms, Packet 2 at 45ms, Packet 3 at 50ms).
2. **Stop-and-Go Stutter:** At high speed (100+ km/h), each packet moves the kart forward by ~0.9 meters. The local client rapidly lerps and reaches `targetPos` in 2-3 frames, then **stops dead in its tracks** waiting for the delayed packet. When the packet arrives, it surges forward again.
3. **No Velocity Information:** The client had no knowledge of whether the kart was accelerating, braking, or turning, making predictive smoothing impossible.

---

## 3. The Production Solution (Industry Standard)

We implement the same pipeline used in AAA arcade racers (*Rocket League, Smash Karts, Mario Kart Tour*):

### A. Snapshot Jitter Buffer (`NetworkInterpolator.ts`)
- Maintains a historical circular queue of the latest **10 snapshots**.
- Target render time is delayed by **`INTERPOLATION_DELAY_MS = 65ms`** (approximately 2 packet ticks).
- Because the client always renders between two known points in history ($T_0$ and $T_1$), packet arrival jitter is **completely absorbed**.

### B. Hermite Cubic Spline Interpolation
Instead of linear lines, the position is calculated using Hermite polynomials incorporating velocity tangents:
$$h_{00}(\alpha) = 2\alpha^3 - 3\alpha^2 + 1$$
$$h_{10}(\alpha) = \alpha^3 - 2\alpha^2 + \alpha$$
$$h_{01}(\alpha) = -2\alpha^3 + 3\alpha^2$$
$$h_{11}(\alpha) = \alpha^3 - \alpha^2$$

$$\mathbf{P}(\alpha) = h_{00}\mathbf{P}_0 + h_{10}\Delta t \mathbf{V}_0 + h_{01}\mathbf{P}_1 + h_{11}\Delta t \mathbf{V}_1$$

Where:
- $\alpha = \frac{\text{renderTime} - T_0}{T_1 - T_0}$
- $\mathbf{P}_0, \mathbf{P}_1$ are positions at snapshots 0 and 1.
- $\mathbf{V}_0, \mathbf{V}_1$ are linear velocities at snapshots 0 and 1.
- $\Delta t = T_1 - T_0$.

This guarantees that velocity curves are **$C^1$ smooth and continuous**, so corners and turns look identical to local bots!

### C. Projective Dead Reckoning (Extrapolation)
If a lag spike occurs and no new snapshot has arrived when `renderTime > newestSnapshot.time`:
1. The remote kart does **not freeze**.
2. It projects forward along its last known velocity:
   $$\mathbf{P}_{\text{extrapolated}} = \mathbf{P}_{\text{newest}} + \mathbf{V}_{\text{newest}} \times \Delta t_{\text{overdue}}$$
3. Rotation continues along its yaw rate (`angvelY`).
4. Extrapolation is capped at 250ms to prevent runaway ghost cars if a player drops out.
5. When a fresh packet arrives, position error is smoothed exponentially over 100ms instead of teleporting.

---

## 4. Network Packet Specification (`RemoteKartTransform`)

The packet transmitted at 30 Hz contains:

| Field | Type | Description |
| :--- | :--- | :--- |
| `peerId` | `string` | Unique WebRTC Peer ID of sender |
| `time` | `number` | Client `performance.now()` timestamp |
| `x, y, z` | `number` | World position (rounded to 2 decimal places) |
| `qx, qy, qz, qw` | `number` | Orientation quaternion (rounded to 3 decimal places) |
| `vx, vy, vz` | `number` | Linear velocity vector in m/s |
| `angvelY` | `number` | Yaw angular velocity in rad/s |
| `speed` | `number` | Forward scalar speed in m/s |
| `steer` | `number` | Front wheel steer angle |
| `drift` | `boolean` | Is active tire drifting |
| `boost` | `boolean` | Is rocket boost active |

---

## 5. Tuning & Configuration Reference

These constants can be tuned in `src/net/NetworkInterpolator.ts`:

```typescript
// Target delay buffer to absorb ping jitter (60ms - 80ms is optimal for P2P WebRTC)
export const INTERPOLATION_DELAY_MS = 65.0;

// Maximum time to project forward if packets are lost or delayed (prevents runaway)
export const MAX_EXTRAPOLATION_MS = 250.0;

// Error blend speed when recovering from dead-reckoning extrapolation (1/s)
export const ERROR_DECAY_RATE = 14.0;

// Outbound send rate in src/main.ts (0.033s = 30 Hz, 0.025s = 40 Hz)
export const NET_SEND_INTERVAL = 0.033;
```

---

## 6. How Smash Combat Works in Multiplayer

- When a collision occurs between player and remote racer, the local attacker triggers impact effects and broadcasts a `SmashPacket` via WebRTC.
- The victim receives the packet and applies the directional impulse with torque spin.
- During airborne tumble (`isSmashed`), local physics takes priority over network streaming so the ballistic tumble is 100% responsive, before seamlessly blending back to network stream upon landing or respawn.

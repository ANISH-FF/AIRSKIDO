import { Peer, DataConnection } from 'peerjs';
import * as THREE from 'three';
import { RumbleTeam } from '../world/RumbleManager';
import { NET_CONFIG } from './NetConfig';

export interface RemotePlayerInfo {
  peerId: string;
  name: string;
  kartType: number;
  skinId?: string;
  isHost: boolean;
  isReady: boolean;
  team?: 'frost' | 'blaze';
  isVip?: boolean;
  level?: number;
}

export interface RemoteKartTransform {
  peerId: string;
  time?: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx?: number;
  vy?: number;
  vz?: number;
  angvelY?: number;
  speed: number;
  steer: number;
  drift: boolean;
  boost: boolean;
  isGhost?: boolean;
}

export interface SmashPacket {
  type: 'smash';
  targetPeerId: string;
  attackerPeerId?: string;
  impulseX: number;
  impulseY: number;
  impulseZ: number;
}

export type MpGameMode = 'classic' | 'rumble' | 'hardcore' | 'time_attack' | 'time_attack_hardcore';

export type NetPacket =
  | { type: 'lobby_sync'; players: RemotePlayerInfo[]; laps: number; mode?: MpGameMode; rumbleRule?: string; rumbleFormat?: 'tdm' | 'ffa'; matchState?: 'staging' | 'in_race' }
  | { type: 'player_join'; player: RemotePlayerInfo }
  | { type: 'player_left'; peerId: string; name?: string }
  | { type: 'team_change'; peerId: string; team: 'frost' | 'blaze' }
  | { type: 'start_countdown'; startTime: number; durationMs?: number; laps: number; mode?: MpGameMode; rumbleRule?: string; rumbleFormat?: 'tdm' | 'ffa' }
  | { type: 'kart_transform'; data: RemoteKartTransform }
  | { type: 'race_first_finish'; winnerPeerId: string; winnerName: string; countdownSeconds: number }
  | { type: 'rumble_finish'; winningTeam: RumbleTeam | 'draw'; winnerName: string }
  | { type: 'rumble_knockout'; victimId: string; attackerId?: string; victimLives?: number }
  | { type: 'rumble_score_sync'; frostScore: number; blazeScore: number; racerScores: Array<{ racerId: string; kills: number; deaths: number; lives: number }> }
  | { type: 'room_closed'; reason?: string }
  | { type: 'ping'; t: number }
  | { type: 'pong'; t: number }
  | { type: 'countdown_tick'; count: 3 | 2 | 1 | 0 }
  | SmashPacket;

export class MultiplayerManager {
  public peer: Peer | null = null;
  public myPeerId: string = '';
  public roomCode: string = '';

  public getPeerIdForRoom(roomCode: string): string {
    return `airskido_room_${roomCode.toLowerCase()}`;
  }
  public isHost: boolean = false;
  public playerName: string = 'RACER 1';
  public selectedKart: number = 0;
  public selectedSkinId: string = 'skin_default';
  public selectedLaps: number = 3;
  public selectedMode: MpGameMode = 'classic';
  public selectedRumbleRule: string = 'kills_10';
  public selectedRumbleFormat: 'tdm' | 'ffa' = 'tdm';
  public myTeam?: 'frost' | 'blaze' = 'frost';
  public matchState: 'staging' | 'in_race' = 'staging';
  public currentPing: number = 0;
  public isVip: boolean = false;
  public playerLevel: number = 1;
  private isRoomClosed: boolean = false;

  public connectedPeers: Map<string, DataConnection> = new Map();
  public lobbyPlayers: RemotePlayerInfo[] = [];

  // Callbacks
  public onLobbyUpdated?: (players: RemotePlayerInfo[], laps: number, mode?: MpGameMode, rule?: string, format?: 'tdm' | 'ffa', matchState?: 'staging' | 'in_race') => void;
  public onCountdownTriggered?: (startTime: number, laps: number, mode?: MpGameMode, rule?: string, format?: 'tdm' | 'ffa', durationMs?: number) => void;
  public onCountdownTickReceived?: (count: 3 | 2 | 1 | 0) => void;
  public onRemoteTransform?: (data: RemoteKartTransform) => void;
  public onFirstFinishReceived?: (winnerPeerId: string, winnerName: string, countdownSeconds: number) => void;
  public onRumbleFinishReceived?: (winningTeam: RumbleTeam | 'draw', winnerName: string) => void;
  public onRumbleKnockoutReceived?: (victimId: string, attackerId?: string, victimLives?: number) => void;
  public onRumbleScoreSyncReceived?: (
    frostScore: number,
    blazeScore: number,
    racerScores: Array<{ racerId: string; kills: number; deaths: number; lives: number }>
  ) => void;
  public onSmashReceived?: (data: SmashPacket) => void;
  public onPlayerLeft?: (peerId: string, playerName?: string) => void;
  public onRoomClosed?: (reason?: string) => void;
  public onHostMigrated?: (newHost: RemotePlayerInfo, isSelf: boolean) => void;
  public onPingUpdated?: (pingMs: number) => void;
  public onError?: (msg: string) => void;

  private sendInterval: number | null = null;
  private pingInterval: number | null = null;

  // High-availability Google STUN + Cloudflare STUN + Private VPS Coturn Relay for 100% reliable cross-network NAT traversal
  private static readonly PEER_CONFIG = {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:50.6.44.119:3478' },
        // Private VPS Coturn Relay (Bypasses Jio / Airtel 4G/5G Symmetric NAT <-> Home Wi-Fi)
        {
          urls: [
            'turn:50.6.44.119:3478',
            'turn:50.6.44.119:3478?transport=tcp',
          ],
          username: 'airskido',
          credential: 'airskidorocks2026',
        },
      ],
      iceCandidatePoolSize: 10,
      sdpSemantics: 'unified-plan',
    },
  };

  constructor() {}

  private getPeerOptions(): any {
    if (NET_CONFIG.USE_CUSTOM_SIGNALING && NET_CONFIG.CUSTOM_HOST) {
      return {
        ...MultiplayerManager.PEER_CONFIG,
        host: NET_CONFIG.CUSTOM_HOST,
        port: NET_CONFIG.CUSTOM_PORT,
        path: NET_CONFIG.CUSTOM_PATH,
        secure: NET_CONFIG.CUSTOM_SECURE,
      };
    }
    return MultiplayerManager.PEER_CONFIG;
  }

  public async initHost(
    playerName: string,
    kartType: number,
    laps: number = 3,
    mode: MpGameMode = 'classic',
    rumbleRule: string = 'kills_10',
    rumbleFormat: 'tdm' | 'ffa' = 'tdm',
    skinId: string = 'skin_default',
    isVip: boolean = false,
    level: number = 1
  ): Promise<string> {
    this.cleanup();
    this.playerName = playerName || 'HOST';
    this.selectedKart = kartType;
    this.selectedSkinId = skinId || 'skin_default';
    this.selectedLaps = laps;
    this.selectedMode = mode;
    this.selectedRumbleRule = rumbleRule;
    this.selectedRumbleFormat = rumbleFormat;
    this.isVip = isVip;
    this.playerLevel = level;
    this.myTeam = (mode === 'rumble' && rumbleFormat === 'ffa') ? undefined : 'frost';
    this.isHost = true;

    // Generate clean 6-digit numeric room code (1,000,000 unique room combinations)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.roomCode = code;

    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
          }
          const msg = 'HOST TIMEOUT // CHECK NETWORK';
          if (this.onError) this.onError(msg);
          reject(new Error(msg));
        }
      }, 10000);

      // Peer ID uses scoped namespace to prevent collisions on public PeerJS cloud
      const hostPeerId = this.getPeerIdForRoom(this.roomCode);
      this.peer = new Peer(hostPeerId, this.getPeerOptions());

      this.peer.on('open', (id) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        this.myPeerId = id;
        this.lobbyPlayers = [
          {
            peerId: id,
            name: this.playerName,
            kartType: this.selectedKart,
            skinId: this.selectedSkinId,
            isHost: true,
            isReady: true,
            team: 'frost',
            isVip: this.isVip,
            level: this.playerLevel,
          },
        ];
        try {
          if (this.onLobbyUpdated) this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
        } catch (e) {
          console.error('Error in onLobbyUpdated:', e);
        }
        this.startPingLoop();
        resolve(this.roomCode);
      });

      this.peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      this.peer.on('error', (err) => {
        if (resolved) return;
        console.warn('PeerJS Host Error:', err);
        // If room code ID is taken, retry with different code
        if (err.type === 'unavailable-id') {
          clearTimeout(timeoutId);
          this.initHost(this.playerName, this.selectedKart, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.selectedSkinId).then(resolve).catch(reject);
        } else {
          resolved = true;
          clearTimeout(timeoutId);
          if (this.onError) this.onError(err.message || 'Connection failed');
          reject(err);
        }
      });
    });
  }

  public async joinRoom(
    roomCode: string,
    playerName: string,
    kartType: number,
    skinId: string = 'skin_default',
    isVip: boolean = false,
    level: number = 1
  ): Promise<void> {
    this.cleanup();
    this.playerName = playerName || 'GUEST';
    this.selectedKart = kartType;
    this.selectedSkinId = skinId || 'skin_default';
    this.isVip = isVip;
    this.playerLevel = level;
    this.isHost = false;

    // Normalize room code: accept "482910", "482 910", legacy "AERO-XXXXX", or custom inputs
    let raw = roomCode.trim().toUpperCase().replace(/^AERO[-_]?/i, '').replace(/[\s\-_]+/g, '');
    if (!raw || raw.length < 3) {
      throw new Error('INVALID ROOM CODE');
    }
    this.roomCode = raw;

    return new Promise((resolve, reject) => {
      let resolved = false;
      this.peer = new Peer(this.getPeerOptions());

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
          }
          const msg = 'HOST NOT FOUND // RE-CHECK CODE';
          if (this.onError) this.onError(msg);
          reject(new Error(msg));
        }
      }, 18000);

      this.peer.on('open', (myId) => {
        this.myPeerId = myId;
        const hostPeerId = this.getPeerIdForRoom(this.roomCode);
        const conn = this.peer!.connect(hostPeerId, { reliable: true, serialization: 'json' });

        conn.on('open', () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          this.connectedPeers.set(hostPeerId, conn);

          // Balance initial team: join whichever team has fewer players
          const frostCount = this.lobbyPlayers.filter(p => p.team === 'frost').length;
          const blazeCount = this.lobbyPlayers.filter(p => p.team === 'blaze').length;
          this.myTeam = frostCount > blazeCount ? 'blaze' : 'frost';

          // Send self introduce packet
          const selfInfo: RemotePlayerInfo = {
            peerId: myId,
            name: this.playerName,
            kartType: this.selectedKart,
            skinId: this.selectedSkinId,
            isHost: false,
            isReady: true,
            team: this.myTeam,
            isVip: this.isVip,
            level: this.playerLevel,
          };
          try {
            conn.send({ type: 'player_join', player: selfInfo });
          } catch (e) {}

          this.lobbyPlayers = [selfInfo];
          if (this.onLobbyUpdated) this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
          this.startPingLoop();

          // Safety re-send of player_join after 500ms if host hasn't synced roster yet
          setTimeout(() => {
            if (conn.open && this.lobbyPlayers.length <= 1) {
              try { conn.send({ type: 'player_join', player: selfInfo }); } catch (e) {}
            }
          }, 500);

          resolve();
        });

        conn.on('data', (data) => {
          this.handlePacket(data as NetPacket, hostPeerId);
        });

        conn.on('close', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            if (this.peer) {
              try { this.peer.destroy(); } catch (e) {}
              this.peer = null;
            }
            const msg = 'ROOM NOT FOUND // CHECK CODE';
            if (this.onError) this.onError(msg);
            reject(new Error(msg));
          } else {
            this.handleHostDisconnect(hostPeerId);
          }
        });

        conn.on('error', (err) => {
          console.warn('Peer connection error:', err);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            if (this.peer) {
              try { this.peer.destroy(); } catch (e) {}
              this.peer = null;
            }
            const msg = 'COULD NOT REACH ROOM // RETRY';
            if (this.onError) this.onError(msg);
            reject(new Error(msg));
          }
        });
      });

      this.peer.on('error', (err: any) => {
        console.warn('PeerJS Join Error:', err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
          }
          const msg = err.type === 'peer-unavailable'
            ? 'ROOM NOT FOUND // CHECK CODE'
            : (err.type === 'network' ? 'NETWORK ERROR // CHECK INTERNET' : 'COULD NOT CONNECT // RETRY');
          if (this.onError) this.onError(msg);
          reject(new Error(msg));
        }
      });
    });
  }

  public broadcastLobbySync(excludePeerId?: string) {
    const packet: NetPacket = {
      type: 'lobby_sync',
      players: this.lobbyPlayers,
      laps: this.selectedLaps,
      mode: this.selectedMode,
      rumbleRule: this.selectedRumbleRule,
      rumbleFormat: this.selectedRumbleFormat,
      matchState: this.matchState,
    };
    this.broadcast(packet, excludePeerId);
  }

  public sendLobbySyncTo(conn: DataConnection) {
    if (conn.open) {
      try {
        conn.send({
          type: 'lobby_sync',
          players: this.lobbyPlayers,
          laps: this.selectedLaps,
          mode: this.selectedMode,
          rumbleRule: this.selectedRumbleRule,
          rumbleFormat: this.selectedRumbleFormat,
          matchState: this.matchState,
        });
      } catch (e) {}
    }
  }

  public setMatchState(state: 'staging' | 'in_race') {
    this.matchState = state;
    if (this.isHost) {
      this.broadcastLobbySync();
    }
  }

  public startPingLoop() {
    this.stopPingLoop();
    if (this.isHost) {
      this.currentPing = 0;
      if (this.onPingUpdated) this.onPingUpdated(0);
      return;
    }

    const pingHost = () => {
      if (this.isHost) {
        this.currentPing = 0;
        if (this.onPingUpdated) this.onPingUpdated(0);
        return;
      }
      const hostPlayer = this.lobbyPlayers.find((p) => p.isHost);
      const hostTargetId = hostPlayer ? hostPlayer.peerId : this.getPeerIdForRoom(this.roomCode);
      const conn = this.connectedPeers.get(hostTargetId);
      if (conn && conn.open) {
        try {
          conn.send({ type: 'ping', t: performance.now() });
        } catch (e) {}
      }
    };

    pingHost();
    this.pingInterval = window.setInterval(pingHost, 2000);
  }

  public stopPingLoop() {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleIncomingConnection(conn: DataConnection) {
    this.connectedPeers.set(conn.peer, conn);

    if (conn.open) {
      this.sendLobbySyncTo(conn);
    } else {
      conn.on('open', () => this.sendLobbySyncTo(conn));
    }

    conn.on('data', (data) => {
      const packet = data as NetPacket;
      if (packet.type === 'ping') {
        try {
          if (conn.open) conn.send({ type: 'pong', t: packet.t });
        } catch (e) {}
        return;
      }
      if (packet.type === 'pong') {
        const rtt = Math.max(1, Math.round(performance.now() - packet.t));
        this.currentPing = rtt;
        if (this.onPingUpdated) this.onPingUpdated(rtt);
        return;
      }
      if (packet.type === 'player_join') {
        this.connectedPeers.set(conn.peer, conn);
        // Default guest to team balance if no team specified
        if (!packet.player.team) {
          const frostCount = this.lobbyPlayers.filter((p) => p.team === 'frost').length;
          const blazeCount = this.lobbyPlayers.filter((p) => p.team === 'blaze').length;
          packet.player.team = frostCount > blazeCount ? 'blaze' : 'frost';
        }
        // Add or update in host lobby list
        const existingIdx = this.lobbyPlayers.findIndex((p) => p.peerId === packet.player.peerId);
        if (existingIdx >= 0) {
          this.lobbyPlayers[existingIdx] = packet.player;
        } else {
          this.lobbyPlayers.push(packet.player);
        }

        // Send full updated lobby list directly to this guest
        this.sendLobbySyncTo(conn);

        // Broadcast updated lobby list to all other peers
        this.broadcastLobbySync(conn.peer);

        if (this.onLobbyUpdated) {
          this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
        }
      } else if (packet.type === 'team_change') {
        // Player selected their squad (Frost or Blaze)
        const player = this.lobbyPlayers.find((p) => p.peerId === packet.peerId);
        if (player) {
          player.team = packet.team;
          this.broadcastLobbySync();
          if (this.onLobbyUpdated) {
            this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
          }
        }
      } else {
        // Handle transform or game event
        this.handlePacket(packet, conn.peer);
        // Relay to other guests if Host
        if (this.isHost && (
          packet.type === 'kart_transform' ||
          packet.type === 'smash' ||
          packet.type === 'race_first_finish' ||
          packet.type === 'rumble_finish' ||
          packet.type === 'rumble_knockout' ||
          packet.type === 'rumble_score_sync'
        )) {
          this.broadcast(packet, conn.peer);
        }
      }
    });

    conn.on('close', () => {
      const leavingPeerId = conn.peer;
      const leavingPlayer = this.lobbyPlayers.find((p) => p.peerId === leavingPeerId);
      const leavingName = leavingPlayer ? leavingPlayer.name : undefined;

      this.connectedPeers.delete(leavingPeerId);
      this.lobbyPlayers = this.lobbyPlayers.filter((p) => p.peerId !== leavingPeerId);
      if (this.isHost) {
        this.broadcastLobbySync();
        this.broadcast({ type: 'player_left', peerId: leavingPeerId, name: leavingName });
      }
      if (this.onPlayerLeft) {
        this.onPlayerLeft(leavingPeerId, leavingName);
      }
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
      }
    });
  }

  private handlePacket(packet: NetPacket, senderId: string) {
    switch (packet.type) {
      case 'lobby_sync':
        this.lobbyPlayers = packet.players;
        this.selectedLaps = packet.laps || 3;
        if (packet.mode) this.selectedMode = packet.mode;
        if (packet.rumbleRule) this.selectedRumbleRule = packet.rumbleRule;
        if (packet.rumbleFormat) this.selectedRumbleFormat = packet.rumbleFormat;
        if (packet.matchState) this.matchState = packet.matchState;
        const myInfo = this.lobbyPlayers.find((p) => p.peerId === this.myPeerId);
        if (myInfo) {
          this.myTeam = this.selectedRumbleFormat === 'ffa' ? undefined : (myInfo.team || 'frost');
        }
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
        }
        break;

      case 'ping':
        const senderConn = this.connectedPeers.get(senderId);
        if (senderConn && senderConn.open) {
          try {
            senderConn.send({ type: 'pong', t: packet.t });
          } catch (e) {}
        }
        break;

      case 'pong':
        const rtt = Math.max(1, Math.round(performance.now() - packet.t));
        this.currentPing = rtt;
        if (this.onPingUpdated) {
          this.onPingUpdated(rtt);
        }
        break;

      case 'start_countdown':
        this.selectedLaps = packet.laps || 3;
        if (packet.mode) this.selectedMode = packet.mode;
        if (packet.rumbleRule) this.selectedRumbleRule = packet.rumbleRule;
        if (packet.rumbleFormat) this.selectedRumbleFormat = packet.rumbleFormat;
        if (this.onCountdownTriggered) {
          this.onCountdownTriggered(packet.startTime, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, packet.durationMs);
        }
        break;

      case 'countdown_tick':
        if (this.onCountdownTickReceived) {
          this.onCountdownTickReceived(packet.count);
        }
        break;

      case 'kart_transform':
        if (this.onRemoteTransform) this.onRemoteTransform(packet.data);
        break;

      case 'race_first_finish':
        if (this.onFirstFinishReceived) {
          this.onFirstFinishReceived(packet.winnerPeerId, packet.winnerName, packet.countdownSeconds);
        }
        break;

      case 'room_closed':
        this.isRoomClosed = true;
        if (this.onRoomClosed) {
          this.onRoomClosed(packet.reason || 'HOST_CLOSED');
        }
        break;

      case 'player_left':
        this.lobbyPlayers = this.lobbyPlayers.filter((p) => p.peerId !== packet.peerId);
        if (this.onPlayerLeft) {
          this.onPlayerLeft(packet.peerId, packet.name);
        }
        if (this.onLobbyUpdated) {
          this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
        }
        break;

      case 'smash':
        if (this.onSmashReceived) this.onSmashReceived(packet);
        break;

      case 'rumble_finish':
        if (this.onRumbleFinishReceived) {
          this.onRumbleFinishReceived(packet.winningTeam, packet.winnerName);
        }
        break;

      case 'rumble_knockout':
        if (this.onRumbleKnockoutReceived) {
          this.onRumbleKnockoutReceived(packet.victimId, packet.attackerId, packet.victimLives);
        }
        break;

      case 'rumble_score_sync':
        if (this.onRumbleScoreSyncReceived) {
          this.onRumbleScoreSyncReceived(packet.frostScore, packet.blazeScore, packet.racerScores);
        }
        break;
    }
  }

  public handleHostDisconnect(oldHostPeerId: string) {
    if (this.isRoomClosed) return;
    const oldHostInfo = this.lobbyPlayers.find((p) => p.peerId === oldHostPeerId);
    if (this.onPlayerLeft) {
      this.onPlayerLeft(oldHostPeerId, oldHostInfo ? oldHostInfo.name : undefined);
    }

    this.connectedPeers.delete(oldHostPeerId);
    this.lobbyPlayers = this.lobbyPlayers.filter((p) => p.peerId !== oldHostPeerId);

    if (this.lobbyPlayers.length === 0) {
      if (this.onRoomClosed) {
        this.onRoomClosed('NO_PLAYERS_LEFT');
      }
      return;
    }

    // Deterministic election: first remaining guest in lobbyPlayers becomes the new host
    const newHostInfo = this.lobbyPlayers[0];
    newHostInfo.isHost = true;
    const isMeNewHost = newHostInfo.peerId === this.myPeerId;

    if (isMeNewHost) {
      this.isHost = true;
      this.startPingLoop();
      if (this.peer && !this.peer.destroyed) {
        this.peer.on('connection', (conn) => {
          this.handleIncomingConnection(conn);
        });
      }
      if (this.onHostMigrated) {
        this.onHostMigrated(newHostInfo, true);
      }
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
      }
      // Broadcast updated lobby sync to any peers already connected
      this.broadcastLobbySync();
    } else {
      if (this.onHostMigrated) {
        this.onHostMigrated(newHostInfo, false);
      }
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
      }

      // Reconnect to newly elected host
      setTimeout(() => {
        if (!this.peer || this.peer.destroyed) return;
        const newConn = this.peer.connect(newHostInfo.peerId, { reliable: true });
        this.connectedPeers.set(newHostInfo.peerId, newConn);

        newConn.on('open', () => {
          this.startPingLoop();
          const selfInfo: RemotePlayerInfo = {
            peerId: this.myPeerId,
            name: this.playerName,
            kartType: this.selectedKart,
            skinId: this.selectedSkinId,
            isHost: false,
            isReady: true,
            team: this.myTeam,
            isVip: this.isVip,
            level: this.playerLevel,
          };
          try {
            newConn.send({ type: 'player_join', player: selfInfo });
          } catch (e) {}
        });

        newConn.on('data', (data) => {
          this.handlePacket(data as NetPacket, newHostInfo.peerId);
        });

        newConn.on('close', () => {
          this.handleHostDisconnect(newHostInfo.peerId);
        });
      }, 150);
    }
  }

  public setMyTeam(team: 'frost' | 'blaze') {
    this.myTeam = team;
    const me = this.lobbyPlayers.find((p) => p.peerId === this.myPeerId);
    if (me) {
      me.team = team;
    }
    if (this.isHost) {
      this.broadcastLobbySync();
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
      }
    } else {
      const hostPeerId = this.getPeerIdForRoom(this.roomCode);
      const hostConn = this.connectedPeers.get(hostPeerId);
      if (hostConn && hostConn.open) {
        try {
          hostConn.send({ type: 'team_change', peerId: this.myPeerId, team });
        } catch (e) {}
      }
      if (this.onLobbyUpdated) {
        this.onLobbyUpdated(this.lobbyPlayers, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, this.matchState);
      }
    }
  }

  public broadcastFirstFinish(winnerPeerId: string, winnerName: string, countdownSeconds: number = 15) {
    this.broadcast({ type: 'race_first_finish', winnerPeerId, winnerName, countdownSeconds });
  }

  public broadcastRumbleFinish(winningTeam: RumbleTeam | 'draw', winnerName: string) {
    this.broadcast({ type: 'rumble_finish', winningTeam, winnerName });
  }

  public broadcast(packet: NetPacket, excludePeerId?: string) {
    for (const [peerId, conn] of this.connectedPeers.entries()) {
      if (peerId !== excludePeerId && conn.open) {
        conn.send(packet);
      }
    }
  }

  // Called by Host to trigger race for all connected clients with synchronized timestamp & duration
  public startHostRace() {
    if (!this.isHost) return;
    this.matchState = 'in_race';
    const durationMs = 6000; // Synchronized start across all network devices (2.8s loading screen + 3.2s countdown)
    const startTime = Date.now() + durationMs;
    this.broadcast({
      type: 'start_countdown',
      startTime,
      durationMs,
      laps: this.selectedLaps,
      mode: this.selectedMode,
      rumbleRule: this.selectedRumbleRule,
      rumbleFormat: this.selectedRumbleFormat,
    });
    if (this.onCountdownTriggered) {
      this.onCountdownTriggered(startTime, this.selectedLaps, this.selectedMode, this.selectedRumbleRule, this.selectedRumbleFormat, durationMs);
    }
  }

  // Host-Authoritative countdown tick synchronization (count = 3, 2, 1, or 0 for GO!)
  public broadcastCountdownTick(count: 3 | 2 | 1 | 0) {
    if (!this.isHost) return;
    this.broadcast({ type: 'countdown_tick', count });
  }

  // Stream local kart transform
  public broadcastTransform(
    pos: THREE.Vector3,
    rot: THREE.Quaternion,
    linvel: { x: number; y: number; z: number } | null | undefined,
    angvelY: number,
    speed: number,
    steer: number,
    drift: boolean,
    boost: boolean,
    isGhost?: boolean
  ) {
    if (this.connectedPeers.size === 0) return;

    const data: RemoteKartTransform = {
      peerId: this.myPeerId,
      time: Math.round(performance.now() * 10) / 10,
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      z: Math.round(pos.z * 100) / 100,
      qx: Math.round(rot.x * 1000) / 1000,
      qy: Math.round(rot.y * 1000) / 1000,
      qz: Math.round(rot.z * 1000) / 1000,
      qw: Math.round(rot.w * 1000) / 1000,
      vx: linvel ? Math.round(linvel.x * 100) / 100 : 0,
      vy: linvel ? Math.round(linvel.y * 100) / 100 : 0,
      vz: linvel ? Math.round(linvel.z * 100) / 100 : 0,
      angvelY: Math.round(angvelY * 100) / 100,
      speed: Math.round(speed * 10) / 10,
      steer: Math.round(steer * 100) / 100,
      drift,
      boost,
      isGhost: !!isGhost,
    };

    const packet: NetPacket = { type: 'kart_transform', data };
    this.broadcast(packet);
  }

  // Send smash impact packet to another player
  public sendSmash(targetPeerId: string, impulse: THREE.Vector3, attackerPeerId?: string) {
    const packet: SmashPacket = {
      type: 'smash',
      targetPeerId,
      attackerPeerId: attackerPeerId || this.myPeerId,
      impulseX: impulse.x,
      impulseY: impulse.y,
      impulseZ: impulse.z,
    };
    this.broadcast(packet);
  }

  // Synchronize arena knockout / kill event across all peers
  public broadcastRumbleKnockout(victimId: string, attackerId?: string, victimLives?: number) {
    this.broadcast({
      type: 'rumble_knockout',
      victimId,
      attackerId,
      victimLives,
    });
  }

  // Authoritatively broadcast synchronized rumble scores across all peers
  public broadcastRumbleScoreSync(
    frostScore: number,
    blazeScore: number,
    racerScores: Array<{ racerId: string; kills: number; deaths: number; lives: number }>
  ) {
    this.broadcast({
      type: 'rumble_score_sync',
      frostScore,
      blazeScore,
      racerScores,
    });
  }

  public cleanup(forceCloseRoom: boolean = false) {
    this.stopPingLoop();
    this.currentPing = 0;
    this.matchState = 'staging';
    this.isRoomClosed = false;
    if (forceCloseRoom && this.isHost && this.connectedPeers.size > 0) {
      try {
        this.broadcast({ type: 'room_closed', reason: 'HOST_CLOSED' });
      } catch (e) {}
    }
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
    for (const conn of this.connectedPeers.values()) {
      try {
        conn.close();
      } catch (e) {}
    }
    this.connectedPeers.clear();
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    this.lobbyPlayers = [];
    this.roomCode = '';
    this.myPeerId = '';
    this.isHost = false;
  }
}

export const net = new MultiplayerManager();

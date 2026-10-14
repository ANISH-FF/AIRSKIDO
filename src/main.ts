import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { CelebrationFX } from './ui/CelebrationFX';
import { Engine } from './core/Engine';
import { PhysicsEngine } from './core/Physics';
import { InputManager } from './core/Input';
import { sounds } from './core/Sound';
import { settings } from './core/Settings';
import { SkyWorld } from './world/Skybox';
import { Track } from './world/Track';
import { CheckpointSystem, RacerProgress } from './world/CheckpointSystem';
import { SparkParticles } from './world/SparkParticles';
import { SkidmarkSystem } from './world/SkidmarkSystem';
import { Kart, KART_CONFIGS } from './entities/Kart';
import { PlayerKart } from './entities/PlayerKart';
import { BotKart } from './entities/BotKart';
import { resolveRumbleCombat, clearRumbleCombatCooldowns } from './world/RumbleCombat';
import { HUD } from './ui/HUD';
import { net, RemoteKartTransform, RemotePlayerInfo, SmashPacket, MpGameMode } from './net/MultiplayerManager';
import { NetworkInterpolator } from './net/NetworkInterpolator';
import { RumbleManager, RumbleRacer, RumbleTeam, compareRumbleRacers } from './world/RumbleManager';
import { RumbleArenaConfig } from './world/tracks/RumbleArenaConfig';
import { economy } from './core/Economy';
import { recordManager, RecordManager } from './core/RecordManager';
import { storeModal } from './ui/StoreModal';
import { settingsModal } from './ui/SettingsModal';
import { lobbyUI } from './ui/LobbyUI';
import { nameSystem, RacerProfile } from './core/NameSystem';
import { initNameModal } from './ui/NameModal';
import { leaderboard } from './core/Leaderboard';
import { initLeaderboardUI } from './ui/LeaderboardUI';
import { getSkinDisplayName } from './ui/KartAvatars';
import { speedlines } from './ui/SpeedlinesOverlay';
import { UIScaleEngine } from './core/UIScaleEngine';
import { matchLoadingScreen, LoadingMode } from './ui/MatchLoadingScreen';
import { BOT_CONFIG, generateBotProfile, pickTeamBotNames } from './core/BotKartSettings';
import { SecurityGuard } from './core/SecurityGuard';

// ── INITIALIZE SECURITY SHIELD (Anti-Inspect & Asset Guard) ──
SecurityGuard.init();

// ── INITIALIZE UNIVERSAL UI SCALE ENGINE (WebGL Dynamic Scaling Matrix) ──
UIScaleEngine.init();

// High-performance reusable scratch vectors (eliminates 60fps GC allocations)
const _scratchForward = new THREE.Vector3();
const _scratchToOther = new THREE.Vector3();
const _scratchToBlock = new THREE.Vector3();
const _scratchReboundDir = new THREE.Vector3();
const _scratchSmashVA = new THREE.Vector3();
const _scratchSmashVB = new THREE.Vector3();
const _scratchSmashNormal = new THREE.Vector3();
const _scratchSmashContact = new THREE.Vector3();
const _scratchSmashTargetRight = new THREE.Vector3();
// Remote racer tumble & upright landing scratch objects (zero GC)
const _scratchUprightQuat = new THREE.Quaternion();
const _scratchAxisY = new THREE.Vector3(0, 1, 0);
const _scratchTumbleEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scratchTumbleQuat = new THREE.Quaternion();
// CyberRings scratch vectors
const _crToKart = new THREE.Vector3();
const _crRadDir = new THREE.Vector3();
const _crLaunchVel = new THREE.Vector3();
// Drift sparks/skidmarks scratch vectors (7 allocs/kart/frame → 0)
const _driftBackDir = new THREE.Vector3();
const _driftUpNorm = new THREE.Vector3();
const _driftRearLeft = new THREE.Vector3();
const _driftRearRight = new THREE.Vector3();
const _skidPosL = new THREE.Vector3();
const _skidPosR = new THREE.Vector3();
// Hazard block launch, boulder impact, kicker ramp scratch vectors
const _hazardLaunchVel = new THREE.Vector3();
const _boulderImpactPos = new THREE.Vector3();
const _kickerHopVel = new THREE.Vector3();
// Wrong-way alert scratch vectors
const _wrongWayFwd = new THREE.Vector3();
const _wrongWayFwdH = new THREE.Vector3();
const _wrongWayGateH = new THREE.Vector3();
const _minimapOtherKarts: Kart[] = [];
const _lastShadowCenter = new THREE.Vector3(999999, 999999, 999999);
const _scratchRumbleVel = new THREE.Vector3();

enum GameState {
  MENU,
  COUNTDOWN,
  RACING,
  FINISHED,
}

interface RemoteRacer {
  peerId: string;
  name: string;
  kart: Kart;
  interpolator: NetworkInterpolator;
  targetPos: THREE.Vector3;
  targetRot: THREE.Quaternion;
  targetSpeed: number;
  targetSteer: number;
  isDrifting: boolean;
  isBoosting: boolean;
  nameSprite: THREE.Sprite;

  // Local instant visual physics prediction during smash impacts
  isSmashed: boolean;
  smashTimer: number;
  launchVelocity: THREE.Vector3;
  tumbleAngularVel: THREE.Vector3;
  lastPacketTime: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSparkleStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.lineTo(cx + Math.cos(angle + Math.PI / 4) * (r * 0.3), cy + Math.sin(angle + Math.PI / 4) * (r * 0.3));
  }
  ctx.closePath();
  ctx.fill();
}

function createBrutalistNameTag(name: string, teamColor?: string, isVip?: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const cleanName = (name || 'RACER').trim().slice(0, 14);

  // 1. Neo-Brutalist Hard Black Drop Shadow
  ctx.fillStyle = '#000000';
  roundRect(ctx, 16, 16, 480, 96, 20);
  ctx.fill();

  if (isVip) {
    // ── LUXURY ROYAL VIP PLATE (GOLD GRADIENT + VIP BADGE + BOLD NAME) ──
    const goldGrad = ctx.createLinearGradient(8, 8, 8, 104);
    goldGrad.addColorStop(0.0, '#FFFEE6'); // Gleaming top reflection
    goldGrad.addColorStop(0.2, '#FFE554');
    goldGrad.addColorStop(0.65, '#FFB703');
    goldGrad.addColorStop(1.0, '#FB8500'); // Deep amber gold base
    ctx.fillStyle = goldGrad;
    roundRect(ctx, 8, 8, 480, 96, 20);
    ctx.fill();

    // Chunky brutalist black outer border
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    // Inner bright gold specular inset highlight
    roundRect(ctx, 14, 14, 468, 84, 14);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.stroke();

    // ── MEASURE AND GROUP-CENTER [ VIP ] BADGE + RACER NAME ──
    const vipPillWidth = 80;
    const vipPillHeight = 52;
    const gap = 16;
    const maxNameWidth = 320;

    let fontSize = 44;
    ctx.font = `900 ${fontSize}px "Fredoka", sans-serif`;
    while (ctx.measureText(cleanName).width > maxNameWidth && fontSize > 26) {
      fontSize -= 2;
      ctx.font = `900 ${fontSize}px "Fredoka", sans-serif`;
    }
    const nameWidth = ctx.measureText(cleanName).width;

    const totalGroupWidth = vipPillWidth + gap + nameWidth;
    const groupStartX = Math.round(248 - totalGroupWidth / 2);

    // ── JET BLACK [ VIP ] PILL BADGE ──
    const pillX = groupStartX;
    const pillY = Math.round(56 - vipPillHeight / 2);
    roundRect(ctx, pillX, pillY, vipPillWidth, vipPillHeight, 14);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFE554';
    ctx.stroke();

    // Subtle diamond sparkles on VIP pill corners
    drawSparkleStar(ctx, pillX + 10, pillY + 10, 3, '#FFFFFF');
    drawSparkleStar(ctx, pillX + vipPillWidth - 10, pillY + vipPillHeight - 10, 3, '#FFE554');

    ctx.font = '900 26px "Fredoka", sans-serif';
    ctx.fillStyle = '#FFE554';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VIP', pillX + vipPillWidth / 2, 56);

    // ── RACER NAME (Bold & Aligned within Centered Group) ──
    const nameX = pillX + vipPillWidth + gap;
    ctx.font = `900 ${fontSize}px "Fredoka", sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanName, nameX, 56);

    // Symmetrical decorative stars on gold plate corners
    drawSparkleStar(ctx, 36, 36, 9, '#FFFFFF');
    drawSparkleStar(ctx, 460, 36, 11, '#FFFFFF');
    drawSparkleStar(ctx, 444, 76, 7, '#FFDE59');
  } else {
    // ── CLEAN STANDARD RACER PLATE (PURE CENTERED NAME, ZERO "PILOT"/"HOST"/LEVEL) ──
    const bgColor = teamColor ? teamColor : '#00D2FF';
    ctx.fillStyle = bgColor;
    roundRect(ctx, 8, 8, 480, 96, 20);
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    // Inner subtle highlight
    roundRect(ctx, 14, 14, 468, 84, 14);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.stroke();

    // ── BOLD CENTERED RACER NAME (Auto-Scaled for Perfect Fit) ──
    const maxTextWidth = 440;
    let fontSize = 48;
    ctx.font = `900 ${fontSize}px "Fredoka", sans-serif`;
    while (ctx.measureText(cleanName).width > maxTextWidth && fontSize > 28) {
      fontSize -= 2;
      ctx.font = `900 ${fontSize}px "Fredoka", sans-serif`;
    }
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanName, 248, 56);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.4, 0.85, 1.0);
  sprite.position.set(0, 2.1, 0);
  return sprite;
}

class Game {
  private engine!: Engine;
  private physics!: PhysicsEngine;
  private input!: InputManager;
  private hud!: HUD;
  private skyWorld!: SkyWorld;
  private track!: Track;
  private checkpoints!: CheckpointSystem;
  private sparks!: SparkParticles;
  private skidmarks!: SkidmarkSystem;

  private state: GameState = GameState.MENU;
  private selectedKartIndex: number = 0;
  private playerName: string = 'SPEEDSTER';
  private isMultiplayer: boolean = false;
  private isHardcoreMode: boolean = false;
  private isRumbleMode: boolean = false;
  private rumbleManager?: RumbleManager | null;
  private selectedRumbleFormat: 'tdm' | 'ffa' = 'tdm';
  private selectedRumbleSide: 'frost' | 'blaze' = 'frost';
  private selectedRumbleRule: string = 'kills_10';
  private selectedMpMode: MpGameMode = 'classic';
  private selectedMpTimeAttackTrack: 'classic' | 'hardcore' = 'classic';
  public isNoCollisionMode: boolean = false;
  private isTimeAttackSolo: boolean = true;
  private selectedMpRumbleFormat: 'tdm' | 'ffa' = 'tdm';
  private selectedMpRumbleRule: string = 'kills_10';
  private rumbleScoreSyncTimer: number = 0;
  private isModeSelectOpen: boolean = false;
  private isStoreOpen: boolean = false;
  private lastKnownLobbyPlayerIds: Set<string> = new Set();

  // 3D Showroom Lobby Turntable (360° Rotating Showcase)
  private showroomGroup!: THREE.Group;
  private showroomTurntable!: THREE.Group;
  private showroomKart?: Kart;
  private isUserDraggingTurntable: boolean = false;
  private showroomClouds: THREE.Group[] = [];
  private showroomBalloons: THREE.Group[] = [];
  private showroomFlags: THREE.Mesh[] = [];
  private showroomCloudTime: number = 0;

  private player!: PlayerKart;
  private allKarts: Kart[] = [];
  private bots: BotKart[] = [];
  private remoteRacers: Map<string, RemoteRacer> = new Map();

  private raceTimer: number = 0;
  private raceStartTime: number = 0;
  private countdownInterval: number | null = null;
  private lastAnnouncedCountdown: string = '';
  private netBroadcastTimer: number = 0;
  private wrongWayTimer: number = 0;
  private hostLaps: number = 3;
  private draftAlertCooldown: number = 0;
  private playerWasInTube: boolean = false;

  // Finish Countdown & Spectator Mode
  private isPlayerFinished: boolean = false;
  private playerFinishRank: number = 0;
  private playerFinishTime: number = 0;
  private finishCountdownActive: boolean = false;
  private finishCountdownTimer: number = 15.0;
  private firstWinnerName: string = '';
  private isSpectating: boolean = false;
  private spectatedTargetIdx: number = 0;
  private lastLapCompletedTime: number = 0;
  private racerFinishTimes: Map<string, number> = new Map();
  private postRaceCoinsInterval: number | null = null;

  // AFK Lobby Watchdog & Mid-Race Spectator Queue
  private lastLobbyInteractionTime: number = Date.now();
  private afkWarningActive: boolean = false;
  private isMidRaceSpectator: boolean = false;

  private recordLobbyActivity = () => {
    const now = Date.now();
    if (now - this.lastLobbyInteractionTime < 2000) return;
    this.lastLobbyInteractionTime = now;
    this.afkWarningActive = false;
  };

  // Sky Rumble 3-Second Victory Outro Celebration
  private isRumbleOutroActive: boolean = false;
  private rumbleOutroTimer: number = 0;
  private pendingRumbleFinish: { winningTeam: RumbleTeam | 'draw'; winnerName: string } | null = null;
  private rumbleVictoryTimeout: number | null = null;

  public async init() {
    const updateLoader = (pct: number, statusText: string) => {
      const bar = document.getElementById('loader-bar-fill');
      const status = document.getElementById('loader-status');
      const pctEl = document.getElementById('loader-pct-val');
      const rpmEl = document.getElementById('loader-rpm-val');
      if (bar) bar.style.width = `${pct}%`;
      if (status) status.innerText = statusText;
      if (pctEl) pctEl.innerText = `${pct}%`;
      if (rpmEl) {
        const rpm = Math.round(1800 + (pct / 100) * 7800);
        rpmEl.innerText = `${rpm.toLocaleString()} RPM`;
      }
      const revLeds = document.querySelectorAll('.rpm-segment');
      const activeCount = Math.round((pct / 100) * revLeds.length);
      revLeds.forEach((led, i) => {
        led.classList.toggle('active', i < activeCount);
      });
    };

    // Safety fallback timer: guarantee loading screen dismisses within 5.5 seconds even on slow mobile devices
    const safetyDismissTimer = setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen && loadingScreen.style.display !== 'none') {
        console.warn('[Safety Loader] Forcing loading screen dismiss');
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 500);
      }
    }, 5500);

    updateLoader(20, 'POLISHING THE DRIFT WHEELS...');
    // 1. Initialize WASM Physics
    await PhysicsEngine.init();
    this.physics = new PhysicsEngine();

    updateLoader(40, 'TUNING TINY TURBO ENGINES...');
    // 2. Initialize Three.js Engine
    this.engine = new Engine();

    // Apply User Settings (Volume, Graphics, Shadows, FPS Counter)
    const initSettings = settings.get();
    sounds.setVolume(initSettings.volume);
    sounds.setMuted(initSettings.muted);
    this.engine.setGraphicsPreset(initSettings.graphics);
    this.engine.setShadows(initSettings.shadows);
    const fpsTracker = document.getElementById('perf-fps-tracker');
    if (fpsTracker) fpsTracker.style.display = initSettings.fpsCounter ? 'flex' : 'none';
    settingsModal.setEngine(this.engine);

    updateLoader(60, 'BREWING FRESH NITRO JUICE...');
    // 3. Input & HUD
    this.input = new InputManager();
    this.hud = new HUD();
    this.hud.hideHUD();

    updateLoader(80, 'FLUFFING SKY CLOUDS & CURBS...');
    // 4. World
    this.skyWorld = new SkyWorld(this.engine.scene);
    this.track = new Track(this.engine.scene, this.physics);
    this.checkpoints = new CheckpointSystem(this.track);
    this.sparks = new SparkParticles(this.engine.scene);
    this.skidmarks = new SkidmarkSystem(this.engine.scene);

    // Dynamic Lap Feedback, Personal Best Lap Check, +1 Nitro Refill, and Race Finish hooks
    this.bindCheckpointCallbacks();

    // Multiplayer finish countdown sync
    net.onFirstFinishReceived = (winnerPeerId, winnerName, countdownSeconds) => {
      this.startFinishCountdown(winnerName, countdownSeconds);
    };

    updateLoader(95, 'WARMING UP THE PITLANE...');
    // 5. Setup Collision detection & recoil
    this.setupCollisionDetection();

    // 6. Setup UI Event Listeners
    this.setupUIEvents();

    // Initialize Economy & Lobby Display
    economy.updateUI();

    // 7. Register Render Loop
    this.engine.onUpdate((dt) => this.update(dt));
    this.engine.start();

    // Start with 3D Showroom Lobby Turntable
    this.setupShowroom();
    this.setupMenuCamera();

    updateLoader(100, 'SYSTEM READY // WELCOME TO AIRSKIDO');

    clearTimeout(safetyDismissTimer);
    // Fade out loading screen smoothly
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      setTimeout(() => {
        loadingScreen.classList.add('fade-out');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 500);
      }, 350);
    }
  }

  private readonly STUDIO_Y = 400.0;

  private setupShowroom() {
    this.hud.hideHUD();
    this.showroomGroup = new THREE.Group();
    this.showroomGroup.position.set(0, this.STUDIO_Y, 0);
    this.showroomClouds = [];
    this.showroomBalloons = [];
    this.showroomFlags = [];

    // ── 1. STYLIZED FLOATING SKY ISLAND PODIUM (Exact in-game asset style) ──
    const islandGroup = new THREE.Group();

    // Material definitions matching in-game SkyWorld
    const rockMat = new THREE.MeshLambertMaterial({
      color: 0x54473d, // Slate rock
      flatShading: true,
    });
    const grassMat = new THREE.MeshLambertMaterial({
      color: 0x48bb36, // Vibrant green grass
      flatShading: true,
    });
    const foliageMat = new THREE.MeshLambertMaterial({
      color: 0x228834, // Evergreen canopy
      flatShading: true,
    });
    const woodMat = new THREE.MeshLambertMaterial({
      color: 0x8a6d4d, // Timber trunk
      flatShading: true,
    });

    const rockSegments = 8;
    const islandRadius = 4.2;

    // 1a. Lush Green Grass Cap (Plateau with sculpted lip)
    const grassDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(islandRadius * 1.02, islandRadius * 0.96, 0.45, rockSegments),
      grassMat
    );
    grassDeck.position.y = 0;
    grassDeck.receiveShadow = true;
    islandGroup.add(grassDeck);

    // Subtle grass lip trim
    const grassLip = new THREE.Mesh(
      new THREE.CylinderGeometry(islandRadius * 1.05, islandRadius * 1.02, 0.15, rockSegments),
      grassMat
    );
    grassLip.position.y = 0.15;
    islandGroup.add(grassLip);

    // 1b. Grand Prix Checkered Racing Curb (Pro Circuit Curbs)
    const curbCanvas = document.createElement('canvas');
    curbCanvas.width = 512;
    curbCanvas.height = 32;
    const cCtx = curbCanvas.getContext('2d')!;
    const segs = 32;
    const cw = 512 / segs;
    for (let i = 0; i < segs; i++) {
      cCtx.fillStyle = i % 2 === 0 ? '#E11D48' : '#FFFFFF';
      cCtx.fillRect(i * cw, 0, cw, 32);
      cCtx.fillStyle = 'rgba(0,0,0,0.18)';
      cCtx.fillRect(i * cw, 26, cw, 6);
    }
    const curbTex = new THREE.CanvasTexture(curbCanvas);
    curbTex.wrapS = THREE.RepeatWrapping;
    curbTex.wrapT = THREE.ClampToEdgeWrapping;
    const curbGeom = new THREE.RingGeometry(3.92, 4.38, 36);
    curbGeom.rotateX(-Math.PI / 2);
    const curbMesh = new THREE.Mesh(
      curbGeom,
      new THREE.MeshBasicMaterial({ map: curbTex, side: THREE.DoubleSide })
    );
    curbMesh.position.y = 0.226;
    islandGroup.add(curbMesh);

    // 1c. Turntable Pedestal Base Plate & Glowing Cyan Neon Ring
    const basePlate = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15, 2.15, 0.03, 36),
      new THREE.MeshLambertMaterial({ color: 0x0F172A })
    );
    basePlate.position.y = 0.224;
    islandGroup.add(basePlate);

    const neonRingGeom = new THREE.RingGeometry(2.02, 2.16, 36);
    neonRingGeom.rotateX(-Math.PI / 2);
    const neonRing = new THREE.Mesh(
      neonRingGeom,
      new THREE.MeshBasicMaterial({ color: 0x00E5FF, side: THREE.DoubleSide })
    );
    neonRing.position.y = 0.228;
    islandGroup.add(neonRing);

    // 1d. Layered Tapered Rock Underside (Inverted mountain cliff base)
    const tier1 = new THREE.Mesh(
      new THREE.CylinderGeometry(islandRadius * 0.96, islandRadius * 0.65, 1.8, rockSegments),
      rockMat
    );
    tier1.position.y = -1.0;
    islandGroup.add(tier1);

    const tier2 = new THREE.Mesh(
      new THREE.CylinderGeometry(islandRadius * 0.65, islandRadius * 0.30, 1.6, rockSegments),
      rockMat
    );
    tier2.position.y = -2.6;
    islandGroup.add(tier2);

    const tier3 = new THREE.Mesh(
      new THREE.ConeGeometry(islandRadius * 0.30, 1.6, rockSegments),
      rockMat
    );
    tier3.rotation.x = Math.PI;
    tier3.position.y = -4.1;
    islandGroup.add(tier3);

    // 1e. Stylized Low-Poly Pine Trees (Framing the car from behind and sides)
    const treeDefs = [
      { x: -3.0, z: -1.6, s: 0.68 },
      { x: -1.9, z: -2.9, s: 0.92 },
      { x:  0.0, z: -3.4, s: 1.05 },
      { x:  1.9, z: -2.9, s: 0.88 },
      { x:  3.0, z: -1.6, s: 0.65 },
    ];

    treeDefs.forEach(({ x, z, s }) => {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.2 * s, 5),
        woodMat
      );
      trunk.position.set(x, 0.22 + 0.6 * s, z);
      islandGroup.add(trunk);

      for (let tier = 0; tier < 3; tier++) {
        const coneH = 1.15 * s;
        const coneR = (1.05 - tier * 0.22) * s;
        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(coneR, coneH, 6),
          foliageMat
        );
        canopy.position.set(x, 0.22 + (0.95 + tier * 0.72) * s, z);
        canopy.castShadow = true;
        islandGroup.add(canopy);
      }
    });

    // 1f. Twin Grand Prix Checkered Flagpoles at rear flanks
    const flagCanvas = document.createElement('canvas');
    flagCanvas.width = 128;
    flagCanvas.height = 64;
    const fCtx = flagCanvas.getContext('2d')!;
    const fCols = 8;
    const fRows = 4;
    const fColW = 128 / fCols;
    const fRowH = 64 / fRows;
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        fCtx.fillStyle = (r + c) % 2 === 0 ? '#FFFFFF' : '#0B0F19';
        fCtx.fillRect(c * fColW, r * fRowH, fColW, fRowH);
      }
    }
    const flagTex = new THREE.CanvasTexture(flagCanvas);
    const flagMat = new THREE.MeshLambertMaterial({
      map: flagTex,
      side: THREE.DoubleSide,
    });
    const poleMat = new THREE.MeshLambertMaterial({ color: 0xD1D5DB });
    const finialMat = new THREE.MeshLambertMaterial({ color: 0xF59E0B });

    [[-2.7, -2.6], [2.7, -2.6]].forEach(([fx, fz]) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 3.8, 8),
        poleMat
      );
      pole.position.set(fx, 0.22 + 1.9, fz);
      islandGroup.add(pole);

      const finial = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 8),
        finialMat
      );
      finial.position.set(fx, 0.22 + 3.85, fz);
      islandGroup.add(finial);

      const flagGeom = new THREE.PlaneGeometry(1.2, 0.65, 4, 2);
      const flagMesh = new THREE.Mesh(flagGeom, flagMat);
      flagMesh.position.set(fx + (fx < 0 ? 0.6 : -0.6), 0.22 + 3.4, fz);
      flagMesh.rotation.y = fx < 0 ? Math.PI * 0.15 : -Math.PI * 0.15;
      this.showroomFlags.push(flagMesh);
      islandGroup.add(flagMesh);
    });

    // 1g. Soft Contact Shadow under Kart Wheels
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(128, 128, 15, 128, 128, 120);
    grad.addColorStop(0, 'rgba(10, 30, 10, 0.75)');
    grad.addColorStop(0.45, 'rgba(10, 30, 10, 0.35)');
    grad.addColorStop(0.85, 'rgba(10, 30, 10, 0.08)');
    grad.addColorStop(1, 'rgba(10, 30, 10, 0.0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 256, 256);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowGeom = new THREE.PlaneGeometry(3.6, 3.6);
    shadowGeom.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.position.y = 0.231;
    islandGroup.add(shadowMesh);

    this.showroomGroup.add(islandGroup);

    // ── 2. VOLUMINOUS 3D CLOUD SEA ──
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xebf4ff,
      transparent: true,
      opacity: 0.92,
      flatShading: true,
    });
    const puffGeom = new THREE.DodecahedronGeometry(1, 1);

    const spawnVolumetricCloud = (x: number, y: number, z: number, scale: number) => {
      const cluster = new THREE.Group();
      const numPuffs = 6;
      for (let j = 0; j < numPuffs; j++) {
        const puff = new THREE.Mesh(puffGeom, cloudMat);
        const s = (2.2 + Math.random() * 2.2) * scale;
        puff.scale.set(s, s * 0.58, s * 0.95);
        puff.position.set(
          (Math.random() - 0.5) * 4.2 * scale,
          (Math.random() - 0.5) * 1.4 * scale,
          (Math.random() - 0.5) * 4.2 * scale
        );
        cluster.add(puff);
      }
      cluster.position.set(x, y, z);
      cluster.userData = { baseX: x, baseY: y, phase: Math.random() * Math.PI * 2 };
      this.showroomClouds.push(cluster);
      this.showroomGroup.add(cluster);
    };

    const cloudLayout = [
      { x: -7.2, y: -1.35, z:  4.2, s: 0.95 },
      { x:  7.5, y: -1.45, z:  3.8, s: 0.90 },
      { x: -5.2, y: -3.5, z: -5.5, s: 1.55 },
      { x:  5.4, y: -3.6, z: -6.0, s: 1.50 },
      { x:  0.0, y: -4.4, z: -7.5, s: 1.80 },
      { x: -14.5, y: -2.2, z: -15.0, s: 1.70 },
      { x:  15.0, y: -2.0, z: -14.5, s: 1.65 },
    ];
    cloudLayout.forEach((cl) => spawnVolumetricCloud(cl.x, cl.y, cl.z, cl.s));

    // ── 3. DISTANT FLOATING ARCHIPELAGO ISLANDS ──
    const spawnDistantIsland = (
      ix: number, iy: number, iz: number, s: number, numTrees: number
    ) => {
      const miniGroup = new THREE.Group();
      const r = 2.4 * s;
      const grass = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.05, r * 0.95, 0.35 * s, 6),
        grassMat
      );
      grass.position.y = 0;
      miniGroup.add(grass);

      const rock1 = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.95, r * 0.45, 1.4 * s, 6),
        rockMat
      );
      rock1.position.y = -0.8 * s;
      miniGroup.add(rock1);

      const rock2 = new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.45, 1.2 * s, 6),
        rockMat
      );
      rock2.rotation.x = Math.PI;
      rock2.position.y = -2.0 * s;
      miniGroup.add(rock2);

      for (let t = 0; t < numTrees; t++) {
        const angle = (t / numTrees) * Math.PI * 2 + 0.3;
        const dist = (0.35 + (t % 2) * 0.35) * r;
        const tx = Math.cos(angle) * dist;
        const tz = Math.sin(angle) * dist;
        const ts = (0.5 + (t % 3) * 0.2) * s;

        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08 * ts, 0.12 * ts, 0.8 * ts, 5),
          woodMat
        );
        trunk.position.set(tx, 0.4 * ts, tz);
        miniGroup.add(trunk);

        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(0.7 * ts, 1.4 * ts, 5),
          foliageMat
        );
        canopy.position.set(tx, 1.1 * ts, tz);
        miniGroup.add(canopy);
      }

      const cloudPuff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.6 * s, 1),
        cloudMat
      );
      cloudPuff.scale.set(1.4, 0.6, 1.2);
      cloudPuff.position.set(0, -1.8 * s, 0);
      miniGroup.add(cloudPuff);

      miniGroup.position.set(ix, iy, iz);
      this.showroomGroup.add(miniGroup);
    };

    spawnDistantIsland(-18,  3.5, -23, 1.15, 3);
    spawnDistantIsland( 21,  4.2, -26, 1.05, 3);
    spawnDistantIsland(-21, -3.2, -18, 1.20, 2);
    spawnDistantIsland( 20, -2.8, -17, 1.00, 2);
    spawnDistantIsland( -2,  8.0, -32, 0.85, 2);

    // ── 4. COLORFUL HOT AIR BALLOONS (Matching Reference Art Atmosphere) ──
    const spawnHotAirBalloon = (
      bx: number, by: number, bz: number, s: number,
      bodyColor: number, stripeColor: number
    ) => {
      const balloon = new THREE.Group();
      const envGeom = new THREE.SphereGeometry(1.6 * s, 16, 14);
      envGeom.scale(1, 1.32, 1);
      const envelope = new THREE.Mesh(
        envGeom,
        new THREE.MeshLambertMaterial({ color: bodyColor, flatShading: true })
      );
      envelope.position.y = 2.1 * s;
      balloon.add(envelope);

      const band = new THREE.Mesh(
        new THREE.TorusGeometry(1.58 * s, 0.12 * s, 8, 20),
        new THREE.MeshLambertMaterial({ color: stripeColor, flatShading: true })
      );
      band.rotation.x = Math.PI / 2;
      band.position.y = 2.1 * s;
      balloon.add(band);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.15 * s, 1.0 * s, 16, 1, true),
        new THREE.MeshLambertMaterial({ color: stripeColor, flatShading: true })
      );
      cone.rotation.x = Math.PI;
      cone.position.y = 0.85 * s;
      balloon.add(cone);

      const burner = new THREE.Mesh(
        new THREE.TorusGeometry(0.35 * s, 0.05 * s, 6, 12),
        new THREE.MeshLambertMaterial({ color: 0xF59E0B })
      );
      burner.rotation.x = Math.PI / 2;
      burner.position.y = 0.3 * s;
      balloon.add(burner);

      const basket = new THREE.Mesh(
        new THREE.BoxGeometry(0.65 * s, 0.52 * s, 0.65 * s),
        new THREE.MeshLambertMaterial({ color: 0x92613B, flatShading: true })
      );
      basket.position.y = -0.16 * s;
      balloon.add(basket);

      balloon.position.set(bx, by, bz);
      balloon.userData = {
        baseX: bx,
        baseY: by,
        phase: Math.random() * Math.PI * 2,
        speed: 0.65 + Math.random() * 0.35,
      };
      this.showroomBalloons.push(balloon);
      this.showroomGroup.add(balloon);
    };

    spawnHotAirBalloon(-12,  7.2, -21, 0.95, 0xE11D48, 0xFFFFFF); // Classic Crimson & White
    spawnHotAirBalloon( 15,  9.8, -25, 0.80, 0x00D2FF, 0xFFDE59); // Electric Cyan & Yellow
    spawnHotAirBalloon( 25,  4.8, -28, 0.65, 0x8B5CF6, 0xF97316); // Purple & Tangerine

    // ── 5. ROTATING TURNTABLE PIVOT ON TOP OF GRASS ISLAND ──
    this.showroomTurntable = new THREE.Group();
    this.showroomTurntable.position.set(0, 0.22, 0);
    this.showroomGroup.add(this.showroomTurntable);

    // ── 6. LIGHTING MATCHING IN-GAME VIBRANT SKYWORLD ──
    const studioAmb = new THREE.AmbientLight(0xffffff, 0.90);
    this.showroomGroup.add(studioAmb);

    const hemiLight = new THREE.HemisphereLight(0x70b5ff, 0x3d7040, 0.65);
    this.showroomGroup.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.45);
    keyLight.position.set(8, 14, 10);
    this.showroomGroup.add(keyLight);

    const rimLight = new THREE.PointLight(0xffde59, 1.2, 24);
    rimLight.position.set(-6, 5, -8);
    this.showroomGroup.add(rimLight);

    // Subtle neon underglow under kart turntable
    const underglow = new THREE.PointLight(0x00E5FF, 1.6, 6);
    underglow.position.set(0, 0.45, 0);
    this.showroomGroup.add(underglow);

    this.engine.scene.add(this.showroomGroup);

    // Spawn initial kart
    this.updateShowroomKart(this.selectedKartIndex);
  }

  private updateShowroomKart(kartIndex: number) {
    if (this.showroomKart) {
      this.showroomKart.dispose(this.showroomTurntable);
      this.showroomKart = undefined;
    }
    this.selectedKartIndex = (kartIndex + KART_CONFIGS.length) % KART_CONFIGS.length;
    net.selectedKart = this.selectedKartIndex;

    // Create showroom kart attached directly to the rotating turntable!
    this.showroomKart = new Kart(
      'showroom-kart',
      this.selectedKartIndex,
      this.showroomTurntable,
      undefined,
      new THREE.Vector3(0, 0.10, 0),
      new THREE.Quaternion()
    );
    this.showroomKart.setCastShadow(true);

    // Update stats bars in UI
    const cfg = KART_CONFIGS[this.selectedKartIndex];
    const speedPercent = Math.round(THREE.MathUtils.mapLinear(cfg.topSpeed, 40, 54, 45, 95));
    const weightPercent = Math.round(THREE.MathUtils.mapLinear(cfg.weight, 0.8, 1.9, 40, 95));
    const gripPercent = Math.round(THREE.MathUtils.mapLinear(cfg.driftGrip, 1.0, 1.9, 45, 95));

    const barSpeed = document.getElementById('stat-bar-speed');
    const barWeight = document.getElementById('stat-bar-weight');
    const barGrip = document.getElementById('stat-bar-grip');
    if (barSpeed) barSpeed.style.width = `${speedPercent}%`;
    if (barWeight) barWeight.style.width = `${weightPercent}%`;
    if (barGrip) barGrip.style.width = `${gripPercent}%`;

    // Update Hero Specs Badge
    const nameEl = document.getElementById('machine-name-text');
    const classEl = document.getElementById('machine-class-tag');
    const dotEl = document.getElementById('machine-color-dot');
    if (nameEl) nameEl.innerText = cfg.name;
    if (classEl) {
      classEl.innerText =
        cfg.name === 'APEX' ? 'SPEEDSTER // VELOCITY' :
        cfg.name === 'VIPER' ? 'DRIFT KING // AGILITY' :
        cfg.name === 'TITAN' ? 'HEAVY TANK // BRAWLER' : 'ALL-ROUNDER';
    }
    if (dotEl) {
      dotEl.style.background = `#${cfg.color.toString(16).padStart(6, '0')}`;
    }

    // Highlight active pip
    const pips = document.querySelectorAll('.kart-dot-pip');
    pips.forEach((p) => {
      const idx = parseInt(p.getAttribute('data-kart') || '0', 10);
      p.classList.toggle('active', idx === this.selectedKartIndex);
    });
  }

  private setupMenuCamera() {
    this.engine.camera.fov = 65;
    this.engine.camera.updateProjectionMatrix();
    const isMobile = window.innerHeight < 560 || window.innerWidth < 860;
    if (isMobile) {
      this.engine.camera.position.set(0, this.STUDIO_Y + 1.58, 6.85);
      this.engine.camera.lookAt(0, this.STUDIO_Y + 0.48, 0);
    } else {
      this.engine.camera.position.set(0, this.STUDIO_Y + 1.75, 7.8);
      this.engine.camera.lookAt(0, this.STUDIO_Y + 0.55, 0);
    }
  }

  public userHasExitedFullscreen: boolean = false;

  public triggerFullscreen(force: boolean = false) {
    if (this.userHasExitedFullscreen && !force) {
      return;
    }
    if (force) {
      this.userHasExitedFullscreen = false;
    }
    const doc = document.documentElement as any;
    const isFs = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
    if (!isFs) {
      try {
        if (doc.requestFullscreen) {
          const req = doc.requestFullscreen({ navigationUI: 'hide' } as any);
          if (req && typeof req.catch === 'function') {
            req.catch(() => {
              if (doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
            });
          }
        } else if (doc.webkitRequestFullscreen) {
          doc.webkitRequestFullscreen();
        } else if (doc.mozRequestFullScreen) {
          doc.mozRequestFullScreen();
        } else if (doc.msRequestFullscreen) {
          doc.msRequestFullscreen();
        }
      } catch (_) {}
    }
  }

  private setupUIEvents() {
    // Interactive 3D Turntable Drag-to-Spin (Garage Showcase)
    let isDragging = false;
    let lastPointerX = 0;

    window.addEventListener('pointerdown', (e) => {
      if (this.state !== GameState.MENU) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('.garage-arrow-btn') ||
        target.closest('.machine-hero-badge') ||
        target.closest('.lobby-action-hub') ||
        target.closest('.lobby-callsign-box') ||
        target.closest('.lobby-top-bar') ||
        target.closest('#top-bar') ||
        target.closest('#mp-modal') ||
        target.closest('.showroom-bottom-deck') ||
        target.closest('#mode-select-modal') ||
        target.closest('.lobby-left-dock')
      ) {
        return;
      }
      isDragging = true;
      this.isUserDraggingTurntable = true;
      lastPointerX = e.clientX;
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging || this.state !== GameState.MENU || !this.showroomTurntable) return;
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      this.showroomTurntable.rotation.y += dx * 0.012;
    });

    const stopDragging = () => {
      if (isDragging) {
        isDragging = false;
        setTimeout(() => {
          this.isUserDraggingTurntable = false;
        }, 1200);
      }
    };
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    // Previous / Next Kart Buttons (Center Carousel Arcade Controls)
    const btnKartPrev = document.getElementById('btn-kart-prev');
    const btnKartNext = document.getElementById('btn-kart-next');
    if (btnKartPrev) {
      btnKartPrev.addEventListener('click', () => {
        sounds.playSelect();
        this.updateShowroomKart(this.selectedKartIndex - 1);
      });
    }
    if (btnKartNext) {
      btnKartNext.addEventListener('click', () => {
        sounds.playSelect();
        this.updateShowroomKart(this.selectedKartIndex + 1);
      });
    }

    // Kart dot pip selector
    const kartPips = document.querySelectorAll('.kart-dot-pip');
    kartPips.forEach((pip) => {
      pip.addEventListener('click', () => {
        const idx = parseInt(pip.getAttribute('data-kart') || '0', 10);
        sounds.playSelect();
        this.updateShowroomKart(idx);
      });
    });

    // Keyboard Arrow Keys (Left / Right / A / D) for Instant Machine Switching
    window.addEventListener('keydown', (e) => {
      if (this.state !== GameState.MENU) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        sounds.playSelect();
        this.updateShowroomKart(this.selectedKartIndex - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        sounds.playSelect();
        this.updateShowroomKart(this.selectedKartIndex + 1);
      }
    });

    // Racer Callsign & ID Architecture (Synchronized with NameSystem & CloudSyncService)
    initNameModal();

    // Time Sprint Global Top 100 Leaderboard Hub
    initLeaderboardUI();

    const updatePilotBadge = (prof: RacerProfile) => {
      this.playerName = prof.username;
      net.playerName = prof.username;
      const nameEl = document.getElementById('lobby-pilot-name');
      const idEl = document.getElementById('lobby-pilot-id');
      if (nameEl) nameEl.textContent = prof.username;
      if (idEl) idEl.textContent = '#' + prof.playerId;
      const mpNameDisplay = document.getElementById('mp-pilot-name-display');
      if (mpNameDisplay) mpNameDisplay.textContent = prof.username;
    };

    nameSystem.addListener(updatePilotBadge);

    // Mode Select Modal & Hero Action Buttons
    const btnMainPlay = document.getElementById('btn-main-play');
    const btnQuickMp = document.getElementById('btn-quick-mp');
    const modeSelectModal = document.getElementById('mode-select-modal');
    const btnCloseModeSelect = document.getElementById('btn-close-mode-select');
    const btnOpenMp = document.getElementById('btn-open-mp');
    const mpModal = document.getElementById('mp-modal');

    // Open Mode Select Modal on "PLAY NOW" Hero click
    if (btnMainPlay && modeSelectModal) {
      btnMainPlay.addEventListener('click', () => {
        sounds.playSelect();
        this.isModeSelectOpen = true;
        const modeCoinEl = document.getElementById('mode-select-coin-counter');
        if (modeCoinEl) modeCoinEl.innerText = economy.coins.toLocaleString();
        modeSelectModal.style.display = 'flex';
      });
    }

    // Close Mode Select Modal on Back / Close button
    if (btnCloseModeSelect && modeSelectModal) {
      btnCloseModeSelect.addEventListener('click', () => {
        sounds.playSelect();
        this.isModeSelectOpen = false;
        modeSelectModal.style.display = 'none';
      });
    }

    // Close Mode Select on Backdrop click
    if (modeSelectModal) {
      modeSelectModal.addEventListener('click', (e) => {
        if (e.target === modeSelectModal) {
          sounds.playSelect();
          this.isModeSelectOpen = false;
          modeSelectModal.style.display = 'none';
        }
      });
    }

    // Helper to open/close full-screen Multiplayer Hub
    const openMpHub = () => {
      sounds.playSelect();
      this.isModeSelectOpen = false;
      if (modeSelectModal) modeSelectModal.style.display = 'none';
      if (mpModal) {
        mpModal.style.display = 'flex';
        mpModal.classList.add('open');
      }
      const mpNameDisplay = document.getElementById('mp-pilot-name-display');
      if (mpNameDisplay) mpNameDisplay.textContent = this.playerName.toUpperCase();
      const mpNameEl = document.getElementById('mp-name-input') as HTMLInputElement | null;
      if (mpNameEl) mpNameEl.value = this.playerName;

      if (!this.isMultiplayer || !net.roomCode) {
        this.resetMpLobbyUI();
      }
    };

    const closeMpHub = () => {
      sounds.playSelect();
      if (mpModal) {
        mpModal.classList.remove('open');
        mpModal.style.display = 'none';
      }
    };

    // Quick Multiplayer Shortcut Button
    if (btnQuickMp && mpModal) {
      btnQuickMp.addEventListener('click', () => {
        openMpHub();
      });
    }

    // Open MP from Mode Select Card
    if (btnOpenMp) {
      btnOpenMp.addEventListener('click', (e) => {
        e.preventDefault();
        openMpHub();
      });
    }

    // ESC key closes modals smoothly OR opens Settings
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (settingsModal.isOpen()) {
          settingsModal.close();
        } else if (storeModal.isOpen()) {
          storeModal.close();
        } else if (modeSelectModal && modeSelectModal.style.display !== 'none') {
          this.isModeSelectOpen = false;
          modeSelectModal.style.display = 'none';
        } else if (mpModal && (mpModal.classList.contains('open') || mpModal.style.display !== 'none')) {
          closeMpHub();
        } else {
          // Open Settings!
          settingsModal.open();
        }
      }
    });

    // Close multiplayer popup modal
    const closeMpBtn = document.getElementById('btn-close-mp');
    if (closeMpBtn) {
      closeMpBtn.addEventListener('click', () => {
        closeMpHub();
      });
    }

    // Close when clicking modal backdrop
    if (mpModal) {
      mpModal.addEventListener('click', (e) => {
        if (e.target === mpModal) {
          closeMpHub();
        }
      });
    }



    // Multiplayer Mode Selection Cards (Classic vs Sky Rumble vs Hardcore vs Time Attack)
    const mpModeCards = document.querySelectorAll('.mp-mode-card');
    const mpLapsRow = document.getElementById('mp-laps-row');
    const mpRumbleRow = document.getElementById('mp-rumble-settings-row');
    const mpTrackRow = document.getElementById('mp-track-row');

    mpModeCards.forEach((card) => {
      card.addEventListener('click', () => {
        sounds.playSelect();
        mpModeCards.forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        const mode = (card.getAttribute('data-mode') || 'classic') as MpGameMode;
        this.selectedMpMode = mode;
        if (mode === 'rumble') {
          if (mpLapsRow) mpLapsRow.style.display = 'none';
          if (mpTrackRow) mpTrackRow.style.display = 'none';
          if (mpRumbleRow) mpRumbleRow.style.display = 'flex';
        } else if (mode === 'time_attack') {
          if (mpLapsRow) mpLapsRow.style.display = 'flex';
          if (mpTrackRow) mpTrackRow.style.display = 'flex';
          if (mpRumbleRow) mpRumbleRow.style.display = 'none';
        } else {
          if (mpLapsRow) mpLapsRow.style.display = 'flex';
          if (mpTrackRow) mpTrackRow.style.display = 'none';
          if (mpRumbleRow) mpRumbleRow.style.display = 'none';
        }
      });
    });

    // Time Attack Circuit Selector (Classic vs Hardcore)
    const mpTrackBtns = document.querySelectorAll('#mp-track-select-group .track-choice-btn, #mp-track-select-group .lap-choice-btn');
    mpTrackBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        mpTrackBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMpTimeAttackTrack = (btn.getAttribute('data-track') || 'classic') as 'classic' | 'hardcore';
      });
    });

    // Rumble Format Pill Selector (TDM vs Solo FFA)
    const rumbleFormatOpts = document.querySelectorAll('#mp-rumble-format-selector .mp-pill-opt');
    rumbleFormatOpts.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        rumbleFormatOpts.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMpRumbleFormat = (btn.getAttribute('data-format') || 'tdm') as 'tdm' | 'ffa';
      });
    });

    // Rumble Win Goal Pill Selector (10 kills, 20 kills, 3m timer)
    const rumbleRuleOpts = document.querySelectorAll('#mp-rumble-rule-selector .mp-pill-opt');
    rumbleRuleOpts.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        rumbleRuleOpts.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMpRumbleRule = btn.getAttribute('data-rule') || 'kills_10';
      });
    });

    // Leave multiplayer room & return to lobby options
    const leaveMpBtn = document.getElementById('btn-leave-mp');
    if (leaveMpBtn) {
      leaveMpBtn.addEventListener('click', () => {
        sounds.playSelect();
        this.leaveMultiplayerLobby(true);
        this.hud.showAlert('LEFT ROOM', 'respawn');
      });
    }

    // Lap Selector Buttons (Host Lobby) - strictly scoped to #lap-select-group
    const lapButtons = document.querySelectorAll('#lap-select-group .lap-choice-btn');
    lapButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        lapButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.hostLaps = parseInt(btn.getAttribute('data-laps') || '3', 10);
      });
    });

    // Fullscreen exit detection: When user exits (via ESC or browser UI), remember choice
    const onFsChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (!isFs) {
        this.userHasExitedFullscreen = true;
        // If user was in race and exited fullscreen (e.g. by pressing ESC in browser), ensure Settings opens!
        if (settingsModal.getIsInRace() && !settingsModal.isOpen()) {
          settingsModal.open();
        }
      }
      this.hud?.updateTouchControlsVisibility();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('resize', () => {
      this.hud?.updateTouchControlsVisibility();
    }, { passive: true });

    // Initial Fullscreen gesture: Only attempts once on initial user interaction, NEVER forces after user exits
    let hasAttemptedInitialFullscreen = false;
    const handleFullscreenGesture = (e: Event) => {
      if (hasAttemptedInitialFullscreen || this.userHasExitedFullscreen) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('.name-modal-card') ||
          target.closest('#name-modal'))
      ) {
        return;
      }

      hasAttemptedInitialFullscreen = true;
      this.triggerFullscreen(false);
    };

    window.addEventListener('touchend', handleFullscreenGesture, { passive: true });
    window.addEventListener('click', handleFullscreenGesture);

    // In-Game Top Bar Fullscreen Toggle Button (Dedicated button click -> force = true)
    const fsInGameBtn = document.getElementById('in-game-fullscreen-btn');
    if (fsInGameBtn) {
      fsInGameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isFs = !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );
        if (!isFs) {
          this.triggerFullscreen(true);
        } else {
          this.userHasExitedFullscreen = true;
          try {
            if (document.exitFullscreen) {
              document.exitFullscreen().catch(() => {});
            } else if ((document as any).webkitExitFullscreen) {
              (document as any).webkitExitFullscreen().catch(() => {});
            } else if ((document as any).mozCancelFullScreen) {
              (document as any).mozCancelFullScreen().catch(() => {});
            } else if ((document as any).msExitFullscreen) {
              (document as any).msExitFullscreen().catch(() => {});
            }
          } catch (_) {}
        }
      });

      const updateFsBtnLabel = () => {
        const isFs = !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        );
        fsInGameBtn.innerText = isFs ? '⛶ EXIT FULL' : '⛶ FULLSCREEN';
      };
      document.addEventListener('fullscreenchange', updateFsBtnLabel);
      document.addEventListener('webkitfullscreenchange', updateFsBtnLabel);
    }

    // Host Room Button
    const btnHost = document.getElementById('btn-host-room') as HTMLButtonElement | null;
    if (btnHost) {
      btnHost.addEventListener('click', async () => {
        sounds.playSelect();
        btnHost.disabled = true;
        btnHost.innerText = 'CREATING ROOM...';
        const codeDisplay = document.getElementById('lobby-code-display');
        if (codeDisplay) codeDisplay.innerText = 'GENERATING...';
        try {
          const actualMpMode: MpGameMode = this.selectedMpMode === 'time_attack'
            ? (this.selectedMpTimeAttackTrack === 'hardcore' ? 'time_attack_hardcore' : 'time_attack')
            : this.selectedMpMode;

          const code = await net.initHost(
            this.playerName,
            this.selectedKartIndex,
            this.hostLaps,
            actualMpMode,
            this.selectedMpRumbleRule,
            this.selectedMpRumbleFormat,
            economy.getEquippedSkin(),
            economy.isVip(),
            economy.getLevel()
          );
          btnHost.innerText = '★ CREATE MULTIPLAYER LOBBY ★';
          btnHost.disabled = false;

          const optionsGrid = document.getElementById('mp-options-grid');
          const lobbyView = document.getElementById('lobby-view');
          const lapsDisplay = document.getElementById('lobby-laps-display');
          const modeDisplay = document.getElementById('lobby-mode-display');
          const mpLaunchBtn = document.getElementById('btn-start-multiplayer') as HTMLButtonElement | null;

          if (optionsGrid) optionsGrid.style.display = 'none';
          if (lobbyView) lobbyView.style.display = 'flex';
          if (codeDisplay) codeDisplay.innerText = code;

          if (modeDisplay) {
            if (this.selectedMpMode === 'rumble') {
              modeDisplay.innerText = `SKY RUMBLE (${this.selectedMpRumbleFormat === 'tdm' ? 'TDM' : 'FFA'})`;
            } else if (this.selectedMpMode === 'hardcore') {
              modeDisplay.innerText = 'HARDCORE SKY';
            } else if (this.selectedMpMode === 'time_attack') {
              modeDisplay.innerText = `TIME SPRINT (${this.selectedMpTimeAttackTrack.toUpperCase()})`;
            } else {
              modeDisplay.innerText = 'CLASSIC GRAND PRIX';
            }
          }
          if (lapsDisplay) {
            if (this.selectedMpMode === 'rumble') {
              lapsDisplay.innerText = this.selectedMpRumbleRule === 'time_3m' ? '3 MIN TIMER' : (this.selectedMpRumbleRule === 'kills_20' ? '20 KILLS' : (this.selectedMpRumbleRule === 'lives_3' ? '3 LIVES' : '10 KILLS'));
            } else {
              lapsDisplay.innerText = `${this.hostLaps} ${this.hostLaps === 1 ? 'LAP' : 'LAPS'}`;
            }
          }

          if (mpLaunchBtn) {
            mpLaunchBtn.style.display = 'inline-flex';
            mpLaunchBtn.innerText = 'LAUNCH MULTIPLAYER MATCH';
            mpLaunchBtn.removeAttribute('disabled');
          }

          this.hud.setRoomBadge(code);
          this.hud.showAlert(`ROOM READY // ${code}`, 'smash');
        } catch (err: any) {
          btnHost.innerText = '★ CREATE MULTIPLAYER LOBBY ★';
          btnHost.disabled = false;
          this.hud.showAlert('HOST FAILED // RETRY', 'respawn');
        }
      });
    }

    // Join Room Button
    const btnJoin = document.getElementById('btn-join-room') as HTMLButtonElement | null;
    const joinInput = document.getElementById('join-room-input') as HTMLInputElement | null;
    if (btnJoin && joinInput) {
      joinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          btnJoin.click();
        }
      });

      btnJoin.addEventListener('click', async () => {
        sounds.playSelect();
        const code = joinInput.value.trim().toUpperCase();
        if (!code) {
          this.hud.showAlert('ENTER ROOM CODE', 'recoil');
          return;
        }
        btnJoin.disabled = true;
        btnJoin.innerText = 'CONNECTING...';
        try {
          await net.joinRoom(
            code,
            this.playerName,
            this.selectedKartIndex,
            economy.getEquippedSkin(),
            economy.isVip(),
            economy.getLevel()
          );
          btnJoin.innerText = '▶ JOIN LOBBY';
          btnJoin.disabled = false;

          const optionsGrid = document.getElementById('mp-options-grid');
          const lobbyView = document.getElementById('lobby-view');
          const codeDisplay = document.getElementById('lobby-code-display');
          const lapsDisplay = document.getElementById('lobby-laps-display');
          const modeDisplay = document.getElementById('lobby-mode-display');
          const mpLaunchBtn = document.getElementById('btn-start-multiplayer') as HTMLButtonElement | null;

          if (optionsGrid) optionsGrid.style.display = 'none';
          if (lobbyView) lobbyView.style.display = 'flex';
          if (codeDisplay) codeDisplay.innerText = net.roomCode;

          if (modeDisplay) {
            if (net.selectedMode === 'rumble') {
              modeDisplay.innerText = `SKY RUMBLE (${net.selectedRumbleFormat === 'tdm' ? 'TDM' : 'FFA'})`;
            } else if (net.selectedMode === 'hardcore') {
              modeDisplay.innerText = 'HARDCORE SKY';
            } else {
              modeDisplay.innerText = 'CLASSIC GRAND PRIX';
            }
          }
          if (lapsDisplay) {
            if (net.selectedMode === 'rumble') {
              lapsDisplay.innerText = net.selectedRumbleRule === 'time_3m' ? '3 MIN TIMER' : (net.selectedRumbleRule === 'kills_20' ? '20 KILLS' : (net.selectedRumbleRule === 'lives_3' ? '3 LIVES' : '10 KILLS'));
            } else {
              lapsDisplay.innerText = `${net.selectedLaps} ${net.selectedLaps === 1 ? 'LAP' : 'LAPS'}`;
            }
          }

          if (mpLaunchBtn) {
            mpLaunchBtn.style.display = 'inline-flex';
            mpLaunchBtn.innerText = 'WAITING FOR HOST TO START...';
            mpLaunchBtn.setAttribute('disabled', 'true');
          }

          this.hud.setRoomBadge(net.roomCode);
          this.hud.showAlert(`JOINED ROOM // ${net.roomCode}`, 'smash');
        } catch (err: any) {
          const errMsg = err.message?.toUpperCase() || 'CONNECTION FAILED';
          btnJoin.innerText = errMsg;
          btnJoin.disabled = false;
          setTimeout(() => {
            if (btnJoin && !btnJoin.disabled && btnJoin.innerText === errMsg) {
              btnJoin.innerText = '▶ JOIN LOBBY';
            }
          }, 2500);
          this.hud.showAlert(errMsg, 'recoil');
        }
      });
    }

    // Copy Link Button
    const copyBtn = document.getElementById('btn-copy-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        sounds.playSelect();
        if (!net.roomCode) return;
        const url = `${window.location.origin}${window.location.pathname}?room=${net.roomCode}`;
        navigator.clipboard.writeText(url).then(() => {
          const orig = copyBtn.innerHTML;
          copyBtn.innerText = 'COPIED!';
          setTimeout(() => (copyBtn.innerHTML = orig), 1500);
        });
      });
    }

    // Squad Selection Buttons (Team Frost vs Team Blaze in Versus Split Deck)
    const btnJoinFrost = document.getElementById('btn-join-frost');
    const btnJoinBlaze = document.getElementById('btn-join-blaze');
    if (btnJoinFrost) {
      btnJoinFrost.addEventListener('click', () => {
        sounds.playSelect();
        net.setMyTeam('frost');
      });
    }
    if (btnJoinBlaze) {
      btnJoinBlaze.addEventListener('click', () => {
        sounds.playSelect();
        net.setMyTeam('blaze');
      });
    }

    // Start Multiplayer Race Button (Host only with min 2 players validation)
    const mpStartBtn = document.getElementById('btn-start-multiplayer');
    if (mpStartBtn) {
      mpStartBtn.addEventListener('click', () => {
        if (!net.isHost) return;
        if (net.lobbyPlayers.length < 2) {
          sounds.playRecoil();
          this.hud.showAlert('CANNOT START SOLO // MIN 2 RACERS REQUIRED', 'recoil');
          return;
        }
        const isRumble = net.selectedMode === 'rumble' || this.selectedMpMode === 'rumble';
        const isTdm = isRumble && (net.isHost ? this.selectedMpRumbleFormat === 'tdm' : net.selectedRumbleFormat === 'tdm');
        if (isTdm) {
          const frostCount = net.lobbyPlayers.filter((p) => (p.team || 'frost') === 'frost').length;
          const blazeCount = net.lobbyPlayers.filter((p) => p.team === 'blaze').length;
          if (frostCount === 0 || blazeCount === 0) {
            sounds.playRecoil();
            this.hud.showAlert('UNBALANCED SQUADS // NEED 1+ IN BOTH SQUADS', 'recoil');
            return;
          }
        }
        sounds.playSelect();
        net.startHostRace();
      });
    }

    // Auto-detect Room from URL Query Parameter (?room=AERO-XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && joinInput) {
      openMpHub();
      joinInput.value = roomParam.toUpperCase();
      this.hud.showAlert(`INVITED TO ROOM ${roomParam.toUpperCase()} // CLICK JOIN LOBBY!`, 'smash');
    }

    // Multiplayer Networking Callbacks
    net.onLobbyUpdated = (players, laps, mode, rumbleRule, rumbleFormat, matchState) => {
      this.recordLobbyActivity();
      this.renderLobbyRoster(players);

      // Detect newly joined players and trigger live HUD announcement banner
      if (this.lastKnownLobbyPlayerIds.size > 0) {
        const newlyJoined = players.filter((p) => !this.lastKnownLobbyPlayerIds.has(p.peerId));
        for (const p of newlyJoined) {
          if (p.peerId !== net.myPeerId) {
            this.hud.showAlert(`🏎️ ${p.name.toUpperCase()} JOINED THE ROOM! [${players.length}/8]`, 'boost', 3500);
            sounds.playSelect();
          }
        }
      }
      this.lastKnownLobbyPlayerIds = new Set(players.map((p) => p.peerId));

      // Live update finish modal button state if match is finished or finish-modal is open!
      const finishModal = document.getElementById('finish-modal');
      const isFinishModalVisible = finishModal && finishModal.style.display !== 'none';
      if (isFinishModalVisible || this.state === GameState.FINISHED) {
        const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;
        if (restartBtn && this.isMultiplayer) {
          if (net.isHost) {
            restartBtn.innerText = 'CONTINUE TO ROOM ❯';
            restartBtn.disabled = false;
          } else {
            restartBtn.innerText = 'WAITING FOR HOST ❯';
            restartBtn.disabled = true;
          }
        }
      }

      const lapsDisplay = document.getElementById('lobby-laps-display');
      const modeDisplay = document.getElementById('lobby-mode-display');
      if (modeDisplay) {
        if (net.selectedMode === 'rumble') {
          modeDisplay.innerText = `SKY RUMBLE (${net.selectedRumbleFormat === 'tdm' ? 'TDM' : 'FFA'})`;
        } else if (net.selectedMode === 'hardcore') {
          modeDisplay.innerText = 'HARDCORE SKY';
        } else if (net.selectedMode === 'time_attack') {
          modeDisplay.innerText = 'TIME SPRINT (CLASSIC)';
        } else if (net.selectedMode === 'time_attack_hardcore') {
          modeDisplay.innerText = 'TIME SPRINT (HARDCORE)';
        } else {
          modeDisplay.innerText = 'CLASSIC GRAND PRIX';
        }
      }
      if (lapsDisplay) {
        if (net.selectedMode === 'rumble') {
          lapsDisplay.innerText = net.selectedRumbleRule === 'time_3m' ? '3 MIN TIMER' : (net.selectedRumbleRule === 'kills_20' ? '20 KILLS' : (net.selectedRumbleRule === 'lives_3' ? '3 LIVES' : '10 KILLS'));
        } else {
          lapsDisplay.innerText = `${net.selectedLaps} ${net.selectedLaps === 1 ? 'LAP' : 'LAPS'}`;
        }
      }

      // Feature 3: Mid-Race Join Spectator Queue
      if (matchState === 'in_race' && this.state === GameState.MENU && !net.isHost) {
        this.handleMidRaceJoin(players, laps || 3, mode, rumbleRule, rumbleFormat);
        return;
      }
    };

    net.onCountdownTriggered = (startTime: number, laps: number, mode?: MpGameMode, rumbleRule?: string, rumbleFormat?: 'tdm' | 'ffa', durationMs?: number) => {
      this.isMidRaceSpectator = false;
      this.isSpectating = false;
      this.hud.hideSpectatorOverlay();
      const finishModal = document.getElementById('finish-modal');
      if (finishModal) finishModal.style.display = 'none';

      const targetMode: MpGameMode = mode || net.selectedMode || 'classic';
      const modeTitle = targetMode === 'rumble'
        ? `SKY RUMBLE // ${(rumbleFormat || net.selectedRumbleFormat || 'tdm').toUpperCase()} BATTLE`
        : (targetMode === 'hardcore' ? 'HARDCORE SKY GRAND PRIX' : 'CLASSIC GRAND PRIX');

      // Relative Duration Sync: Completely eliminates cross-device cell phone clock drift (Date.now desync).
      // Uses local Date.now() + remaining duration rather than remote host's raw system clock!
      const totalDuration = durationMs || 6000;
      const transitLatency = net.isHost ? 0 : Math.min(200, Math.max(10, (net.currentPing || 40) / 2));
      const remainingDuration = Math.max(3300, totalDuration - transitLatency);
      const localStartTime = Date.now() + remainingDuration;
      const loadingTimeMs = Math.max(1200, remainingDuration - 3200);

      const modeKey: LoadingMode = targetMode === 'rumble' ? 'rumble' : (targetMode === 'hardcore' || targetMode === 'time_attack_hardcore' ? 'hardcore' : (targetMode === 'time_attack' ? 'time_sprint' : 'classic'));
      matchLoadingScreen.show(modeTitle, loadingTimeMs, modeKey);
      closeMpHub();

      // Yield main thread to allow browser to paint loading screen immediately with 0ms freeze
      requestAnimationFrame(() => {
        if (targetMode === 'rumble') {
          this.selectedRumbleFormat = rumbleFormat || net.selectedRumbleFormat || 'tdm';
          this.selectedRumbleRule = rumbleRule || net.selectedRumbleRule || 'kills_10';
          this.startRumbleMatch(localStartTime, true);
        } else {
          const isTimeAttack = targetMode === 'time_attack' || targetMode === 'time_attack_hardcore';
          const isHardcore = targetMode === 'hardcore' || targetMode === 'time_attack_hardcore';
          const modeKey = isTimeAttack ? (isHardcore ? 'time_sprint_hardcore' : 'time_sprint') : (isHardcore ? 'hardcore' : 'classic');
          this.resetModeState(modeKey);
          this.rumbleManager = null;
          this.switchTrackMode(isHardcore ? 'hardcore' : 'classic');
          this.checkpoints.setTotalLaps(laps || (isTimeAttack ? 1 : 3));
          if (this.showroomGroup) {
            this.showroomGroup.visible = false;
          }
          document.getElementById('start-menu-modal')!.style.display = 'none';
          this.isModeSelectOpen = false;
          const modeSelectModal = document.getElementById('mode-select-modal');
          if (modeSelectModal) modeSelectModal.style.display = 'none';
          this.isMultiplayer = true;
          this.startRaceCountdown(localStartTime);
          if (isTimeAttack) {
            this.hud.showAlert('⏱️ TIMER SPRINT // ZERO COLLISIONS!', 'boost');
          }
        }
      });
    };

    net.onRemoteTransform = (data) => this.handleRemoteTransform(data);
    net.onCountdownTickReceived = (count) => this.handleAuthoritativeCountdownTick(count);
    net.onSmashReceived = (packet) => this.handleRemoteSmash(packet);
    net.onPlayerLeft = (peerId, name) => this.handleRemotePlayerLeft(peerId, name);
    net.onReturnToLobby = () => this.returnToMultiplayerRoom();
    net.onFirstFinishReceived = (winnerPeerId, winnerName, countdownSeconds) => {
      this.startFinishCountdown(winnerName, countdownSeconds);
    };
    net.onRumbleFinishReceived = (winningTeam, winnerName, frostScore, blazeScore, racerScores) => {
      if (this.rumbleManager && frostScore !== undefined && blazeScore !== undefined && racerScores) {
        this.rumbleManager.syncAuthoritativeScores(frostScore, blazeScore, racerScores);
        if (this.player?.kart) {
          this.hud.updateRumbleHud(this.rumbleManager, this.player.kart);
        }
      }
      this.handleRumbleMatchFinish(winningTeam, winnerName, true);
    };
    net.onRumbleKnockoutReceived = (victimId, attackerId, victimLives, victimDeaths) => {
      if (this.rumbleManager) {
        this.rumbleManager.applyRemoteKnockout(victimId, attackerId, victimLives, victimDeaths);
        if (this.player?.kart) {
          this.hud.updateRumbleHud(this.rumbleManager, this.player.kart);
        }
        // If Host, immediately broadcast authoritative synchronized scores to all peers!
        if (net.isHost) {
          net.broadcastRumbleScoreSync(
            this.rumbleManager.frostScore,
            this.rumbleManager.blazeScore,
            this.rumbleManager.getRacerScoresArray()
          );
        }
      }
    };
    net.onRumbleScoreSyncReceived = (frostScore, blazeScore, racerScores) => {
      if (this.rumbleManager) {
        this.rumbleManager.syncAuthoritativeScores(frostScore, blazeScore, racerScores);
        if (this.player?.kart) {
          this.hud.updateRumbleHud(this.rumbleManager, this.player.kart);
        }
      }
    };
    net.onHostMigrated = (newHost, isSelf) => {
      setTimeout(() => {
        if (isSelf) {
          this.hud.showAlert('HOST MIGRATED // YOU ARE NOW ROOM HOST', 'smash', 2500);
        } else {
          this.hud.showAlert(`HOST MIGRATED // NEW HOST: ${newHost.name.toUpperCase()}`, 'boost', 2500);
        }
      }, 2500);

      // If currently on finish leaderboard, update continue button authority
      const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;
      if (restartBtn && this.state === GameState.FINISHED) {
        if (isSelf) {
          restartBtn.innerText = 'CONTINUE TO ROOM ❯';
          restartBtn.disabled = false;
        } else {
          restartBtn.innerText = 'WAITING FOR HOST ❯';
          restartBtn.disabled = true;
        }
      }
    };

    net.onPingUpdated = (pingMs) => {
      this.hud.setPing(pingMs);
    };

    net.onRoomClosed = (reason) => this.handleRoomClosed(reason);
    net.onError = (msg) => this.hud.showAlert(msg.toUpperCase(), 'respawn');

    window.addEventListener('beforeunload', () => net.cleanup());
    window.addEventListener('pagehide', () => net.cleanup());

    // Register user activity resets for 6-minute lobby AFK watchdog
    const afkResetEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    afkResetEvents.forEach((evt) => {
      window.addEventListener(evt, this.recordLobbyActivity, { passive: true });
    });

    // Solo Start race button (Classic Grand Prix)
    const startBtn = document.getElementById('start-race-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (mpModal) mpModal.classList.remove('open');
        this.isModeSelectOpen = false;
        document.getElementById('start-menu-modal')!.style.display = 'none';
        const modeSelectModal = document.getElementById('mode-select-modal');
        if (modeSelectModal) modeSelectModal.style.display = 'none';

        const startTime = Date.now() + 6000;
        matchLoadingScreen.show('CLASSIC GRAND PRIX', 2800, 'classic');

        requestAnimationFrame(() => {
          this.resetModeState('classic');
          this.isMultiplayer = false;
          this.switchTrackMode('classic');
          this.checkpoints.setTotalLaps(this.hostLaps || 3);
          if (this.showroomGroup) {
            this.showroomGroup.visible = false;
          }
          this.startRaceCountdown(startTime);
        });
      });
    }

    // Hardcore Mode Start Button (3X Hazards, Sweeping Curves)
    const hardcoreBtn = document.getElementById('start-hardcore-btn');
    if (hardcoreBtn) {
      hardcoreBtn.addEventListener('click', () => {
        if (mpModal) mpModal.classList.remove('open');
        this.isModeSelectOpen = false;
        document.getElementById('start-menu-modal')!.style.display = 'none';
        const modeSelectModal = document.getElementById('mode-select-modal');
        if (modeSelectModal) modeSelectModal.style.display = 'none';

        const startTime = Date.now() + 6000;
        matchLoadingScreen.show('HARDCORE GAUNTLET', 2800, 'hardcore');

        requestAnimationFrame(() => {
          this.resetModeState('hardcore');
          this.isMultiplayer = false;
          this.switchTrackMode('hardcore');
          this.checkpoints.setTotalLaps(this.hostLaps || 3);
          if (this.showroomGroup) {
            this.showroomGroup.visible = false;
          }
          this.startRaceCountdown(startTime);
          this.hud.showAlert('💀 HARDCORE GAUNTLET // 3X HAZARDS ACTIVE!', 'boost');
        });
      });
    }

    // Time Sprint Roster Toggle (Solo vs With Players)
    const timeRosterSolo = document.getElementById('time-roster-solo');
    const timeRosterPlayers = document.getElementById('time-roster-players');
    if (timeRosterSolo && timeRosterPlayers) {
      timeRosterSolo.addEventListener('click', () => {
        sounds.playSelect();
        this.isTimeAttackSolo = true;
        timeRosterSolo.style.background = '#9333ea';
        timeRosterSolo.style.color = '#FFF';
        timeRosterPlayers.style.background = '#F3E8FF';
        timeRosterPlayers.style.color = '#000';
      });
      timeRosterPlayers.addEventListener('click', () => {
        sounds.playSelect();
        this.isTimeAttackSolo = false;
        timeRosterPlayers.style.background = '#9333ea';
        timeRosterPlayers.style.color = '#FFF';
        timeRosterSolo.style.background = '#F3E8FF';
        timeRosterSolo.style.color = '#000';
      });
    }

    // Time Sprint Classic Button (No-Dash 1-Lap Record Run)
    const timeClassicBtn = document.getElementById('start-time-classic-btn');
    if (timeClassicBtn) {
      timeClassicBtn.addEventListener('click', () => {
        if (mpModal) mpModal.classList.remove('open');
        this.isModeSelectOpen = false;
        document.getElementById('start-menu-modal')!.style.display = 'none';
        const modeSelectModal = document.getElementById('mode-select-modal');
        if (modeSelectModal) modeSelectModal.style.display = 'none';

        const startTime = Date.now() + 6000;
        const modeTitle = this.isTimeAttackSolo ? 'SOLO SPRINT' : 'TIME SPRINT';
        matchLoadingScreen.show(`TIME SPRINT // ${modeTitle}`, 2800, 'time_sprint');

        requestAnimationFrame(() => {
          this.resetModeState('time_sprint');
          this.isMultiplayer = false;
          this.switchTrackMode('classic');
          this.checkpoints.setTotalLaps(1);
          if (this.showroomGroup) {
            this.showroomGroup.visible = false;
          }
          this.startRaceCountdown(startTime);
          this.hud.showAlert(`⏱️ ${modeTitle} // ZERO COLLISIONS // 1-LAP PB!`, 'boost');
        });
      });
    }

    // Time Sprint Hardcore Button (No-Dash 1-Lap Record Run)
    const timeHardcoreBtn = document.getElementById('start-time-hardcore-btn');
    if (timeHardcoreBtn) {
      timeHardcoreBtn.addEventListener('click', () => {
        if (mpModal) mpModal.classList.remove('open');
        this.isModeSelectOpen = false;
        document.getElementById('start-menu-modal')!.style.display = 'none';
        const modeSelectModal = document.getElementById('mode-select-modal');
        if (modeSelectModal) modeSelectModal.style.display = 'none';

        const startTime = Date.now() + 6000;
        const modeTitle = this.isTimeAttackSolo ? 'HARDCORE SOLO SPRINT' : 'HARDCORE TIME SPRINT';
        matchLoadingScreen.show(`HARDCORE // ${modeTitle}`, 2800, 'time_sprint');

        requestAnimationFrame(() => {
          this.resetModeState('time_sprint_hardcore');
          this.isMultiplayer = false;
          this.switchTrackMode('hardcore');
          this.checkpoints.setTotalLaps(1);
          if (this.showroomGroup) {
            this.showroomGroup.visible = false;
          }
          this.startRaceCountdown(startTime);
          this.hud.showAlert(`⏱️ ${modeTitle} // ZERO COLLISIONS // 1-LAP PB!`, 'boost');
        });
      });
    }

    // Rumble Mode Open & Setup Listeners
    const btnOpenRumble = document.getElementById('btn-open-rumble');
    const rumbleModal = document.getElementById('rumble-modal');
    const btnCloseRumble = document.getElementById('btn-close-rumble');

    if (btnOpenRumble && rumbleModal) {
      btnOpenRumble.addEventListener('click', () => {
        sounds.playSelect();
        const modeSelectModal = document.getElementById('mode-select-modal');
        if (modeSelectModal) modeSelectModal.style.display = 'none';
        rumbleModal.style.display = 'flex';
      });
    }
    if (btnCloseRumble && rumbleModal) {
      btnCloseRumble.addEventListener('click', () => {
        sounds.playSelect();
        rumbleModal.style.display = 'none';
      });
    }
    if (rumbleModal) {
      rumbleModal.addEventListener('click', (e) => {
        if (e.target === rumbleModal) {
          rumbleModal.style.display = 'none';
        }
      });
    }

    // Rumble Format Buttons (TDM vs FFA)
    const formatBtns = document.querySelectorAll('.rumble-format-btn');
    const teamSelectRow = document.getElementById('rumble-team-select-row');
    formatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        formatBtns.forEach((b) => {
          b.classList.remove('active');
          (b as HTMLElement).removeAttribute('style');
        });
        btn.classList.add('active');
        const fmt = (btn.getAttribute('data-format') || 'tdm') as 'tdm' | 'ffa';
        this.selectedRumbleFormat = fmt;
        if (teamSelectRow) {
          teamSelectRow.style.display = fmt === 'tdm' ? 'flex' : 'none';
        }
      });
    });

    // Rumble Side Buttons (Frost vs Blaze)
    const sideBtns = document.querySelectorAll('.rumble-side-btn');
    sideBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        sideBtns.forEach((b) => {
          b.classList.remove('active');
          (b as HTMLElement).removeAttribute('style');
        });
        btn.classList.add('active');
        const rawSide = btn.getAttribute('data-side') || 'frost';
        const side: 'frost' | 'blaze' = (rawSide === 'blaze' || rawSide === 'crimson') ? 'blaze' : 'frost';
        this.selectedRumbleSide = side;
      });
    });

    // Rumble Win Rule Buttons
    const ruleBtns = document.querySelectorAll('.rumble-rule-btn');
    ruleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sounds.playSelect();
        ruleBtns.forEach((b) => {
          b.classList.remove('active');
          (b as HTMLElement).removeAttribute('style');
        });
        btn.classList.add('active');
        this.selectedRumbleRule = btn.getAttribute('data-rule') || 'kills_10';
      });
    });

    // Launch Rumble Match CTA Button
    const btnStartRumble = document.getElementById('btn-start-rumble-match');
    if (btnStartRumble) {
      btnStartRumble.addEventListener('click', () => {
        sounds.playSelect();
        const rumbleModal = document.getElementById('rumble-modal');
        if (rumbleModal) rumbleModal.style.display = 'none';
        const startMenuModal = document.getElementById('start-menu-modal');
        if (startMenuModal) startMenuModal.style.display = 'none';

        const startTime = Date.now() + 6000;
        matchLoadingScreen.show('SKY RUMBLE // ARENA CLASH', 2800, 'rumble');

        requestAnimationFrame(() => {
          this.startRumbleMatch(startTime);
        });
      });
    }

    // Restart button in leaderboard
    const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        sounds.isScoreboardActive = false;
        sounds.isFadingOut = false;
        if (this.isMultiplayer) {
          if (!net.isHost) {
            sounds.playRecoil();
            this.hud.showAlert('WAITING FOR HOST TO RETURN TO ROOM', 'recoil');
            return;
          }
          sounds.playSelect();
          net.returnAllToLobby();
          return;
        }

        document.getElementById('finish-modal')!.style.display = 'none';
        if (this.showroomGroup) {
          this.showroomGroup.visible = false;
        }

        const startTime = Date.now() + 6000;
        const modeKey: LoadingMode = this.isRumbleMode ? 'rumble' : (this.isHardcoreMode ? 'hardcore' : (this.isNoCollisionMode ? 'time_sprint' : 'classic'));
        const modeTitle = this.isRumbleMode ? 'SKY RUMBLE // REMATCH' : (this.isHardcoreMode ? 'HARDCORE GAUNTLET' : (this.isNoCollisionMode ? 'TIME SPRINT' : 'CLASSIC GRAND PRIX'));

        matchLoadingScreen.show(modeTitle, 2800, modeKey);

        requestAnimationFrame(() => {
          if (this.isRumbleMode) {
            this.startRumbleMatch(startTime);
          } else {
            this.resetRace();
            this.startRaceCountdown(startTime);
          }
        });
      });
    }

    // Change kart button in leaderboard
    const changeKartBtn = document.getElementById('change-kart-btn');
    if (changeKartBtn) {
      changeKartBtn.addEventListener('click', () => {
        this.quitToLobby();
      });
    }

    // In-game Settings & Quit Race hook
    settingsModal.onQuitRace = () => {
      this.quitToLobby();
    };

    // Spectator Mode Controls (Pointer & Click support for instant zero-latency touch response)
    const specPrev = document.getElementById('spectator-prev');
    if (specPrev) {
      const handlePrev = (e: Event) => {
        e.preventDefault();
        sounds.playSelect();
        this.cycleSpectator(-1);
      };
      specPrev.addEventListener('pointerdown', handlePrev);
      specPrev.addEventListener('click', handlePrev);
    }
    const specNext = document.getElementById('spectator-next');
    if (specNext) {
      const handleNext = (e: Event) => {
        e.preventDefault();
        sounds.playSelect();
        this.cycleSpectator(1);
      };
      specNext.addEventListener('pointerdown', handleNext);
      specNext.addEventListener('click', handleNext);
    }
    const specLeave = document.getElementById('spectator-leave-btn');
    if (specLeave) {
      specLeave.addEventListener('click', (e) => {
        e.preventDefault();
        sounds.playSelect();
        this.quitToLobby();
      });
    }

    // Keyboard shortcuts for spectator mode
    window.addEventListener('keydown', (e) => {
      if (this.isSpectating) {
        if (e.key === 'q' || e.key === 'Q' || e.key === 'ArrowLeft') {
          this.cycleSpectator(-1);
        } else if (e.key === 'e' || e.key === 'E' || e.key === 'ArrowRight') {
          this.cycleSpectator(1);
        }
      }
    });

    // ── MODULAR LOBBY UI & GARAGE STORE ──
    storeModal.onSelectMachine = (idx: number) => {
      this.updateShowroomKart(idx);
    };

    storeModal.onPreviewSkin = (skinId: string) => {
      if (this.showroomKart) {
        this.showroomKart.applySkin(skinId);
      }
    };

    storeModal.onPreviewGlasses = (glassesId: string) => {
      if (this.showroomKart) {
        this.showroomKart.applyGlasses(glassesId);
      }
    };

    storeModal.onPreviewHat = (hatId: string) => {
      if (this.showroomKart) {
        this.showroomKart.applyHat(hatId);
      }
    };

    storeModal.onOpen = () => {
      this.isStoreOpen = true;
      this.isModeSelectOpen = false;
      const modeSelectModal = document.getElementById('mode-select-modal');
      if (modeSelectModal) modeSelectModal.style.display = 'none';
      document.body.classList.add('showroom-store-open');
      storeModal.setMachineIndex(this.selectedKartIndex);
    };

    storeModal.onClose = () => {
      this.isStoreOpen = false;
      document.body.classList.remove('showroom-store-open');
      if (this.showroomKart) {
        this.showroomKart.applySkin(economy.getEquippedSkin());
        this.showroomKart.applyGlasses(economy.getEquippedGlasses());
        this.showroomKart.applyHat(economy.getEquippedHat());
      }
      this.setupMenuCamera();
    };

    storeModal.onEquipChanged = () => {
      if (this.showroomKart) {
        this.showroomKart.applySkin(economy.getEquippedSkin());
        this.showroomKart.applyGlasses(economy.getEquippedGlasses());
        this.showroomKart.applyHat(economy.getEquippedHat());
      }
      if (this.player && this.player.kart) {
        this.player.kart.applySkin(economy.getEquippedSkin());
        this.player.kart.applyGlasses(economy.getEquippedGlasses());
        this.player.kart.applyHat(economy.getEquippedHat());
      }
      lobbyUI.updateLobbyElements();
    };

    lobbyUI.updateLobbyElements();
  }

  private bindCheckpointCallbacks() {
    if (!this.checkpoints) return;

    this.checkpoints.onPlayerLapComplete = (lap: number) => {
      const total = this.checkpoints.totalLaps;
      const currentLapTime = Math.max(0.1, this.raceTimer - this.lastLapCompletedTime);
      this.lastLapCompletedTime = this.raceTimer;
      const trackKey = this.track && this.track.isHardcore ? 'hardcore' : 'classic';

      // TIMERS & PB: STRICTLY for Time Sprint mode (this.isNoCollisionMode) ONLY!
      if (this.isNoCollisionMode) {
        let lapRecordShown = false;
        const lapRecordRes = recordManager.checkLapTime(trackKey, currentLapTime);
        if (lapRecordRes.isNewPB && lapRecordRes.prevPB !== null) {
          lapRecordShown = true;
          const lapSuffix = lap === total ? ' // FINAL LAP!' : '';
          this.hud.showAlert(`⚡ NEW BEST LAP! ${RecordManager.formatTime(currentLapTime)} (${RecordManager.formatDelta(lapRecordRes.delta)})${lapSuffix}`, 'boost', 3500);
          sounds.playVictory();
        }

        if (!lapRecordShown) {
          if (lap === total) {
            this.hud.showAlert('FINAL LAP // GO FOR GLORY!', 'smash', 2500);
          } else if (lap <= total) {
            this.hud.showAlert(`LAP ${lap} // KEEP PUSHING!`, 'smash', 2500);
          }
        }

        // Submit 1-Lap Time Sprint Global Leaderboard Record
        leaderboard.submitSprintRecord(trackKey, currentLapTime).then((res) => {
          if (res.isNewPB) {
            this.hud.showAlert(`🏆 NEW SPRINT PB! #${res.rank} GLOBAL • ${res.formattedTime}`, 'boost', 3500);
            sounds.playVictory();
          }
        });
      } else {
        // Classic & Normal Modes: Clean standard race notifications, ZERO PB / timers!
        if (lap === total) {
          this.hud.showAlert('FINAL LAP // GO FOR GLORY!', 'smash', 2500);
        } else if (lap <= total) {
          this.hud.showAlert(`LAP ${lap} // KEEP PUSHING!`, 'smash', 2500);
        }
      }

      economy.addCoins(20);
      economy.addXp(10);
      sounds.playCoin();
    };

    this.checkpoints.onPlayerFall = () => {
      if (this.player?.kart?.rigidBody) {
        this.player.kart.rigidBody.setLinvel({ x: 0, y: -2, z: 0 }, true);
        this.player.kart.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    };

    this.checkpoints.onPlayerRespawn = () => {
      // Clean respawn - audio and ghost shimmer feedback handle everything without text clutter
    };

    this.checkpoints.onRacerFinish = (racer) => {
      this.handleRacerFinish(racer);
    };
  }

  private resetModeState(targetMode: 'classic' | 'hardcore' | 'time_sprint' | 'time_sprint_hardcore' | 'rumble' | 'menu') {
    const isTimeSprint = targetMode === 'time_sprint' || targetMode === 'time_sprint_hardcore';
    const isRumble = targetMode === 'rumble';
    const isHardcore = targetMode === 'hardcore' || targetMode === 'time_sprint_hardcore';

    this.isNoCollisionMode = isTimeSprint;
    this.isRumbleMode = isRumble;
    this.isHardcoreMode = isHardcore;
    if (this.player) {
      this.player.isRumbleMode = isRumble;
    }

    this.hud.setRumbleMode(isRumble);
    this.hud.setTimeSprintMode(isTimeSprint);
    if (isTimeSprint) {
      const trackKey = isHardcore ? 'hardcore' : 'classic';
      this.hud.setTrackPB(recordManager.getRecord(trackKey).bestRaceTime);
    }

    this.raceTimer = 0;
    this.playerFinishTime = 0;
    this.racerFinishTimes.clear();
    this.lastLapCompletedTime = 0;
    this.finishCountdownActive = false;
    this.finishCountdownTimer = 15.0;
    this.isPlayerFinished = false;
    this.playerFinishRank = 0;
    this.isSpectating = false;
    this.spectatedTargetIdx = 0;
    this.hud.hideFinishCountdown();
    this.hud.hideSpectatorOverlay();
    this.hud.showWrongWay(false);
    this.hud.resetRumbleHud();

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.hud.hideCountdown();
    this.lastAnnouncedCountdown = '';

    if (this.rumbleVictoryTimeout) {
      clearTimeout(this.rumbleVictoryTimeout);
      this.rumbleVictoryTimeout = null;
    }
    this.hud.hideSmashCombat();

    // Flush active remote sprites and all karts from physics world
    for (const remote of this.remoteRacers.values()) {
      if (remote.nameSprite) {
        if (remote.nameSprite.material) {
          if (remote.nameSprite.material.map) remote.nameSprite.material.map.dispose();
          remote.nameSprite.material.dispose();
        }
        this.engine.scene.remove(remote.nameSprite);
      }
    }
    this.remoteRacers.clear();

    for (const kart of this.allKarts) {
      kart.dispose(this.engine.scene, this.physics);
    }
    this.allKarts = [];
    this.bots = [];

    // Clear checkpoints racers collection and enforce lap configuration
    if (this.checkpoints) {
      this.checkpoints.racers.clear();
      this.checkpoints.setTotalLaps(isTimeSprint ? 1 : (this.hostLaps || 3));
    }
  }

  private switchTrackMode(mode: 'classic' | 'hardcore' | 'rumble' | boolean) {
    const isHardcore = mode === 'hardcore' || mode === true;
    const isRumble = mode === 'rumble';

    // If track already exists and matches the exact mode, do not recreate
    if (this.track) {
      if (isRumble && this.track.isArena) {
        this.isHardcoreMode = false;
        this.isRumbleMode = true;
        this.hud.setRumbleMode(true);
        return;
      }
      if (!isRumble && !this.track.isArena && this.track.isHardcore === isHardcore) {
        this.isHardcoreMode = isHardcore;
        this.isRumbleMode = false;
        this.hud.setRumbleMode(false);
        return;
      }
    }

    this.isHardcoreMode = isHardcore;
    this.isRumbleMode = isRumble;
    this.hud.setRumbleMode(isRumble);

    if (this.track) {
      this.track.dispose(this.engine.scene, this.physics);
    }
    this.track = new Track(this.engine.scene, this.physics, mode);
    this.checkpoints = new CheckpointSystem(this.track);

    if (!isRumble) {
      this.bindCheckpointCallbacks();
    }

    if (this.player?.kart) {
      this.player.kart.track = this.track;
    }
    this.bots.forEach((b) => {
      b.setTrack(this.track);
      b.kart.track = this.track;
    });
  }

  private startRumbleMatch(startTime?: number, isMp: boolean = false) {
    this.resetModeState('rumble');
    this.isMultiplayer = isMp;
    this.isRumbleOutroActive = false;
    this.rumbleOutroTimer = 0;
    this.pendingRumbleFinish = null;
    this.hud.hideRumbleVictoryBanner();
    this.switchTrackMode('rumble');
    clearRumbleCombatCooldowns();

    const arenaCfg = this.track.config as RumbleArenaConfig;
    this.rumbleManager = new RumbleManager(arenaCfg);
    const isTDM = this.selectedRumbleFormat === 'tdm';
    this.rumbleManager.configureMatch(isTDM, this.selectedRumbleRule);

    this.rumbleManager.onMatchFinish = (winningTeam, winnerName) => {
      this.handleRumbleMatchFinish(winningTeam, winnerName);
    };

    this.rumbleManager.onScoreUpdate = () => {
      if (this.isSpectating) {
        this.updateSpectatorUI();
      }
    };

    this.rumbleManager.onKnockoutBroadcast = (victimId, attackerId, victimLives, victimDeaths) => {
      if (this.isMultiplayer) {
        net.broadcastRumbleKnockout(victimId, attackerId, victimLives, victimDeaths);
        if (net.isHost && this.rumbleManager) {
          net.broadcastRumbleScoreSync(
            this.rumbleManager.frostScore,
            this.rumbleManager.blazeScore,
            this.rumbleManager.getRacerScoresArray()
          );
        }
      }
    };

    this.rumbleManager.onPlayerScoredKill = (victimName, comboCount, comboTitle) => {
      sounds.playSmash();
      if (comboCount > 1) {
        sounds.playVictory();
      }
      this.player.triggerImpactShake(comboCount > 1 ? 2.2 : 1.4);
      this.hud.showSmashCombat(comboTitle, comboCount, false);
    };

    this.rumbleManager.onPlayerKnockedOut = (attackerName?: string) => {
      sounds.stopDrift();
      this.player.triggerImpactShake(1.6);
      if (attackerName) {
        const cleanAttacker = attackerName.replace(/_/g, ' ');
        this.hud.showSmashCombat(`SLAMMED BY ${cleanAttacker}!`, 1, true);
      } else {
        this.hud.showSmashCombat('FELL INTO THE CLOUDS!', 1, true);
      }
    };

    this.rumbleManager.onPlayerEliminated = () => {
      sounds.stopDrift();
      if (!this.rumbleManager?.isMatchOver) {
        this.hud.showAlert('ELIMINATED // SPECTATING ARENA BATTLE', 'smash');
        this.startSpectating();
      }
    };

    if (this.showroomGroup) {
      this.showroomGroup.visible = false;
    }
    document.getElementById('start-menu-modal')!.style.display = 'none';
    const modeSelectModal = document.getElementById('mode-select-modal');
    if (modeSelectModal) modeSelectModal.style.display = 'none';
    const rumbleModal = document.getElementById('rumble-modal');
    if (rumbleModal) rumbleModal.style.display = 'none';
    const mpModal = document.getElementById('mp-modal');
    if (mpModal) {
      mpModal.classList.remove('open');
      mpModal.style.display = 'none';
    }

    this.spawnRumbleRacers();
    if (this.rumbleManager && this.player?.kart) {
      this.hud.updateRumbleHud(this.rumbleManager, this.player.kart);
    }
    if (!this.isMidRaceSpectator) {
      this.startRaceCountdown(startTime);
    }
  }

  private spawnRumbleRacers() {
    for (const remote of this.remoteRacers.values()) {
      if (remote.nameSprite) {
        if (remote.nameSprite.material) {
          if (remote.nameSprite.material.map) remote.nameSprite.material.map.dispose();
          remote.nameSprite.material.dispose();
        }
        this.engine.scene.remove(remote.nameSprite);
      }
    }
    this.remoteRacers.clear();

    for (const kart of this.allKarts) {
      this.engine.scene.remove(kart.group);
      this.physics.world.removeRigidBody(kart.rigidBody);
    }
    this.allKarts = [];
    this.bots = [];

    const arenaCfg = this.track.config as RumbleArenaConfig;
    const isTDM = this.selectedRumbleFormat === 'tdm';
    BotKart.clearActiveTargets();

    if (!this.isMultiplayer) {
      if (isTDM) {
        const playerTeam: RumbleTeam = this.selectedRumbleSide;
        const enemyTeam: RumbleTeam = playerTeam === 'frost' ? 'blaze' : 'frost';

        // 1. Local Player (Slot 0 of chosen team)
        const pSpawn = arenaCfg.getSpawn(playerTeam, 0);
        const pKart = new Kart('kart-player', this.selectedKartIndex, this.engine.scene, this.physics, pSpawn.pos, pSpawn.rot);
        pKart.applySkin(playerTeam === 'frost' ? 'paint_frost' : 'paint_blaze');
        pKart.team = playerTeam;
        pKart.track = this.track;
        this.allKarts.push(pKart);
        this.player = new PlayerKart(pKart, this.input);
        this.rumbleManager!.registerRacer(pKart.id, this.playerName || 'YOU', playerTeam, true, pKart);

        // 2. Player's 2 Bot Teammates
        const usedNames: string[] = [this.playerName || 'YOU'];
        const allyNames = pickTeamBotNames(playerTeam, 2, usedNames);
        usedNames.push(...allyNames);
        const allyKartTypes = [1, 2];
        for (let i = 0; i < 2; i++) {
          const sp = arenaCfg.getSpawn(playerTeam, i + 1);
          const bKart = new Kart(`kart-ally-${i}`, allyKartTypes[i], this.engine.scene, this.physics, sp.pos, sp.rot);
          bKart.applySkin(playerTeam === 'frost' ? 'paint_frost' : 'paint_blaze');
          bKart.applyHat(BOT_CONFIG.COSMETICS.HATS[i % BOT_CONFIG.COSMETICS.HATS.length]);
          bKart.applyGlasses(BOT_CONFIG.COSMETICS.GLASSES[(i + 1) % BOT_CONFIG.COSMETICS.GLASSES.length]);
          bKart.team = playerTeam;
          bKart.track = this.track;
          this.allKarts.push(bKart);

          const badgeColor = playerTeam === 'frost' ? '#00f0ff' : '#ff3344';
          const tag = createBrutalistNameTag(allyNames[i], badgeColor, false);
          bKart.group.add(tag);

          const bot = new BotKart(bKart, this.track, 0, 0);
          this.bots.push(bot);
          this.rumbleManager!.registerRacer(bKart.id, allyNames[i], playerTeam, false, bKart);
        }

        // 3. 3 Bot Rivals on opposing side (Authentic gamertags, no 'Bot' / 'AI')
        const enemyNames = pickTeamBotNames(enemyTeam, 3, usedNames);
        usedNames.push(...enemyNames);
        const enemyKartTypes = [3, 0, 1];
        for (let i = 0; i < 3; i++) {
          const sp = arenaCfg.getSpawn(enemyTeam, i);
          const bKart = new Kart(`kart-enemy-${i}`, enemyKartTypes[i], this.engine.scene, this.physics, sp.pos, sp.rot);
          bKart.applySkin(enemyTeam === 'frost' ? 'paint_frost' : 'paint_blaze');
          bKart.applyHat(BOT_CONFIG.COSMETICS.HATS[(i + 2) % BOT_CONFIG.COSMETICS.HATS.length]);
          bKart.applyGlasses(BOT_CONFIG.COSMETICS.GLASSES[(i + 3) % BOT_CONFIG.COSMETICS.GLASSES.length]);
          bKart.team = enemyTeam;
          bKart.track = this.track;
          this.allKarts.push(bKart);

          const badgeColor = enemyTeam === 'frost' ? '#00f0ff' : '#ff3344';
          const tag = createBrutalistNameTag(enemyNames[i], badgeColor, false);
          bKart.group.add(tag);

          const bot = new BotKart(bKart, this.track, 0, 0);
          this.bots.push(bot);
          this.rumbleManager!.registerRacer(bKart.id, enemyNames[i], enemyTeam, false, bKart);
        }
      } else {
        // Solo Free For All: Each bot receives a completely distinct skin, hat, glasses, and authentic gamertag!
        const totalFfa = 6;
        const pSpawn = arenaCfg.getSoloSpawn(0, totalFfa);
        const pKart = new Kart('kart-player', this.selectedKartIndex, this.engine.scene, this.physics, pSpawn.pos, pSpawn.rot);
        pKart.team = undefined;
        pKart.track = this.track;
        this.allKarts.push(pKart);
        this.player = new PlayerKart(pKart, this.input);
        this.rumbleManager!.registerRacer(pKart.id, this.playerName || 'YOU', 'none', true, pKart);

        const usedNames: string[] = [this.playerName || 'YOU'];
        const playerEquippedSkin = economy.getEquippedSkin();

        for (let i = 1; i < totalFfa; i++) {
          const sp = arenaCfg.getSoloSpawn(i, totalFfa);
          const profile = generateBotProfile(i - 1, playerEquippedSkin, usedNames);
          usedNames.push(profile.name);

          const bKart = new Kart(`kart-bot-${i}`, profile.kartType, this.engine.scene, this.physics, sp.pos, sp.rot);
          bKart.applySkin(profile.skinId);
          bKart.applyHat(profile.hatId);
          bKart.applyGlasses(profile.glassesId);
          bKart.team = undefined;
          bKart.track = this.track;
          this.allKarts.push(bKart);

          const tag = createBrutalistNameTag(profile.name, '#ffe600', false);
          bKart.group.add(tag);

          const bot = new BotKart(bKart, this.track, 0, 0);
          this.bots.push(bot);
          this.rumbleManager!.registerRacer(bKart.id, profile.name, 'none', false, bKart);
        }
      }
    } else {
      // Real-time Multiplayer Sky Rumble: Human racers in arena
      const totalPlayers = Math.max(net.lobbyPlayers.length, 2);
      const mySlotIndex = Math.max(0, net.lobbyPlayers.findIndex((p) => p.peerId === net.myPeerId));

      if (isTDM) {
        let frostCount = 0;
        let blazeCount = 0;

        net.lobbyPlayers.forEach((peer, idx) => {
          const team: RumbleTeam = peer.team === 'blaze' ? 'blaze' : 'frost';
          const teamSlot = team === 'frost' ? frostCount++ : blazeCount++;
          const sp = arenaCfg.getSpawn(team, teamSlot);

          if (idx === mySlotIndex) {
            const localDisplayName = peer.name || this.playerName || 'RACER';
            const spawnPos = this.isMidRaceSpectator ? sp.pos.clone().add(new THREE.Vector3(0, -100, 0)) : sp.pos;
            const pKart = new Kart(`kart-${idx}`, this.selectedKartIndex, this.engine.scene, this.physics, spawnPos, sp.rot);
            pKart.applySkin(team === 'frost' ? 'paint_frost' : 'paint_blaze');
            pKart.team = team;
            pKart.track = this.track;
            this.allKarts.push(pKart);
            this.player = new PlayerKart(pKart, this.input);
            this.selectedRumbleSide = team;
            if (this.isMidRaceSpectator) {
              pKart.group.visible = false;
            } else {
              this.rumbleManager!.registerRacer(pKart.id, localDisplayName, team, true, pKart);
              if (economy.isVip()) {
                const pTag = createBrutalistNameTag(localDisplayName, team === 'frost' ? '#00f0ff' : '#ff3344', true);
                pKart.group.add(pTag);
              }
            }
          } else {
            const rKart = new Kart(`kart-${idx}`, peer.kartType, this.engine.scene, this.physics, sp.pos, sp.rot);
            rKart.applySkin(team === 'frost' ? 'paint_frost' : 'paint_blaze');
            rKart.team = team;
            rKart.track = this.track;
            this.allKarts.push(rKart);

            const badgeColor = team === 'frost' ? '#00f0ff' : '#ff3344';
            const nameTag = createBrutalistNameTag(peer.name, badgeColor, peer.isVip);
            rKart.group.add(nameTag);

            const interpolator = new NetworkInterpolator();
            interpolator.init(sp.pos, sp.rot);

            this.remoteRacers.set(peer.peerId, {
              peerId: peer.peerId,
              name: peer.name,
              kart: rKart,
              interpolator,
              targetPos: sp.pos.clone(),
              targetRot: sp.rot.clone(),
              targetSpeed: 0,
              targetSteer: 0,
              isDrifting: false,
              isBoosting: false,
              nameSprite: nameTag,
              isSmashed: false,
              smashTimer: 0,
              launchVelocity: new THREE.Vector3(),
              tumbleAngularVel: new THREE.Vector3(),
              lastPacketTime: performance.now(),
            });

            this.rumbleManager!.registerRacer(rKart.id, peer.name, team, false, rKart, true);
          }
        });
      } else {
        // Solo Free For All Multiplayer
        net.lobbyPlayers.forEach((peer, idx) => {
          const sp = arenaCfg.getSoloSpawn(idx, totalPlayers);

          if (idx === mySlotIndex) {
            const localDisplayName = peer.name || this.playerName || 'RACER';
            const spawnPos = this.isMidRaceSpectator ? sp.pos.clone().add(new THREE.Vector3(0, -100, 0)) : sp.pos;
            const pKart = new Kart(`kart-${idx}`, this.selectedKartIndex, this.engine.scene, this.physics, spawnPos, sp.rot);
            pKart.applySkin(economy.getEquippedSkin());
            pKart.team = undefined;
            pKart.track = this.track;
            this.allKarts.push(pKart);
            this.player = new PlayerKart(pKart, this.input);
            if (this.isMidRaceSpectator) {
              pKart.group.visible = false;
            } else {
              this.rumbleManager!.registerRacer(pKart.id, localDisplayName, 'none', true, pKart);
              if (economy.isVip()) {
                const pTag = createBrutalistNameTag(localDisplayName, '#ffe600', true);
                pKart.group.add(pTag);
              }
            }
          } else {
            const rKart = new Kart(`kart-${idx}`, peer.kartType, this.engine.scene, this.physics, sp.pos, sp.rot);
            rKart.applySkin(peer.skinId || 'skin_default');
            rKart.team = undefined;
            rKart.track = this.track;
            this.allKarts.push(rKart);

            const nameTag = createBrutalistNameTag(peer.name, '#ffe600', peer.isVip);
            rKart.group.add(nameTag);

            const interpolator = new NetworkInterpolator();
            interpolator.init(sp.pos, sp.rot);

            this.remoteRacers.set(peer.peerId, {
              peerId: peer.peerId,
              name: peer.name,
              kart: rKart,
              interpolator,
              targetPos: sp.pos.clone(),
              targetRot: sp.rot.clone(),
              targetSpeed: 0,
              targetSteer: 0,
              isDrifting: false,
              isBoosting: false,
              nameSprite: nameTag,
              isSmashed: false,
              smashTimer: 0,
              launchVelocity: new THREE.Vector3(),
              tumbleAngularVel: new THREE.Vector3(),
              lastPacketTime: performance.now(),
            });

            this.rumbleManager!.registerRacer(rKart.id, peer.name, 'none', false, rKart, true);
          }
        });
      }
    }

    for (const k of this.allKarts) {
      k.track = this.track;
    }
  }

  private handleRumbleMatchFinish(winningTeam: RumbleTeam | 'draw', winnerName: string, fromRemote: boolean = false) {
    // Idempotent guard: prevent multiple triggers during outro or after finish
    if (this.isRumbleOutroActive || (this.state === GameState.FINISHED && this.isRumbleMode)) {
      return;
    }

    // Freeze RumbleManager immediately on ALL clients so no post-match knockouts occur during the 4.1s celebration!
    if (this.rumbleManager) {
      this.rumbleManager.isMatchOver = true;
      this.rumbleManager.winningTeam = winningTeam;
      this.rumbleManager.winnerName = winnerName;
    }

    this.isRumbleOutroActive = true;
    this.pendingRumbleFinish = { winningTeam, winnerName };

    // Broadcast finish event AND authoritative final score snapshot over WebRTC if not from remote
    if (this.isMultiplayer && !fromRemote) {
      net.broadcastRumbleFinish(
        winningTeam,
        winnerName,
        this.rumbleManager?.frostScore,
        this.rumbleManager?.blazeScore,
        this.rumbleManager?.getRacerScoresArray()
      );
    }

    // Determine banner text, subtitle and theme
    let title = '';
    let sub = '';
    let theme: 'frost' | 'blaze' | 'solo' | 'draw' = 'solo';

    if (winningTeam === 'frost') {
      title = 'TEAM FROST WINS!';
      sub = 'GLACIAL SUPREMACY // ARENA DOMINATED';
      theme = 'frost';
    } else if (winningTeam === 'blaze') {
      title = 'TEAM BLAZE WINS!';
      sub = 'SOLAR INFERNO // ARENA DOMINATED';
      theme = 'blaze';
    } else if (winningTeam === 'draw') {
      title = 'DRAW MATCH!';
      sub = 'MUTUAL ANNIHILATION // STALEMATE';
      theme = 'draw';
    } else {
      title = `${winnerName} WINS!`;
      sub = 'LAST KART STANDING // ARENA CHAMPION';
      theme = 'solo';
    }

    // Total outro celebration: 1.1s for the final slam/kill registration + 3.0s victory celebration = 4.1s
    this.rumbleOutroTimer = 4.1;

    if (this.rumbleVictoryTimeout) {
      clearTimeout(this.rumbleVictoryTimeout);
      this.rumbleVictoryTimeout = null;
    }

    // Sequential timing: let player enjoy winning slam & killfeed for 1.1s, THEN cleanly display victory banner
    this.rumbleVictoryTimeout = window.setTimeout(() => {
      this.rumbleVictoryTimeout = null;
      if (!this.isRumbleOutroActive || !this.isRumbleMode) return;

      // Cleanly clear center combat slam popup so they NEVER overlap
      this.hud.hideSmashCombat();

      // Play triumphant victory audio fanfare
      sounds.playVictory();

      // Burst premium multi-stage fireworks celebration
      CelebrationFX.celebrateVictory(theme === 'frost' ? 'frost' : theme === 'blaze' ? 'blaze' : 'yellow');

      // Display Neo-Brutalist victory banner over arena
      this.hud.showRumbleVictoryBanner(title, sub, theme);
    }, 1100);
  }

  private finalizeRumbleMatch() {
    if (this.rumbleVictoryTimeout) {
      clearTimeout(this.rumbleVictoryTimeout);
      this.rumbleVictoryTimeout = null;
    }
    this.isRumbleOutroActive = false;
    this.rumbleOutroTimer = 0;
    this.hud.hideSmashCombat();
    this.hud.hideRumbleVictoryBanner();

    if (!this.pendingRumbleFinish || !this.rumbleManager) return;
    let { winningTeam, winnerName } = this.pendingRumbleFinish;
    this.pendingRumbleFinish = null;

    this.state = GameState.FINISHED;
    this.isSpectating = false;
    this.hud.hideSpectatorOverlay();
    speedlines.reset();
    sounds.fadeEngineOut(1.0);

    let isPlayerWinner = false;
    if (this.rumbleManager.isTDM) {
      isPlayerWinner = winningTeam === this.selectedRumbleSide;
    } else {
      const myRacer = this.rumbleManager.racers.get(this.player.kart.id);
      if (this.selectedRumbleRule === 'lives_3') {
        isPlayerWinner = myRacer !== undefined && !myRacer.isEliminated;
      } else {
        const allSorted = Array.from(this.rumbleManager.racers.values()).sort(compareRumbleRacers);
        if (allSorted[0]) {
          winnerName = allSorted[0].name;
        }
        isPlayerWinner = myRacer !== undefined && allSorted[0]?.id === myRacer.id;
      }
    }

    this.hud.showRumbleFinish(
      winningTeam,
      winnerName,
      isPlayerWinner,
      Array.from(this.rumbleManager.racers.values()),
      this.rumbleManager.frostScore,
      this.rumbleManager.blazeScore
    );

    const coinsEarned = isPlayerWinner ? 200 : 90;
    const xpEarned = isPlayerWinner ? 80 : 45;
    this.animateFinishRewards(coinsEarned, xpEarned);

    const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;
    if (restartBtn) {
      if (this.isMultiplayer) {
        if (net.isHost) {
          restartBtn.innerText = 'CONTINUE TO ROOM ❯';
          restartBtn.disabled = false;
        } else {
          restartBtn.innerText = 'WAITING FOR HOST ❯';
          restartBtn.disabled = true;
        }
      } else {
        restartBtn.innerText = 'PLAY AGAIN';
        restartBtn.disabled = false;
      }
    }

    const changeKartBtn = document.getElementById('change-kart-btn') as HTMLButtonElement | null;
    if (changeKartBtn) {
      changeKartBtn.innerText = this.isMultiplayer ? 'LEAVE ROOM' : 'MAIN MENU';
    }
  }

  private renderLobbyRoster(players: RemotePlayerInfo[]) {
    const countEl = document.getElementById('lobby-count');
    if (countEl) countEl.innerText = players.length.toString();

    const listEl = document.getElementById('lobby-player-list');
    const vsDeck = document.getElementById('lobby-vs-deck');
    if (!listEl || !vsDeck) return;

    const isRumble = net.selectedMode === 'rumble' || this.selectedMpMode === 'rumble';
    const isRumbleTdm = isRumble && (net.isHost ? this.selectedMpRumbleFormat === 'tdm' : net.selectedRumbleFormat === 'tdm');

    const frostPlayers = players.filter((p) => (p.team || 'frost') === 'frost');
    const blazePlayers = players.filter((p) => p.team === 'blaze');

    // Launch Button State Validation (Min 2 Players, Host Only, Team Balance if Rumble TDM)
    const mpLaunchBtn = document.getElementById('btn-start-multiplayer') as HTMLButtonElement | null;
    if (mpLaunchBtn) {
      if (net.isHost) {
        if (players.length < 2) {
          mpLaunchBtn.disabled = true;
          mpLaunchBtn.classList.add('is-waiting');
          mpLaunchBtn.innerHTML = '<span>WAITING FOR RACERS (MIN 2 REQUIRED)</span>';
        } else if (isRumbleTdm && (frostPlayers.length === 0 || blazePlayers.length === 0)) {
          mpLaunchBtn.disabled = true;
          mpLaunchBtn.classList.add('is-waiting');
          mpLaunchBtn.innerHTML = '<span>NEED AT LEAST 1 RACER IN EACH SQUAD</span>';
        } else {
          mpLaunchBtn.disabled = false;
          mpLaunchBtn.classList.remove('is-waiting');
          mpLaunchBtn.innerHTML = '<span>LAUNCH MULTIPLAYER MATCH</span><svg viewBox="0 0 24 24" width="22" height="22" fill="#000"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }
      } else {
        mpLaunchBtn.disabled = true;
        mpLaunchBtn.classList.add('is-waiting');
        mpLaunchBtn.innerHTML = '<span>WAITING FOR HOST TO START...</span>';
      }
    }

    if (isRumbleTdm) {
      // Show Versus Split Deck, hide standard roster
      listEl.style.display = 'none';
      vsDeck.style.display = 'flex';

      const frostList = document.getElementById('frost-player-list');
      const blazeList = document.getElementById('blaze-player-list');
      const frostCount = document.getElementById('count-team-frost-deck');
      const blazeCount = document.getElementById('count-team-blaze-deck');
      const joinFrostBtn = document.getElementById('btn-join-frost') as HTMLButtonElement | null;
      const joinBlazeBtn = document.getElementById('btn-join-blaze') as HTMLButtonElement | null;

      if (frostCount) frostCount.innerText = `${frostPlayers.length} / 4`;
      if (blazeCount) blazeCount.innerText = `${blazePlayers.length} / 4`;

      const myTeam = net.myTeam || 'frost';

      if (joinFrostBtn) {
        if (myTeam === 'frost') {
          joinFrostBtn.classList.add('is-active');
          joinFrostBtn.innerHTML = '<span>YOUR SQUAD</span>';
        } else {
          joinFrostBtn.classList.remove('is-active');
          joinFrostBtn.innerHTML = '<span>JOIN FROST</span>';
        }
      }

      if (joinBlazeBtn) {
        if (myTeam === 'blaze') {
          joinBlazeBtn.classList.add('is-active');
          joinBlazeBtn.innerHTML = '<span>YOUR SQUAD</span>';
        } else {
          joinBlazeBtn.classList.remove('is-active');
          joinBlazeBtn.innerHTML = '<span>JOIN BLAZE</span>';
        }
      }

      const createVersusCard = (p: RemotePlayerInfo, squadIdx: number) => {
        const isSelf = p.peerId === net.myPeerId;
        const skinName = getSkinDisplayName(p.skinId);
        const card = document.createElement('div');
        card.className = `mp-player-card ${isSelf ? 'is-self' : ''}`;
        card.innerHTML = `
          <div class="mp-card-left">
            <div class="mp-card-badges">
              <span class="mp-card-num">#0${squadIdx + 1}</span>
              <span class="mp-card-role ${p.isHost ? 'role-host' : 'role-guest'}">${p.isHost ? 'HOST' : 'RACER'}</span>
              ${p.isVip ? '<span class="mp-card-vip-tag"><svg viewBox="0 0 24 24" width="10" height="10" style="fill: #000; vertical-align: -1px; margin-right: 2px;"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>VIP</span>' : ''}
              <span class="mp-card-lvl-tag">LV.${p.level || 1}</span>
              ${isSelf ? '<span class="mp-card-you-tag">YOU</span>' : ''}
            </div>
            <h4 class="mp-card-name" title="${p.name}">${p.name}</h4>
          </div>
          <div class="mp-card-right">
            <span class="mp-card-skin-tag">${skinName}</span>
            <span class="mp-card-status-dot">READY</span>
          </div>
        `;
        return card;
      };

      if (frostList) {
        frostList.innerHTML = '';
        if (frostPlayers.length === 0) {
          frostList.innerHTML = '<div class="mp-vs-empty-notice">NO RACERS IN FROST</div>';
        } else {
          frostPlayers.forEach((p, i) => frostList.appendChild(createVersusCard(p, i)));
        }
      }

      if (blazeList) {
        blazeList.innerHTML = '';
        if (blazePlayers.length === 0) {
          blazeList.innerHTML = '<div class="mp-vs-empty-notice">NO RACERS IN BLAZE</div>';
        } else {
          blazePlayers.forEach((p, i) => blazeList.appendChild(createVersusCard(p, i)));
        }
      }

    } else {
      // Normal Elastic Roster Grid (Classic GP, Hardcore Sky, Time Sprint, Rumble FFA)
      vsDeck.style.display = 'none';
      listEl.style.display = 'grid';
      listEl.innerHTML = '';

      // Render ONLY active connected racers (Sleek cards, no clutter)
      players.forEach((p, idx) => {
        const isSelf = p.peerId === net.myPeerId;
        const skinName = getSkinDisplayName(p.skinId);

        const card = document.createElement('div');
        card.className = `mp-player-card ${isSelf ? 'is-self' : ''}`;
        card.innerHTML = `
          <div class="mp-card-left">
            <div class="mp-card-badges">
              <span class="mp-card-num">#0${idx + 1}</span>
              <span class="mp-card-role ${p.isHost ? 'role-host' : 'role-guest'}">${p.isHost ? 'HOST' : 'RACER'}</span>
              ${p.isVip ? '<span class="mp-card-vip-tag"><svg viewBox="0 0 24 24" width="10" height="10" style="fill: #000; vertical-align: -1px; margin-right: 2px;"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>VIP</span>' : ''}
              <span class="mp-card-lvl-tag">LV.${p.level || 1}</span>
              ${isSelf ? '<span class="mp-card-you-tag">YOU</span>' : ''}
            </div>
            <h4 class="mp-card-name" title="${p.name}">${p.name}</h4>
          </div>
          <div class="mp-card-right">
            <span class="mp-card-skin-tag">${skinName}</span>
            <span class="mp-card-status-dot">READY</span>
          </div>
        `;
        listEl.appendChild(card);
      });

      // Append exactly ONE sleek invite card if room has open capacity (< 8 players)
      if (players.length < 8) {
        const inviteCard = document.createElement('div');
        inviteCard.className = 'mp-invite-card';
        inviteCard.title = 'Click to copy room invite link';
        inviteCard.onclick = () => {
          document.getElementById('btn-copy-link')?.click();
        };
        inviteCard.innerHTML = `
          <div class="mp-invite-left">
            <div class="mp-invite-icon-box">+</div>
            <div class="mp-invite-text">
              <div class="mp-invite-title">INVITE RACER</div>
              <div class="mp-invite-sub">SHARE CODE WITH FRIENDS</div>
            </div>
          </div>
          <button type="button" class="mp-invite-action-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>COPY LINK</span>
          </button>
        `;
        listEl.appendChild(inviteCard);
      }
    }
  }

  private handleRemoteTransform(data: RemoteKartTransform) {
    let remote = this.remoteRacers.get(data.peerId);
    if (!remote) {
      // Lazy spawn if player is in lobbyPlayers and match is active
      const peer = net.lobbyPlayers.find((p) => p.peerId === data.peerId);
      if (peer && this.track) {
        const pos = new THREE.Vector3(data.x, data.y, data.z);
        const rot = new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw);
        const kart = new Kart(`kart-${peer.peerId}`, peer.kartType, this.engine.scene, this.physics, pos, rot);
        kart.applySkin(peer.skinId || 'skin_default');
        kart.track = this.track;
        this.allKarts.push(kart);

        const nameTag = createBrutalistNameTag(peer.name, undefined, peer.isVip);
        kart.group.add(nameTag);

        const interpolator = new NetworkInterpolator();
        interpolator.init(pos, rot);

        remote = {
          peerId: peer.peerId,
          name: peer.name,
          kart,
          interpolator,
          targetPos: pos.clone(),
          targetRot: rot.clone(),
          targetSpeed: data.speed,
          targetSteer: data.steer,
          isDrifting: data.drift,
          isBoosting: data.boost,
          nameSprite: nameTag,
          isSmashed: false,
          smashTimer: 0,
          launchVelocity: new THREE.Vector3(),
          tumbleAngularVel: new THREE.Vector3(),
          lastPacketTime: performance.now(),
        };
        this.remoteRacers.set(peer.peerId, remote);
        this.checkpoints.registerRacer(kart.id, peer.name, false, pos, rot, peer.isVip);
      } else {
        return;
      }
    }

    remote.lastPacketTime = performance.now();
    remote.interpolator.pushSnapshot(data);

    if (remote.isSmashed) {
      // While the kart is airborne/smashed, ONLY update the Y position from the network.
      // This lets us detect early landing (victim's phone lands → their Y returns to floor level)
      // without snapping the XZ position mid-air (which caused the "block substance in air" feel).
      remote.targetPos.y = data.y;
    } else {
      remote.targetPos.set(data.x, data.y, data.z);
    }
    remote.targetRot.set(data.qx, data.qy, data.qz, data.qw);
    remote.targetSpeed = data.speed;
    remote.targetSteer = data.steer;
    remote.isDrifting = data.drift;
    remote.isBoosting = data.boost;
    if (data.isGhost !== undefined && remote.kart.isGhost !== data.isGhost) {
      remote.kart.setGhost(data.isGhost, 3.5);
    }
  }

  private handleRemoteSmash(packet: SmashPacket) {
    if (packet.targetPeerId === net.myPeerId && this.player) {
      // Complete invulnerability while Protection Shield ("Kawach") is active!
      if (this.player.kart.isGhost) {
        return;
      }

      if (this.isRumbleMode && this.rumbleManager) {
        const attackerPeerId = packet.attackerPeerId;
        if (attackerPeerId) {
          const attackerRemote = this.remoteRacers.get(attackerPeerId);
          if (attackerRemote) {
            this.rumbleManager.recordHit(attackerRemote.kart, this.player.kart);
          }
        }
      }

      if (packet.impulseY > 1.5) {
        // Airborne Smash Launch (Nitro / High speed ram)
        const launchVel = new THREE.Vector3(packet.impulseX, packet.impulseY, packet.impulseZ);
        launchVel.y = Math.max(12.0, Math.abs(launchVel.y));

        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.player.kart.group.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.player.kart.group.quaternion);
        const hitDir = new THREE.Vector3(launchVel.x, 0, launchVel.z).normalize();

        const sideImpact = hitDir.dot(right);
        const rearImpact = hitDir.dot(fwd);
        const rollTorque = -sideImpact * 12.0;
        const pitchTorque = -rearImpact * 10.0;
        const yawTorque = -Math.sign(sideImpact || 1) * 11.0;
        const torque = new THREE.Vector3(pitchTorque, yawTorque, rollTorque);

        this.player.kart.launchIntoAir(launchVel, false, torque);
        sounds.playCrash(1.6);
        this.player.triggerImpactShake(2.2);
      } else {
        // Grounded Bumper Bump (Glancing bump / low speed collision)
        const bumpImpulse = new THREE.Vector3(packet.impulseX, 0, packet.impulseZ);
        this.player.kart.applyBumperBump(bumpImpulse, 0.85);
        sounds.playCrash(0.9);
        this.player.triggerImpactShake(0.8);
      }
    } else {
      // 3rd-party observer visual sync when one remote player launches another remote player.
      // IMPORTANT: if targetRemote.isSmashed is already true, this is the attacker receiving
      // their own broadcast SmashPacket echo back — do NOT re-trigger or reset the smash!
      const targetRemote = this.remoteRacers.get(packet.targetPeerId);
      if (targetRemote && !targetRemote.kart.isGhost && packet.impulseY > 1.5 && !targetRemote.isSmashed) {
        targetRemote.isSmashed = true;
        targetRemote.smashTimer = 3.5;
        targetRemote.launchVelocity.set(packet.impulseX, Math.max(12.0, Math.abs(packet.impulseY)), packet.impulseZ);
        targetRemote.tumbleAngularVel.set(
          (Math.random() - 0.5) * 8.0,
          (Math.random() - 0.5) * 12.0,
          (Math.random() - 0.5) * 8.0
        );
      }
    }
  }

  private handleRemotePlayerLeft(peerId: string, fallbackName?: string) {
    const remote = this.remoteRacers.get(peerId);
    const wasInLobby = net.lobbyPlayers.some((p) => p.peerId === peerId);
    if (!remote && !wasInLobby) {
      return;
    }
    const displayName = (remote && remote.name) ? remote.name : (fallbackName || 'A RACER');

    // Show alert in game's normal theme banner
    this.hud.showAlert(`${displayName.toUpperCase()} LEFT THE GAME`, 'recoil', 3200);

    // Clean up Three.js Sprite name tag & materials
    if (remote && remote.nameSprite) {
      if (remote.nameSprite.material) {
        if (remote.nameSprite.material.map) remote.nameSprite.material.map.dispose();
        remote.nameSprite.material.dispose();
      }
      this.engine.scene.remove(remote.nameSprite);
    }

    // Clean up kart 3D mesh & physics body
    if (remote && remote.kart) {
      remote.kart.dispose(this.engine.scene, this.physics);
      const kartIdx = this.allKarts.indexOf(remote.kart);
      if (kartIdx >= 0) this.allKarts.splice(kartIdx, 1);

      if (this.checkpoints) {
        this.checkpoints.racers.delete(remote.kart.id);
      }
      if (this.rumbleManager) {
        this.rumbleManager.racers.delete(remote.kart.id);
      }
    }

    this.remoteRacers.delete(peerId);
    if (this.isSpectating) {
      this.cycleSpectator(0);
    }
  }

  private handleRoomClosed(reason?: string) {
    if (!this.isMultiplayer) return;
    this.quitToLobby();
    const reasonText = reason === 'HOST_CLOSED' ? 'HOST CLOSED ROOM' : 'LOST CONNECTION TO HOST';
    this.hud.showAlert(`${reasonText} // RETURNED TO LOBBY`, 'respawn');
  }

  public quitToLobby(forceClose: boolean = false) {
    clearRumbleCombatCooldowns();
    sounds.stopEngine();
    sounds.isScoreboardActive = false;
    sounds.isFadingOut = false;
    if (this.rumbleVictoryTimeout) {
      clearTimeout(this.rumbleVictoryTimeout);
      this.rumbleVictoryTimeout = null;
    }
    this.isRumbleOutroActive = false;
    this.rumbleOutroTimer = 0;
    this.pendingRumbleFinish = null;
    this.hud.hideSmashCombat();
    this.hud.hideRumbleVictoryBanner();
    this.hud.hideCountdown();
    this.lastAnnouncedCountdown = '';
    matchLoadingScreen.hide();
    this.isMidRaceSpectator = false;
    this.isSpectating = false;
    this.hud.hideSpectatorOverlay();
    this.hud.setPing(null);
    if (this.isMultiplayer) {
      net.cleanup(forceClose);
      this.isMultiplayer = false;
      this.hud.setRoomBadge(null);
    }
    this.resetMpLobbyUI();
    this.resetModeState('menu');
    this.rumbleManager = null;
    this.switchTrackMode('classic');
    settingsModal.setIsInRace(false);

    const finishModal = document.getElementById('finish-modal');
    if (finishModal) finishModal.style.display = 'none';

    this.isModeSelectOpen = false;
    const modeSelectModal = document.getElementById('mode-select-modal');
    if (modeSelectModal) modeSelectModal.style.display = 'none';

    this.hud.resetForNewRace(3);
    this.hud.hideHUD();
    document.getElementById('start-menu-modal')!.style.display = 'flex';
    this.state = GameState.MENU;
    if (this.showroomGroup) {
      this.showroomGroup.visible = true;
    }
    this.updateShowroomKart(this.selectedKartIndex);
    this.setupMenuCamera();
    this.hud.showAlert('RETURNED TO LOBBY', 'respawn');
  }

  public leaveMultiplayerLobby(forceClose: boolean = false) {
    this.isMultiplayer = false;
    sounds.stopEngine();
    sounds.isScoreboardActive = false;
    sounds.isFadingOut = false;
    if (this.rumbleVictoryTimeout) {
      clearTimeout(this.rumbleVictoryTimeout);
      this.rumbleVictoryTimeout = null;
    }
    this.isRumbleOutroActive = false;
    this.rumbleOutroTimer = 0;
    this.pendingRumbleFinish = null;
    this.hud.hideSmashCombat();
    this.hud.hideRumbleVictoryBanner();
    this.hud.hideCountdown();
    this.lastAnnouncedCountdown = '';
    matchLoadingScreen.hide();
    this.isMidRaceSpectator = false;
    this.isSpectating = false;
    this.hud.hideSpectatorOverlay();
    this.hud.setPing(null);
    net.cleanup(forceClose);
    this.resetMpLobbyUI();
    this.hud.setRoomBadge(null);
  }

  private returnToMultiplayerRoom() {
    clearRumbleCombatCooldowns();
    sounds.stopEngine();
    sounds.stopDrift();
    sounds.isScoreboardActive = false;
    sounds.isFadingOut = false;
    if (this.rumbleVictoryTimeout) {
      clearTimeout(this.rumbleVictoryTimeout);
      this.rumbleVictoryTimeout = null;
    }
    this.isRumbleOutroActive = false;
    this.rumbleOutroTimer = 0;
    this.pendingRumbleFinish = null;

    // Hide finish modal & gameplay HUDs
    const finishModal = document.getElementById('finish-modal');
    if (finishModal) finishModal.style.display = 'none';

    this.hud.hideHUD();
    this.hud.hideSmashCombat();
    this.hud.hideRumbleVictoryBanner();
    this.hud.hideCountdown();
    this.hud.hideFinishCountdown();
    this.hud.hideSpectatorOverlay();
    speedlines.reset();
    settingsModal.setIsInRace(false);

    // Reset gameplay flags and spectator state
    this.state = GameState.MENU;
    this.isSpectating = false;
    this.isMidRaceSpectator = false;
    this.isPlayerFinished = false;
    this.finishCountdownActive = false;
    this.firstWinnerName = '';
    this.raceTimer = 0;

    // Clean up scene karts and Rapier physics rigid bodies
    this.resetModeState('menu');
    this.rumbleManager = null;

    // Restore 3D showroom turntable
    if (this.showroomGroup) {
      this.showroomGroup.visible = true;
    }
    this.updateShowroomKart(this.selectedKartIndex);
    this.setupMenuCamera();

    // Hide menus & show Multiplayer Room view
    const startMenu = document.getElementById('start-menu-modal');
    if (startMenu) startMenu.style.display = 'none';
    const modeSelectModal = document.getElementById('mode-select-modal');
    if (modeSelectModal) modeSelectModal.style.display = 'none';
    const rumbleModal = document.getElementById('rumble-modal');
    if (rumbleModal) rumbleModal.style.display = 'none';

    const mpModal = document.getElementById('mp-modal');
    const optionsGrid = document.getElementById('mp-options-grid');
    const lobbyView = document.getElementById('lobby-view');
    const codeDisplay = document.getElementById('lobby-code-display');
    const lapsDisplay = document.getElementById('lobby-laps-display');
    const modeDisplay = document.getElementById('lobby-mode-display');

    if (mpModal) {
      mpModal.classList.add('open');
      mpModal.style.display = 'flex';
    }
    if (optionsGrid) optionsGrid.style.display = 'none';
    if (lobbyView) lobbyView.style.display = 'flex';
    if (codeDisplay) codeDisplay.innerText = net.roomCode;

    if (modeDisplay) {
      if (net.selectedMode === 'rumble') {
        modeDisplay.innerText = `SKY RUMBLE (${net.selectedRumbleFormat === 'tdm' ? 'TDM' : 'FFA'})`;
      } else if (net.selectedMode === 'hardcore') {
        modeDisplay.innerText = 'HARDCORE SKY';
      } else if (net.selectedMode === 'time_attack' || net.selectedMode === 'time_attack_hardcore') {
        modeDisplay.innerText = `TIME SPRINT (${net.selectedMode === 'time_attack_hardcore' ? 'HARDCORE' : 'CLASSIC'})`;
      } else {
        modeDisplay.innerText = 'CLASSIC GRAND PRIX';
      }
    }
    if (lapsDisplay) {
      lapsDisplay.innerText = `${net.selectedLaps} LAPS`;
    }

    this.renderLobbyRoster(net.lobbyPlayers);
    this.hud.setRoomBadge(net.roomCode);
    this.hud.showAlert('RETURNED TO MULTIPLAYER ROOM', 'boost');
  }

  private resetMpLobbyUI() {
    const lobbyView = document.getElementById('lobby-view');
    const optionsGrid = document.getElementById('mp-options-grid');
    if (lobbyView) lobbyView.style.display = 'none';
    if (optionsGrid) optionsGrid.style.display = 'grid';

    const joinInput = document.getElementById('join-room-input') as HTMLInputElement | null;
    if (joinInput) joinInput.value = '';

    const codeDisplay = document.getElementById('lobby-code-display');
    if (codeDisplay) codeDisplay.innerText = 'GENERATING...';

    const countDisplay = document.getElementById('lobby-count');
    if (countDisplay) countDisplay.innerText = '1';

    const playerList = document.getElementById('lobby-player-list');
    if (playerList) playerList.innerHTML = '';

    const frostList = document.getElementById('lobby-frost-list');
    if (frostList) frostList.innerHTML = '';

    const blazeList = document.getElementById('lobby-blaze-list');
    if (blazeList) blazeList.innerHTML = '';

    const vsDeck = document.getElementById('lobby-vs-deck');
    if (vsDeck) vsDeck.style.display = 'none';

    const pingTag = document.getElementById('lobby-ping-tag');
    if (pingTag) pingTag.style.display = 'none';

    const mpLaunchBtn = document.getElementById('btn-start-multiplayer') as HTMLButtonElement | null;
    if (mpLaunchBtn) {
      mpLaunchBtn.style.display = 'none';
      mpLaunchBtn.innerText = 'LAUNCH MULTIPLAYER MATCH';
    }

    const hostBtn = document.getElementById('btn-host-room') as HTMLButtonElement | null;
    if (hostBtn) {
      hostBtn.disabled = false;
      hostBtn.innerText = '★ CREATE MULTIPLAYER LOBBY ★';
    }

    const joinBtn = document.getElementById('btn-join-room') as HTMLButtonElement | null;
    if (joinBtn) {
      joinBtn.disabled = false;
      joinBtn.innerText = '▶ JOIN LOBBY';
    }

    this.lastKnownLobbyPlayerIds.clear();
  }

  private startRaceCountdown(targetStartTime?: number) {
    this.triggerFullscreen();
    settingsModal.setIsInRace(true);
    if (this.showroomGroup) {
      this.showroomGroup.visible = false;
    }
    if (!this.isRumbleMode) {
      this.spawnRacers();
    }
    const totalLaps = this.checkpoints?.totalLaps || this.hostLaps || 3;
    this.hud.resetForNewRace(totalLaps);
    this.hud.showHUD();
    this.hud.setRumbleMode(this.isRumbleMode);
    this.hud.setTimeSprintMode(this.isNoCollisionMode);
    if (this.isNoCollisionMode) {
      const trackKey = this.track && this.track.isHardcore ? 'hardcore' : 'classic';
      this.hud.setTrackPB(recordManager.getRecord(trackKey).bestRaceTime);
    }
    this.hud.updateSpeed(0);

    if (!this.isRumbleMode && this.player?.kart && this.checkpoints) {
      const playerRank = this.checkpoints.getPlayerRank();
      const standings = this.checkpoints.getStandings();
      this.hud.updateStatus(
        playerRank,
        1,
        totalLaps,
        0,
        0,
        0,
        this.player.kart.nitroCharges
      );
      this.hud.updateLiveStandings(standings, totalLaps, undefined, true);
    }

    this.state = GameState.COUNTDOWN;
    this.raceTimer = 0;
    this.netBroadcastTimer = 0;
    this.lastAnnouncedCountdown = '';

    // Reset finish countdown and spectator states
    sounds.isScoreboardActive = false;
    sounds.isFadingOut = false;
    this.isPlayerFinished = false;
    this.playerFinishTime = 0;
    this.racerFinishTimes.clear();
    this.playerFinishRank = 0;
    this.finishCountdownActive = false;
    this.finishCountdownTimer = 15.0;
    this.firstWinnerName = '';
    this.isSpectating = false;
    this.spectatedTargetIdx = 0;
    this.hud.hideFinishCountdown();
    this.hud.hideSpectatorOverlay();

    // Synchronized universal target start timestamp (3.2s from now for clean 3.. 2.. 1.. SMASH!)
    this.raceStartTime = targetStartTime || (Date.now() + 3200);

    // syncCountdownTick() is called every frame by the render loop (GameState.COUNTDOWN branch),
    // so no setInterval is needed. rAF-based loops are not throttled by background tab policy.
    this.syncCountdownTick();
  }

  private handleAuthoritativeCountdownTick(count: 3 | 2 | 1 | 0) {
    if (this.state !== GameState.COUNTDOWN && count !== 0) return;
    matchLoadingScreen.hide();

    if (count === 3) {
      if (this.lastAnnouncedCountdown !== '3') {
        this.lastAnnouncedCountdown = '3';
        this.hud.showCountdown('3');
        sounds.playCountdown(false);
      }
    } else if (count === 2) {
      if (this.lastAnnouncedCountdown !== '2') {
        this.lastAnnouncedCountdown = '2';
        this.hud.showCountdown('2');
        sounds.playCountdown(false);
      }
    } else if (count === 1) {
      if (this.lastAnnouncedCountdown !== '1') {
        this.lastAnnouncedCountdown = '1';
        this.hud.showCountdown('1');
        sounds.playCountdown(false);
      }
    } else if (count === 0) {
      const goText = this.isRumbleMode ? 'SMASH!' : 'GO!';
      if (this.lastAnnouncedCountdown !== goText) {
        this.lastAnnouncedCountdown = goText;
        this.hud.showCountdown(goText);
        sounds.playCountdown(true);
        sounds.startEngine();
        this.state = GameState.RACING;
      }
    }
  }

  private syncCountdownTick() {
    if (this.state !== GameState.COUNTDOWN) {
      this.hud.hideCountdown();
      return;
    }

    // In Multiplayer: Guest strictly synchronizes with Host's authoritative broadcast ticks
    // Guest never runs ahead or starts early!
    if (this.isMultiplayer && !net.isHost) {
      // Safety net fallback: if Host drops offline during countdown, auto-unlock after targetStartTime + 1500ms
      if (Date.now() > this.raceStartTime + 1500) {
        matchLoadingScreen.hide();
        const goText = this.isRumbleMode ? 'SMASH!' : 'GO!';
        if (this.lastAnnouncedCountdown !== goText) {
          this.lastAnnouncedCountdown = goText;
          this.hud.showCountdown(goText);
          sounds.playCountdown(true);
          sounds.startEngine();
          this.state = GameState.RACING;
        }
      }
      return;
    }

    const msLeft = this.raceStartTime - Date.now();

    if (msLeft > 3000) {
      // Loading screen or network synchronization buffer active
      return;
    }

    if (msLeft > 2000) {
      if (this.lastAnnouncedCountdown !== '3') {
        this.lastAnnouncedCountdown = '3';
        this.hud.showCountdown('3');
        sounds.playCountdown(false);
        if (this.isMultiplayer && net.isHost) {
          net.broadcastCountdownTick(3);
        }
      }
    } else if (msLeft > 1000) {
      if (this.lastAnnouncedCountdown !== '2') {
        this.lastAnnouncedCountdown = '2';
        this.hud.showCountdown('2');
        sounds.playCountdown(false);
        if (this.isMultiplayer && net.isHost) {
          net.broadcastCountdownTick(2);
        }
      }
    } else if (msLeft > 0) {
      if (this.lastAnnouncedCountdown !== '1') {
        this.lastAnnouncedCountdown = '1';
        this.hud.showCountdown('1');
        sounds.playCountdown(false);
        if (this.isMultiplayer && net.isHost) {
          net.broadcastCountdownTick(1);
        }
      }
    } else if (msLeft > -900) {
      const goText = this.isRumbleMode ? 'SMASH!' : 'GO!';
      if (this.lastAnnouncedCountdown !== goText) {
        this.lastAnnouncedCountdown = goText;
        this.hud.showCountdown(goText);
        sounds.playCountdown(true);
        sounds.startEngine();
        this.state = GameState.RACING;
        if (this.isMultiplayer && net.isHost) {
          net.broadcastCountdownTick(0);
        }
      }
    } else {
      // Race has already begun on network (e.g. tab focused late)
      this.state = GameState.RACING;
      sounds.startEngine();
      if (this.isMultiplayer && net.isHost) {
        net.broadcastCountdownTick(0);
      }
    }
  }

  private spawnRacers() {
    // Clear any previous remote karts and remove their name sprites
    for (const remote of this.remoteRacers.values()) {
      if (remote.nameSprite) {
        if (remote.nameSprite.material) {
          if (remote.nameSprite.material.map) remote.nameSprite.material.map.dispose();
          remote.nameSprite.material.dispose();
        }
        this.engine.scene.remove(remote.nameSprite);
      }
    }
    this.remoteRacers.clear();

    // Clear previous karts
    for (const kart of this.allKarts) {
      this.engine.scene.remove(kart.group);
      this.physics.world.removeRigidBody(kart.rigidBody);
    }
    this.allKarts = [];
    this.bots = [];

    if (this.checkpoints) {
      this.checkpoints.racers.clear();
    }

    // Starting grid located right at the Start/Finish line Arch (t0 = 0.0)
    const t0 = 0.0;
    const slice = this.track.getTrackSlice(t0);
    const startPt = slice.position;
    const tangent = slice.tangent;
    const binormal = slice.binormal;
    const startRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

    // 8-Player Grand Starting Grid across the 25m wide plaza
    // Row 1: 4 cars side-by-side on the pole line
    // Row 2: 4 cars directly behind in secondary grid
    const slotOffsets = [
      { offsetLat: -6.0, offsetLong:  0.0 }, // Row 1 - Left Outer
      { offsetLat: -2.0, offsetLong:  0.0 }, // Row 1 - Left Inner (Pole)
      { offsetLat:  2.0, offsetLong:  0.0 }, // Row 1 - Right Inner
      { offsetLat:  6.0, offsetLong:  0.0 }, // Row 1 - Right Outer
      { offsetLat: -6.0, offsetLong: -7.5 }, // Row 2 - Left Outer
      { offsetLat: -2.0, offsetLong: -7.5 }, // Row 2 - Left Inner
      { offsetLat:  2.0, offsetLong: -7.5 }, // Row 2 - Right Inner
      { offsetLat:  6.0, offsetLong: -7.5 }, // Row 2 - Right Outer
    ];

    if (!this.isMultiplayer) {
      // SOLO RACE: 4 cars on the starting line (Player + 3 AI rivals to race and smash!)
      const pSlot = slotOffsets[1];
      const pPos = startPt.clone()
        .addScaledVector(binormal, pSlot.offsetLat)
        .addScaledVector(tangent, pSlot.offsetLong)
        .add(new THREE.Vector3(0, 0.15, 0));

      const pKart = new Kart('kart-player', this.selectedKartIndex, this.engine.scene, this.physics, pPos, startRot);
      this.allKarts.push(pKart);
      this.player = new PlayerKart(pKart, this.input);
      this.checkpoints.registerRacer(pKart.id, this.playerName || 'YOU', true, pPos, startRot, economy.isVip());

      if (economy.isVip()) {
        const pTag = createBrutalistNameTag(this.playerName || 'YOU', undefined, true);
        pKart.group.add(pTag);
      }

      // In Time Sprint SOLO mode (isNoCollisionMode && isTimeAttackSolo):
      // Pure 1-player time trial against the clock — ZERO BOTS!
      const shouldSpawnBots = !(this.isNoCollisionMode && this.isTimeAttackSolo);

      if (shouldSpawnBots) {
        // 3 Rival Bots on the starting line (Slots 0, 2, 3) - Each with distinct kart model, skin, hat, glasses & authentic gamertag
        const usedNames: string[] = [this.playerName || 'YOU'];
        const playerEquippedSkin = economy.getEquippedSkin();

        const botSlots = [
          { slot: slotOffsets[0], offsetLat: -4.0 },
          { slot: slotOffsets[2], offsetLat: 2.0 },
          { slot: slotOffsets[3], offsetLat: 5.0 },
        ];

        botSlots.forEach((cfg, i) => {
          const profile = generateBotProfile(i, playerEquippedSkin, usedNames);
          usedNames.push(profile.name);

          const bPos = startPt.clone()
            .addScaledVector(binormal, cfg.slot.offsetLat)
            .addScaledVector(tangent, cfg.slot.offsetLong)
            .add(new THREE.Vector3(0, 0.15, 0));

          const bKart = new Kart(`kart-bot-${i}`, profile.kartType, this.engine.scene, this.physics, bPos, startRot);
          bKart.applySkin(profile.skinId);
          bKart.applyHat(profile.hatId);
          bKart.applyGlasses(profile.glassesId);
          this.allKarts.push(bKart);

          const tag = createBrutalistNameTag(profile.name, undefined, false);
          bKart.group.add(tag);

          const bot = new BotKart(bKart, this.track, cfg.offsetLat, t0);
          this.bots.push(bot);
          this.checkpoints.registerRacer(bKart.id, profile.name, false, bPos, startRot, false);
        });
      }
    } else {
      // REAL-TIME MULTIPLAYER: ONLY CONNECTED HUMAN PLAYERS (ZERO BOTS!)
      const mySlotIndex = Math.max(0, net.lobbyPlayers.findIndex((p) => p.peerId === net.myPeerId));

      net.lobbyPlayers.forEach((peer, idx) => {
        const slot = slotOffsets[idx % slotOffsets.length];
        const pos = startPt.clone()
          .addScaledVector(binormal, slot.offsetLat)
          .addScaledVector(tangent, slot.offsetLong)
          .add(new THREE.Vector3(0, 0.15, 0));

        if (idx === mySlotIndex) {
          // Local Player
          const kart = new Kart(`kart-${idx}`, this.selectedKartIndex, this.engine.scene, this.physics, pos, startRot);
          this.allKarts.push(kart);
          this.player = new PlayerKart(kart, this.input);
          this.checkpoints.registerRacer(kart.id, this.playerName, true, pos, startRot, economy.isVip());
          if (economy.isVip()) {
            const pTag = createBrutalistNameTag(this.playerName, undefined, true);
            kart.group.add(pTag);
          }
        } else {
          // Remote Peer Racer
          const kart = new Kart(`kart-${idx}`, peer.kartType, this.engine.scene, this.physics, pos, startRot);
          kart.applySkin(peer.skinId || 'skin_default');
          this.allKarts.push(kart);

          // Add floating Brutopia name tag billboard
          const nameTag = createBrutalistNameTag(peer.name, undefined, peer.isVip);
          kart.group.add(nameTag);

          const interpolator = new NetworkInterpolator();
          interpolator.init(pos, startRot);

          this.remoteRacers.set(peer.peerId, {
            peerId: peer.peerId,
            name: peer.name,
            kart,
            interpolator,
            targetPos: pos.clone(),
            targetRot: startRot.clone(),
            targetSpeed: 0,
            targetSteer: 0,
            isDrifting: false,
            isBoosting: false,
            nameSprite: nameTag,
            isSmashed: false,
            smashTimer: 0,
            launchVelocity: new THREE.Vector3(),
            tumbleAngularVel: new THREE.Vector3(),
            lastPacketTime: performance.now(),
          });

          this.checkpoints.registerRacer(kart.id, peer.name, false, pos, startRot, peer.isVip);
        }
      });
    }

    // Connect authoritative track spline reference to every kart for anti-sink floor safety net
    for (const k of this.allKarts) {
      k.track = this.track;
    }
  }

  private setupMidRaceSpectatorRacers(players: RemotePlayerInfo[]) {
    // Clear any previous remote karts and remove their name sprites
    for (const remote of this.remoteRacers.values()) {
      if (remote.nameSprite) {
        if (remote.nameSprite.material) {
          if (remote.nameSprite.material.map) remote.nameSprite.material.map.dispose();
          remote.nameSprite.material.dispose();
        }
        this.engine.scene.remove(remote.nameSprite);
      }
    }
    this.remoteRacers.clear();

    // Clear previous karts
    for (const kart of this.allKarts) {
      this.engine.scene.remove(kart.group);
      this.physics.world.removeRigidBody(kart.rigidBody);
    }
    this.allKarts = [];
    this.bots = [];

    if (this.checkpoints) {
      this.checkpoints.racers.clear();
    }

    const t0 = 0.0;
    const slice = this.track.getTrackSlice(t0);
    const startPt = slice.position;
    const tangent = slice.tangent;
    const startRot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);

    // Create spectator player kart parked safely in ghost state (no collision, invisible)
    const pPos = startPt.clone().add(new THREE.Vector3(0, -100, 0));
    const pKart = new Kart('kart-player-spectator', this.selectedKartIndex, this.engine.scene, this.physics, pPos, startRot);
    this.allKarts.push(pKart);
    this.player = new PlayerKart(pKart, this.input);
    pKart.group.visible = false;

    // Spawn remote karts for all active peers
    players.forEach((peer, idx) => {
      if (peer.peerId === net.myPeerId) return;

      const pos = startPt.clone().add(new THREE.Vector3(0, 0.15 + idx * 0.1, 0));
      const kart = new Kart(`kart-${peer.peerId}`, peer.kartType, this.engine.scene, this.physics, pos, startRot);
      kart.applySkin(peer.skinId || 'skin_default');
      this.allKarts.push(kart);

      const nameTag = createBrutalistNameTag(peer.name, undefined, peer.isVip);
      kart.group.add(nameTag);

      const interpolator = new NetworkInterpolator();
      interpolator.init(pos, startRot);

      this.remoteRacers.set(peer.peerId, {
        peerId: peer.peerId,
        name: peer.name,
        kart,
        interpolator,
        targetPos: pos.clone(),
        targetRot: startRot.clone(),
        targetSpeed: 0,
        targetSteer: 0,
        isDrifting: false,
        isBoosting: false,
        nameSprite: nameTag,
        isSmashed: false,
        smashTimer: 0,
        launchVelocity: new THREE.Vector3(),
        tumbleAngularVel: new THREE.Vector3(),
        lastPacketTime: performance.now(),
      });

      this.checkpoints.registerRacer(kart.id, peer.name, false, pos, startRot, peer.isVip);
    });

    for (const k of this.allKarts) {
      k.track = this.track;
    }
  }

  private handleMidRaceJoin(
    players: RemotePlayerInfo[],
    laps: number = 3,
    mode?: MpGameMode,
    rumbleRule?: string,
    rumbleFormat?: 'tdm' | 'ffa'
  ) {
    if (this.isMidRaceSpectator && (this.state === GameState.RACING || this.state === GameState.COUNTDOWN)) {
      return;
    }

    const targetMode: MpGameMode = mode || net.selectedMode || 'classic';
    this.isMidRaceSpectator = true;
    this.isMultiplayer = true;

    // 1. Hide Menu Modals & MP Hub
    const startMenu = document.getElementById('start-menu-modal');
    if (startMenu) startMenu.style.display = 'none';
    const mpModal = document.getElementById('mp-modal');
    if (mpModal) mpModal.classList.remove('open');
    const modeSelectModal = document.getElementById('mode-select-modal');
    if (modeSelectModal) modeSelectModal.style.display = 'none';
    const finishModal = document.getElementById('finish-modal');
    if (finishModal) finishModal.style.display = 'none';
    if (this.showroomGroup) {
      this.showroomGroup.visible = false;
    }

    // 2. Setup Track Mode
    if (targetMode === 'rumble') {
      this.selectedRumbleFormat = rumbleFormat || net.selectedRumbleFormat || 'tdm';
      this.selectedRumbleRule = rumbleRule || net.selectedRumbleRule || 'kills_10';
      this.startRumbleMatch(0, true);
    } else {
      const isHardcore = targetMode === 'hardcore' || targetMode === 'time_attack_hardcore';
      const modeKey = isHardcore ? 'hardcore' : 'classic';
      this.resetModeState(modeKey);
      this.rumbleManager = null;
      this.switchTrackMode(isHardcore ? 'hardcore' : 'classic');
      this.checkpoints.setTotalLaps(laps || 3);
      this.setupMidRaceSpectatorRacers(players);
    }

    // 3. Set GameState and activate Spectator Mode
    this.state = GameState.RACING;
    this.hud.showHUD();
    this.hud.setRoomBadge(net.roomCode);
    this.startSpectating();

    this.hud.showAlert('RACE IN PROGRESS // LIVE SPECTATOR // QUEUED FOR NEXT ROUND', 'boost');
  }

  private resetRace() {
    if (this.isRumbleMode) {
      this.spawnRumbleRacers();
    } else {
      this.spawnRacers();
    }
  }

  private handleRacerFinish(racer: RacerProgress) {
    const standings = this.checkpoints.getStandings();
    const rank = standings.findIndex((r) => r.id === racer.id) + 1;

    // Record racer finish time
    racer.finishTime = this.raceTimer;
    this.racerFinishTimes.set(racer.id, this.raceTimer);
    if (racer.isPlayer) {
      this.playerFinishTime = this.raceTimer;
    }

    // 1. If this is the FIRST racer to finish across the entire race
    if (!this.finishCountdownActive) {
      this.startFinishCountdown(racer.isPlayer ? (this.playerName || 'YOU') : racer.name, 15.0);
      if (this.isMultiplayer && (this.player && this.player.kart.id === racer.id || net.isHost)) {
        net.broadcastFirstFinish(racer.id, racer.name, 15.0);
      }
    }

    // 2. If the local player just finished
    if (racer.isPlayer && !this.isPlayerFinished) {
      this.playerFinishRank = rank;
      this.isPlayerFinished = true;
      sounds.stopDrift();

      const suffixes = ['th', 'st', 'nd', 'rd', 'th'];
      const rankSuffix = `${rank}${suffixes[rank] || 'th'}`;

      if (rank === 1) {
        this.hud.showAlert('VICTORY // 1ST PLACE!', 'smash');
        CelebrationFX.celebrateVictory('yellow');
      } else {
        this.hud.showAlert(`FINISHED // ${rankSuffix} PLACE!`, 'smash');
      }

      // Automatically switch to Spectator mode to watch remaining racers battle!
      const spectatables = this.getSpectatableKarts();
      if (spectatables.length > 0) {
        this.startSpectating();
      }
    } else if (this.isSpectating) {
      // If we are currently spectating and the spectated racer just crossed the finish line,
      // seamlessly cycle camera to the next active racer who is still competing!
      const spectatables = this.getSpectatableKarts();
      const currentTarget = spectatables[this.spectatedTargetIdx % spectatables.length];
      if (currentTarget && currentTarget.id === racer.id) {
        const nextActiveIdx = spectatables.findIndex((k) => {
          const p = this.checkpoints.racers.get(k.id);
          return p && p.finishTime === null;
        });
        if (nextActiveIdx !== -1) {
          this.spectatedTargetIdx = nextActiveIdx;
          sounds.stopDrift();
          this.updateSpectatorUI();
        }
      }
    }
  }

  private startFinishCountdown(winnerName: string, seconds: number = 15.0) {
    if (this.finishCountdownActive) return;
    this.finishCountdownActive = true;
    this.finishCountdownTimer = seconds;
    this.firstWinnerName = winnerName;
    this.hud.showFinishCountdown(this.finishCountdownTimer);

    if (!this.isPlayerFinished) {
      this.hud.showAlert(`${winnerName} FINISHED 1ST! SPRINT FOR 2ND/3RD!`, 'smash');
    }
  }

  private getSpectatableKarts(): { kart: Kart; name: string; id: string; isRumble?: boolean; team?: string; kills?: number; lives?: number }[] {
    const list: { kart: Kart; name: string; id: string; isRumble?: boolean; team?: string; kills?: number; lives?: number }[] = [];

    if (this.isRumbleMode && this.rumbleManager) {
      for (const racer of this.rumbleManager.racers.values()) {
        if (!racer.isEliminated && racer.kart !== this.player?.kart) {
          list.push({
            kart: racer.kart,
            name: racer.name,
            id: racer.kart.id,
            isRumble: true,
            team: racer.team,
            kills: racer.kills,
            lives: racer.lives,
          });
        }
      }
      return list;
    }

    // Racing Modes (Classic & Hardcore): Separate active and finished racers
    const active: typeof list = [];
    const finished: typeof list = [];

    // Bots
    for (const b of this.bots) {
      const prog = this.checkpoints.racers.get(b.kart.id);
      const item = { kart: b.kart, name: prog ? prog.name : 'BOT', id: b.kart.id };
      if (prog && prog.finishTime !== null) {
        finished.push(item);
      } else {
        active.push(item);
      }
    }

    // Remote Players
    for (const remote of this.remoteRacers.values()) {
      const prog = this.checkpoints.racers.get(remote.kart.id);
      const item = { kart: remote.kart, name: remote.name, id: remote.kart.id };
      if (prog && prog.finishTime !== null) {
        finished.push(item);
      } else {
        active.push(item);
      }
    }

    // Return active racers first so spectator focus stays on live racing action
    return [...active, ...finished];
  }

  private startSpectating() {
    this.isSpectating = true;
    sounds.stopDrift();

    const spectatables = this.getSpectatableKarts();
    if (spectatables.length > 0) {
      // Prioritize active racers who haven't finished yet
      const activeIdx = spectatables.findIndex((k) => {
        const p = this.checkpoints.racers.get(k.id);
        return p && p.finishTime === null;
      });
      this.spectatedTargetIdx = activeIdx !== -1 ? activeIdx : 0;
      const target = spectatables[this.spectatedTargetIdx];
      if (this.player && this.engine?.camera && target?.kart) {
        this.player.updateCamera(0.016, this.engine.camera, target.kart);
      }
    } else {
      this.spectatedTargetIdx = 0;
    }
    this.updateSpectatorUI();
  }

  private cycleSpectator(direction: number) {
    const spectatables = this.getSpectatableKarts();
    if (spectatables.length === 0) return;
    this.spectatedTargetIdx = (this.spectatedTargetIdx + direction + spectatables.length) % spectatables.length;
    sounds.stopDrift();
    const target = spectatables[this.spectatedTargetIdx % spectatables.length];
    if (target && target.kart && this.player && this.engine?.camera) {
      this.player.updateCamera(0.016, this.engine.camera, target.kart);
    }
    this.updateSpectatorUI();
  }

  private updateSpectatorUI() {
    const spectatables = this.getSpectatableKarts();
    if (spectatables.length === 0) {
      this.hud.hideSpectatorOverlay();
      return;
    }
    const target = spectatables[this.spectatedTargetIdx % spectatables.length];
    const customHeader = this.isMidRaceSpectator ? 'QUEUED FOR NEXT ROUND' : undefined;
    if (this.isRumbleMode) {
      const isPlayerElim = !!this.rumbleManager?.isRacerKnockedOut(this.player.kart.id);
      const teamTag = target.team && target.team !== 'none' ? `[${target.team.toUpperCase()}] ` : '';
      let tag: string;
      if (this.selectedRumbleRule === 'lives_3') {
        const liveRacer = this.rumbleManager?.racers.get(target.id);
        const lives = liveRacer ? Math.max(0, liveRacer.lives) : (target.lives !== undefined ? target.lives : 0);
        tag = `${teamTag}<svg class="cute-heart-svg" viewBox="0 0 24 24" width="15" height="15" fill="#FF385C" stroke="#000" stroke-width="2" style="vertical-align:middle;display:inline-block;margin-right:2px;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>${lives} LIVES`;
      } else {
        tag = `${teamTag}${target.kills || 0} KILLS`;
      }
      this.hud.showSpectatorOverlay(target.name, tag, isPlayerElim, customHeader);
    } else {
      const standings = this.checkpoints.getStandings();
      const rank = standings.findIndex((r) => r.id === target.id) + 1;
      this.hud.showSpectatorOverlay(target.name, rank > 0 ? rank : 2, false, customHeader);
    }
  }

  private animateFinishRewards(baseCoins: number, baseXp: number) {
    const isVip = economy.isVip();
    const vipMultiplier = isVip ? 1.5 : 1.0;
    const finalRaceCoins = Math.round(baseCoins * vipMultiplier);
    const finalXp = Math.round(baseXp * vipMultiplier);

    // 1. Daily First Race Bonus check & claim
    let dailyCoins = 0;
    const dailyBadge = document.getElementById('finish-daily-badge');
    const dailyText = document.getElementById('finish-daily-text');
    if (economy.canClaimDailyFirstRace()) {
      dailyCoins = economy.claimDailyFirstRace();
      if (dailyBadge) {
        dailyBadge.style.display = 'flex';
      }
      if (dailyText) {
        dailyText.innerText = `DAILY 1ST RACE: +${dailyCoins} COINS!`;
      }
    } else {
      if (dailyBadge) {
        dailyBadge.style.display = 'none';
      }
    }

    const totalCoinsEarned = finalRaceCoins + dailyCoins;

    // 2. VIP Badges UI
    const vipBadge = document.getElementById('finish-vip-badge');
    const coinVipTag = document.getElementById('finish-coin-vip-tag');
    const xpVipTag = document.getElementById('finish-xp-vip-tag');
    if (vipBadge) vipBadge.style.display = isVip ? 'flex' : 'none';
    if (coinVipTag) coinVipTag.style.display = isVip ? 'inline-block' : 'none';
    if (xpVipTag) xpVipTag.style.display = isVip ? 'inline-block' : 'none';

    // 3. Initial state before adding rewards
    const oldLevel = economy.getLevel();
    const oldXp = economy.getXp();
    const oldNeeded = economy.getXpNeeded();
    const initialPercent = Math.min(100, Math.round((oldXp / oldNeeded) * 100));

    const finishCoinsEl = document.getElementById('finish-coins-earned');
    const finishXpEl = document.getElementById('finish-xp-earned');
    const finishLevelTag = document.getElementById('finish-level-tag');
    const finishXpNumbers = document.getElementById('finish-xp-numbers');
    const finishXpBarFill = document.getElementById('finish-xp-bar-fill') as HTMLElement | null;
    const levelupBanner = document.getElementById('finish-levelup-banner');
    const newLevelNumEl = document.getElementById('finish-new-level-num');
    const levelupRewardText = document.getElementById('finish-levelup-reward-text');

    if (levelupBanner) levelupBanner.style.display = 'none';
    if (finishLevelTag) finishLevelTag.innerText = `LVL ${oldLevel}`;
    if (finishXpNumbers) finishXpNumbers.innerText = `${oldXp} / ${oldNeeded} XP`;
    if (finishXpBarFill) {
      finishXpBarFill.classList.remove('level-glow');
      finishXpBarFill.style.width = `${initialPercent}%`;
    }
    if (finishCoinsEl) finishCoinsEl.innerText = '+0 COINS';
    if (finishXpEl) finishXpEl.innerText = '+0 XP';

    // 4. Process Economy Addition (baseCoins with VIP multiplier; dailyCoins is added by claimDailyFirstRace)
    economy.addCoins(baseCoins, false);
    const xpResult = economy.addXp(baseXp);

    // 5. Smooth 60/120Hz rAF Number Ticker (0 to 800ms)
    const startTime = performance.now();
    const duration = 850; // ms

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1.0, elapsed / duration);
      // Easing: cubic ease-out
      const ease = 1 - Math.pow(1 - progress, 3);

      const curCoins = Math.round(totalCoinsEarned * ease);
      const curXp = Math.round(finalXp * ease);

      if (finishCoinsEl) finishCoinsEl.innerText = `+${curCoins} COINS`;
      if (finishXpEl) finishXpEl.innerText = `+${curXp} XP`;

      if (progress < 1.0) {
        requestAnimationFrame(tick);
      } else {
        // Ticker completed
        sounds.playCoin();
      }
    };
    requestAnimationFrame(tick);

    // 5. Smooth XP Progress Bar Animation
    setTimeout(() => {
      if (!finishXpBarFill) return;

      if (!xpResult.leveledUp) {
        // Smooth slide up to new XP percentage
        const newPercent = Math.min(100, Math.round((xpResult.newXp / xpResult.xpNeeded) * 100));
        finishXpBarFill.style.width = `${newPercent}%`;
        if (finishXpNumbers) finishXpNumbers.innerText = `${xpResult.newXp} / ${xpResult.xpNeeded} XP`;
      } else {
        // LEVEL UP SEQUENCE!
        // Step A: Fill bar to 100%
        finishXpBarFill.style.width = '100%';
        finishXpBarFill.classList.add('level-glow');

        setTimeout(() => {
          // Step B: Pop celebration banner, victory sound & premium star shower
          sounds.playVictory();
          CelebrationFX.celebrateLevelUp(xpResult.newLevel, xpResult.bonusCoins);

          if (levelupBanner) {
            levelupBanner.style.display = 'flex';
          }
          if (newLevelNumEl) {
            newLevelNumEl.innerText = xpResult.newLevel.toString();
          }
          if (levelupRewardText) {
            levelupRewardText.innerText = `+${xpResult.bonusCoins} BONUS COINS UNLOCKED!`;
          }
          const levelupChip = document.getElementById('finish-levelup-chip');
          if (levelupChip) {
            levelupChip.innerHTML = `<span>+${xpResult.bonusCoins}</span><span>🪙</span>`;
          }
          if (finishLevelTag) {
            finishLevelTag.innerText = `LVL ${xpResult.newLevel}`;
          }

          // Step C: Reset bar to 0% then glide to remainder XP in new level
          finishXpBarFill.style.transition = 'none';
          finishXpBarFill.style.width = '0%';
          finishXpBarFill.classList.remove('level-glow');

          // Force reflow for transition reset
          void finishXpBarFill.offsetWidth;

          finishXpBarFill.style.transition = 'width 0.75s cubic-bezier(0.16, 1, 0.3, 1)';
          const remainderPercent = Math.min(100, Math.round((xpResult.newXp / xpResult.xpNeeded) * 100));
          finishXpBarFill.style.width = `${remainderPercent}%`;
          if (finishXpNumbers) {
            finishXpNumbers.innerText = `${xpResult.newXp} / ${xpResult.xpNeeded} XP`;
          }
        }, 750);
      }
    }, 180);
  }

  private endRace() {
    if (this.state === GameState.FINISHED) return;
    this.state = GameState.FINISHED;
    this.isSpectating = false;
    this.hud.hideFinishCountdown();
    this.hud.hideSpectatorOverlay();
    this.hud.showWrongWay(false);
    this.hud.updateSpeed(0);
    speedlines.reset();
    sounds.fadeEngineOut(1.0);

    const standings = this.checkpoints.getStandings();
    const playerRank = this.checkpoints.getPlayerRank();

    const playerTime = this.playerFinishTime > 0 ? this.playerFinishTime : this.raceTimer;
    if (this.player?.kart) {
      this.racerFinishTimes.set(this.player.kart.id, playerTime);
    }

    const trackKey: 'classic' | 'hardcore' = (this.track && this.track.isHardcore) ? 'hardcore' : 'classic';

    // Record evaluation STRICTLY for Time Sprint mode (this.isNoCollisionMode)
    let recordInfo: { isNewPB: boolean; currentTime: number; prevPB: number | null; delta: number } | null = null;
    if (this.isNoCollisionMode) {
      const recordRes = recordManager.checkRaceTime(trackKey, playerTime);
      recordInfo = {
        isNewPB: recordRes.isNewPB,
        currentTime: playerTime,
        prevPB: recordRes.prevPB,
        delta: recordRes.delta,
      };
      leaderboard.submitSprintRecord(trackKey, playerTime);
    }

    const showFinalLeaderboard = () => {
      this.hud.showFinishLeaderboard(
        standings,
        playerRank === 1,
        recordInfo ?? undefined,
        this.racerFinishTimes
      );

      const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;
      if (restartBtn) {
        if (this.isMultiplayer) {
          if (net.isHost) {
            restartBtn.innerText = 'CONTINUE TO ROOM ❯';
            restartBtn.disabled = false;
          } else {
            restartBtn.innerText = 'WAITING FOR HOST ❯';
            restartBtn.disabled = true;
          }
        } else {
          restartBtn.innerText = 'PLAY AGAIN';
          restartBtn.disabled = false;
        }
      }

      const changeKartBtn = document.getElementById('change-kart-btn') as HTMLButtonElement | null;
      if (changeKartBtn) {
        changeKartBtn.innerText = this.isMultiplayer ? 'LEAVE ROOM' : 'MAIN MENU';
      }

      // Coins & XP rewards based on placement
      let coinsEarned = 80;
      let xpEarned = 40;
      if (playerRank === 1) {
        coinsEarned = 220;
        xpEarned = 90;
      } else if (playerRank === 2) {
        coinsEarned = 140;
        xpEarned = 60;
      }
      this.animateFinishRewards(coinsEarned, xpEarned);
    };

    // ALWAYS go straight to the Final Standings Podium in all modes!
    showFinalLeaderboard();
  }

  private getRumbleKartVelocity = (kart: Kart): THREE.Vector3 => {
    for (const remote of this.remoteRacers.values()) {
      if (remote.kart === kart) {
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(kart.group.quaternion);
        const spd = remote.interpolator.currentSpeed || remote.targetSpeed;
        return fwd.multiplyScalar(spd);
      }
    }
    const lv = kart.rigidBody ? kart.rigidBody.linvel() : { x: 0, y: 0, z: 0 };
    return new THREE.Vector3(lv.x, lv.y, lv.z);
  };

  private isRemoteKart = (kart: Kart): boolean => {
    for (const remote of this.remoteRacers.values()) {
      if (remote.kart === kart) return true;
    }
    return false;
  };

  private handleRumbleRemoteHit = (targetKart: Kart, launchVel: THREE.Vector3, isAirborne: boolean) => {
    for (const [peerId, remote] of this.remoteRacers.entries()) {
      if (remote.kart === targetKart) {
        if (isAirborne) {
          remote.isSmashed = true;
          remote.smashTimer = 3.5;
          remote.launchVelocity.copy(launchVel);
          remote.tumbleAngularVel.set(
            (Math.random() - 0.5) * 8.0,
            (Math.random() - 0.5) * 12.0,
            (Math.random() - 0.5) * 8.0
          );
        }
        net.sendSmash(peerId, launchVel, net.myPeerId);
      }
    }
  };

  private setupCollisionDetection() {
    // Collision handling is authoritatively executed in update() (lines 4060+) with distance & ghosting checks
  }

  // Pure circuit racing solid collision:
  private handleKartSmash(kartA: Kart, kartB: Kart) {
    if (kartA.isGhost || kartB.isGhost) return;

    const posA = kartA.group.position;
    const posB = kartB.group.position;

    // Normal from A to B (strictly horizontal ground plane XZ)
    const normal = _scratchSmashNormal.set(posB.x - posA.x, 0, posB.z - posA.z);
    const dist = normal.length();
    if (dist < 0.0001) {
      normal.set(0, 0, 1);
    } else {
      normal.divideScalar(dist);
    }

    // A. Physical Anti-Clipping Separation along ground plane (UNCONDITIONAL EVERY FRAME)
    const minDistance = 2.4;
    if (dist < minDistance) {
      const overlap = (minDistance - dist) * 0.5;
      kartA.group.position.addScaledVector(normal, -overlap);
      kartB.group.position.addScaledVector(normal, overlap);
      const pA = kartA.group.position;
      kartA.rigidBody.setTranslation({ x: pA.x, y: pA.y, z: pA.z }, true);
      const pB = kartB.group.position;
      kartB.rigidBody.setTranslation({ x: pB.x, y: pB.y, z: pB.z }, true);
    }

    const now = performance.now();
    if (now - kartA.lastImpactTime < 450 || now - kartB.lastImpactTime < 450) return;
    kartA.lastImpactTime = now;
    kartB.lastImpactTime = now;

    const velA = kartA.rigidBody.linvel();
    const velB = kartB.rigidBody.linvel();

    const vA = _scratchSmashVA.set(velA.x, velA.y, velA.z);
    const vB = _scratchSmashVB.set(velB.x, velB.y, velB.z);

    // If either kart is a remote racer, use their networked speed & forward vector for momentum
    for (const remote of this.remoteRacers.values()) {
      if (remote.kart === kartA) {
        _scratchForward.set(0, 0, 1).applyQuaternion(kartA.group.quaternion);
        vA.copy(_scratchForward.multiplyScalar(remote.targetSpeed));
      }
      if (remote.kart === kartB) {
        _scratchForward.set(0, 0, 1).applyQuaternion(kartB.group.quaternion);
        vB.copy(_scratchForward.multiplyScalar(remote.targetSpeed));
      }
    }

    const relVelX = vA.x - vB.x;
    const relVelZ = vA.z - vB.z;
    const impactSpeed = Math.hypot(relVelX, relVelZ);
    // Direct closing speed along contact normal (how fast they are rushing into each other)
    const closingSpeed = Math.abs(relVelX * normal.x + relVelZ * normal.z);

    // Determine who rammed whom
    const dotA = vA.x * normal.x + vA.z * normal.z;
    const dotB = -(vB.x * normal.x + vB.z * normal.z);

    const isARammer = dotA > dotB;
    const rammer = isARammer ? kartA : kartB;
    const target = isARammer ? kartB : kartA;
    const ramDirSign = isARammer ? 1 : -1;

    // ── REALISTIC SOLID CIRCUIT RACING RIGID-BODY SIMULATION ──
    // Cars are solid rigid-bodies: zero flying into clouds, realistic bump, push, speed loss, and mild yaw spin!

    // B. Speed Penalty / Momentum Loss (15% to 35% speed drop depending on impact speed)
    const speedDamp = THREE.MathUtils.clamp(1.0 - (impactSpeed / 55.0) * 0.30, 0.65, 0.88);
    const lvA = kartA.rigidBody.linvel();
    const lvB = kartB.rigidBody.linvel();
    kartA.rigidBody.setLinvel({ x: lvA.x * speedDamp, y: lvA.y, z: lvA.z * speedDamp }, true);
    kartB.rigidBody.setLinvel({ x: lvB.x * speedDamp, y: lvB.y, z: lvB.z * speedDamp }, true);
    kartA.currentSpeed *= speedDamp;
    kartB.currentSpeed *= speedDamp;

    // C. Solid Deflection Impulse along ground plane XZ (Y is strictly 0!)
    const massA = kartA.rigidBody.mass();
    const massB = kartB.rigidBody.mass();
    const pushForce = Math.min(24.0, Math.max(8.0, impactSpeed * 0.8));
    kartA.rigidBody.applyImpulse({ x: -normal.x * pushForce * massA, y: 0, z: -normal.z * pushForce * massA }, true);
    kartB.rigidBody.applyImpulse({ x: normal.x * pushForce * massB, y: 0, z: normal.z * pushForce * massB }, true);

    // D. Tactical PIT Maneuver / Side Spin:
    // If target was hit on its side or rear corner, give it a mild yaw deflection that driver counter-steers
    const targetRight = _scratchSmashTargetRight.set(1, 0, 0).applyQuaternion(target.group.quaternion);
    const sideDot = (normal.x * ramDirSign) * targetRight.x + (normal.z * ramDirSign) * targetRight.z;
    if (Math.abs(sideDot) > 0.30) {
      const yawImpulse = Math.sign(sideDot) * Math.min(3.2, impactSpeed * 0.12);
      target.rigidBody.setAngvel({ x: 0, y: yawImpulse, z: 0 }, true);
    }

    // E. AI Bots adapt to bump
    for (const bot of this.bots) {
      if (bot.kart === target || bot.kart === rammer) {
        bot.onRammed(isARammer ? rammer : target);
      }
    }

    // F. Multiplayer gentle bump sync
    if (this.isMultiplayer) {
      for (const [peerId, remote] of this.remoteRacers.entries()) {
        if (remote.kart === target) {
          net.sendSmash(peerId, new THREE.Vector3(normal.x * ramDirSign * pushForce, 0, normal.z * ramDirSign * pushForce));
        }
      }
    }

    // Camera shake & car-thokne crash sound (ONLY for actual hard direct collision, NEVER on side-by-side!)
    const isPlayerInvolved = rammer === this.player.kart || target === this.player.kart;
    if (closingSpeed >= 6.5) {
      let crashVol = Math.min(1.4, Math.max(0.5, closingSpeed / 16.0));
      if (!isPlayerInvolved && this.player?.kart) {
        const distToPlayer = Math.min(posA.distanceTo(this.player.kart.group.position), posB.distanceTo(this.player.kart.group.position));
        crashVol = distToPlayer < 35.0 ? (1.0 - distToPlayer / 35.0) * crashVol * 0.7 : 0;
      }
      if (crashVol > 0.05) {
        sounds.playCrash(crashVol);
      }
    }

    if (isPlayerInvolved && closingSpeed >= 5.0) {
      this.player.triggerImpactShake(Math.min(1.6, closingSpeed / 14.0));
    }
  }

  private update(dt: number) {
    this.skyWorld.update(dt);
    this.sparks.update(dt);

    if (this.state === GameState.MENU) {
      // 6-Minute AFK Inactivity Watchdog in Multiplayer Staging Lobby
      if (net.roomCode !== '') {
        const elapsedAfk = Date.now() - this.lastLobbyInteractionTime;
        if (elapsedAfk >= 360000) { // 6 minutes (360 seconds)
          this.afkWarningActive = false;
          sounds.playRecoil();
          this.hud.showAlert('ROOM CLOSED // 6-MINUTE AFK INACTIVITY', 'respawn');
          this.leaveMultiplayerLobby();
        } else if (elapsedAfk >= 330000 && !this.afkWarningActive) { // 5 minutes 30 seconds
          this.afkWarningActive = true;
          sounds.playRecoil();
          this.hud.showAlert('AFK WARNING // ROOM CLOSING IN 30 SECONDS', 'recoil');
        }
      } else {
        this.lastLobbyInteractionTime = Date.now();
        this.afkWarningActive = false;
      }

      if (this.showroomTurntable) {
        if (!this.isUserDraggingTurntable) {
          // Heroic 3/4 front beauty showcase angle (always faces player proudly!)
          const targetAngle = 0.35 + Math.sin(this.showroomCloudTime * 0.75) * 0.16;
          this.showroomTurntable.rotation.y = THREE.MathUtils.lerp(
            this.showroomTurntable.rotation.y,
            targetAngle,
            Math.min(1.0, dt * 2.5)
          );
        }
      }
      // Gentle atmospheric bob on outer flanks (keeps center 100% clear at all times)
      this.showroomCloudTime += dt;
      for (let i = 0; i < this.showroomClouds.length; i++) {
        const c = this.showroomClouds[i];
        if (c.userData && c.userData.baseX !== undefined) {
          c.position.x = c.userData.baseX + Math.sin(this.showroomCloudTime * 0.45 + c.userData.phase) * 0.45;
          c.position.y = c.userData.baseY + Math.cos(this.showroomCloudTime * 0.35 + c.userData.phase) * 0.20;
        }
      }
      // Floating hot air balloons animation
      for (let i = 0; i < this.showroomBalloons.length; i++) {
        const b = this.showroomBalloons[i];
        if (b.userData && b.userData.baseY !== undefined) {
          b.position.y = b.userData.baseY + Math.sin(this.showroomCloudTime * b.userData.speed + b.userData.phase) * 0.45;
          b.position.x = b.userData.baseX + Math.sin(this.showroomCloudTime * 0.25 + b.userData.phase) * 0.25;
          b.rotation.z = Math.sin(this.showroomCloudTime * 0.5 + b.userData.phase) * 0.025;
        }
      }
      // Gentle waving flags on podium island
      for (let i = 0; i < this.showroomFlags.length; i++) {
        const f = this.showroomFlags[i];
        const baseAngle = i === 0 ? Math.PI * 0.15 : -Math.PI * 0.15;
        f.rotation.y = baseAngle + Math.sin(this.showroomCloudTime * 4.0 + i * 2.0) * 0.08;
      }
      // Reset FOV strictly back to 65 in MENU state to prevent race FOV leak (nitro/boost/air zoom-out)
      if (Math.abs(this.engine.camera.fov - 65) > 0.05) {
        this.engine.camera.fov = THREE.MathUtils.lerp(this.engine.camera.fov, 65, Math.min(1.0, dt * 10));
        this.engine.camera.updateProjectionMatrix();
      }

      if (this.isModeSelectOpen) {
        // High-end cinematic camera angle when choosing modes: elevated wide perspective of 3D island
        const driftX = Math.sin(this.showroomCloudTime * 0.22) * 0.85;
        this.engine.camera.position.set(driftX, this.STUDIO_Y + 2.35, 9.2);
        this.engine.camera.lookAt(0, this.STUDIO_Y + 0.65, 0);
      } else if (this.isStoreOpen) {
        // High-end tuning showroom angle: closer, focused on the kart on the turntable
        if (window.innerHeight < 560 || window.innerWidth < 860) {
          this.engine.camera.position.set(0, this.STUDIO_Y + 1.48, 6.7);
          this.engine.camera.lookAt(0, this.STUDIO_Y + 0.38, 0);
        } else {
          this.engine.camera.position.set(0, this.STUDIO_Y + 1.45, 6.8);
          this.engine.camera.lookAt(0, this.STUDIO_Y + 0.45, 0);
        }
      } else if (window.innerHeight < 560 || window.innerWidth < 860) {
        this.engine.camera.position.set(0, this.STUDIO_Y + 1.58, 6.85);
        this.engine.camera.lookAt(0, this.STUDIO_Y + 0.48, 0);
      } else {
        this.engine.camera.position.set(0, this.STUDIO_Y + 1.75, 7.8);
        this.engine.camera.lookAt(0, this.STUDIO_Y + 0.55, 0);
      }
      speedlines.reset();
      return;
    }

    // Broadcast local player transform over WebRTC
    if (this.isMultiplayer && !this.isMidRaceSpectator && (this.state === GameState.RACING || this.state === GameState.COUNTDOWN)) {
      this.netBroadcastTimer += dt;
      if (this.netBroadcastTimer >= 0.033) {
        this.netBroadcastTimer -= 0.033;
        if (this.netBroadcastTimer > 0.066) this.netBroadcastTimer = 0;
        const linvel = this.player.kart.rigidBody ? this.player.kart.rigidBody.linvel() : { x: 0, y: 0, z: 0 };
        const angvel = this.player.kart.rigidBody ? this.player.kart.rigidBody.angvel() : { x: 0, y: 0, z: 0 };
        net.broadcastTransform(
          this.player.kart.group.position,
          this.player.kart.group.quaternion,
          linvel,
          angvel.y,
          this.player.kart.currentSpeed,
          this.player.kart.steerAngle,
          this.player.kart.isDrifting,
          this.player.kart.boostTime > 0,
          this.player.kart.isGhost
        );
      }
    }

    if (this.state === GameState.COUNTDOWN) {
      this.syncCountdownTick();

      // Step physics
      this.physics.step(dt);

      // Keep ALL karts firmly grounded on starting grid surface without sinking or moving
      for (const kart of this.allKarts) {
        kart.applyInput(0, 0, false, dt, this.physics);
        kart.rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        kart.rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        const p = kart.rigidBody.translation();
        const r = kart.rigidBody.rotation();
        kart.group.position.set(p.x, p.y, p.z);
        kart.group.quaternion.set(r.x, r.y, r.z, r.w);
      }

      this.player.updateCamera(dt, this.engine.camera);
      this.hud.updateSpeed(0);

      if (!this.isRumbleMode && this.checkpoints && this.player?.kart) {
        const playerRank = this.checkpoints.getPlayerRank();
        const standings = this.checkpoints.getStandings();
        this.hud.updateStatus(
          playerRank,
          1,
          this.checkpoints.totalLaps,
          0,
          0,
          0,
          this.player.kart.nitroCharges
        );
        this.hud.updateLiveStandings(standings, this.checkpoints.totalLaps);
      }

      // Keep radar minimap updated on start grid
      _minimapOtherKarts.length = 0;
      for (let i = 0; i < this.allKarts.length; i++) {
        if (this.allKarts[i] !== this.player.kart) {
          _minimapOtherKarts.push(this.allKarts[i]);
        }
      }
      this.hud.drawMinimap(this.track, this.player.kart, _minimapOtherKarts);

      if (this.isRumbleMode && this.rumbleManager && this.player?.kart) {
        this.hud.updateRumbleHud(this.rumbleManager, this.player.kart);
      }
      return;
    }

    if (this.state === GameState.RACING) {
      if (!this.isRumbleMode) {
        this.raceTimer += dt;
      }

      // 1. Step WASM Physics
      this.physics.step(dt);

      // Update ghost timer for all karts (clears temporary respawn ghosting reliably)
      for (const k of this.allKarts) {
        k.updateGhost(dt);
      }

      // 2. Update Player Kart
      const isRumbleKnockedOut = this.isRumbleMode && !!this.rumbleManager?.isRacerKnockedOut(this.player.kart.id);
      if (this.isMidRaceSpectator || this.isPlayerFinished || isRumbleKnockedOut || this.isSpectating) {
        // Coast gently while falling, spectating, or finished; ignore drive inputs until respawned on deck
        this.player.input.update(dt);
        this.player.kart.applyInput(0, 0, false, dt, this.physics);
        if (this.isSpectating) {
          const spectatables = this.getSpectatableKarts();
          if (spectatables.length > 0) {
            const target = spectatables[this.spectatedTargetIdx % spectatables.length];
            if (target && target.kart) {
              this.player.updateCamera(dt, this.engine.camera, target.kart);
            }
          }
        } else {
          const coastSpeed = Math.min(1.0, Math.abs(this.player.kart.currentSpeed) / this.player.kart.stats.topSpeed);
          sounds.updateEnginePitch(coastSpeed, false);
          this.player.updateCamera(dt, this.engine.camera);
        }
      } else {
        this.player.isRumbleMode = this.isRumbleMode;
        this.player.update(dt, this.physics, this.engine.camera);
      }

      // Localized Shadow Tracker: Sun only recenters when player moves > 25m (eliminates shadow texel swimming & jitter)
      const focusKart = (this.isSpectating ? this.getSpectatableKarts()[this.spectatedTargetIdx % Math.max(1, this.getSpectatableKarts().length)]?.kart : undefined) || this.player?.kart;
      if (focusKart && this.engine.dirLight) {
        const pPos = focusKart.group.position;
        if (pPos.distanceToSquared(_lastShadowCenter) > 625) {
          _lastShadowCenter.copy(pPos);
          this.engine.dirLight.position.set(pPos.x + 40, pPos.y + 75, pPos.z + 25);
          this.engine.dirLight.target.position.set(pPos.x, pPos.y, pPos.z);
        }
      }

      // Dynamic Tube Entry / Exit HUD Alert Feedback
      const inTube = this.player.kart.isInAntiGravTube;
      if (inTube && !this.playerWasInTube) {
        sounds.playBoost();
        this.playerWasInTube = true;
        this.player.kart.onTubeBarrierHit = () => {
          this.player.triggerImpactShake(2.0);
        };
        this.player.kart.onTubeBarrierCleared = () => {
          this.player.triggerImpactShake(0.8);
        };
      } else if (!inTube && this.playerWasInTube) {
        this.playerWasInTube = false;
      }

      // Checkpoint and Fall tracking for Player (if not in rumble mode and not already finished or mid-race spectating)
      if (!this.isRumbleMode && !this.isPlayerFinished && !this.isMidRaceSpectator) {
        this.checkpoints.update(
          this.player.kart.id,
          this.player.kart.group.position,
          this.player.kart.group.quaternion,
          dt,
          (pos, rot) => this.player.kart.resetTo(pos, rot, this.physics),
          this.player.kart.isGrounded,
          this.player.kart.airLaunchTimer > 0
        );
      }

      // Camera view: spectating another racer or following finished player kart
      if (this.isSpectating) {
        const spectatables = this.getSpectatableKarts();
        if (spectatables.length > 0) {
          const target = spectatables[this.spectatedTargetIdx % spectatables.length];
          this.player.updateCamera(dt, this.engine.camera, target.kart);
          this.updateSpectatorUI();
          const targetSpeed = Math.abs(target.kart.currentSpeed) || (this.remoteRacers.get(target.id)?.targetSpeed || 0);
          const targetTopSpeed = target.kart.stats?.topSpeed || 40.0;
          const speedFraction = Math.min(1.0, targetSpeed / targetTopSpeed);
          sounds.updateEnginePitch(speedFraction, targetSpeed > 2.0);
          sounds.updateDrift(!!target.kart.isDrifting, target.kart.isDrifting ? Math.min(1.0, 0.4 + target.kart.driftTime * 1.2) : 0);
        } else {
          this.player.updateCamera(dt, this.engine.camera);
          sounds.updateEnginePitch(0, false);
          sounds.stopDrift();
        }
      } else if (this.isPlayerFinished) {
        this.player.updateCamera(dt, this.engine.camera);
      }

      // 2b. Slipstream / Aerodynamic Drafting System
      let maxDraftIntensity = 0;
      const playerPos = this.player.kart.group.position;
      const playerSpeed = this.player.kart.currentSpeed;

      if (playerSpeed > 15.0 && this.allKarts.length > 1) {
        _scratchForward.set(0, 0, 1).applyQuaternion(this.player.kart.group.quaternion);

        for (const other of this.allKarts) {
          if (other === this.player.kart) continue;
          const otherPos = other.group.position;
          _scratchToOther.subVectors(otherPos, playerPos);
          const dist = _scratchToOther.length();

          // Slipstream drafting zone: between 2.5m and 18.0m directly ahead
          if (dist > 2.5 && dist < 18.0) {
            _scratchToOther.divideScalar(dist);
            const alignment = _scratchForward.dot(_scratchToOther);
            // Within a ~30° cone directly behind the lead kart
            if (alignment > 0.86) {
              const distFactor = 1.0 - (dist - 2.5) / 15.5;
              const coneFactor = (alignment - 0.86) / 0.14;
              const intensity = Math.min(1.0, distFactor * coneFactor * 1.25);
              if (intensity > maxDraftIntensity) {
                maxDraftIntensity = intensity;
              }
            }
          }
        }
      }
      this.player.kart.setDraft(maxDraftIntensity);

      // Audio & HUD alert for drafting
      if (maxDraftIntensity <= 0.35) {
        this.draftAlertCooldown = Math.max(0, this.draftAlertCooldown - dt * 2.0);
      }

      // 2c. Update AI Bots
      for (const bot of this.bots) {
        const botProg = !this.isRumbleMode ? this.checkpoints.racers.get(bot.kart.id) : null;
        const isBotFinished = !!(botProg && botProg.finishTime !== null);

        if (this.isRumbleMode && this.rumbleManager?.isRacerKnockedOut(bot.kart.id)) {
          bot.kart.applyInput(0, 0, false, dt, this.physics);
        } else if (isBotFinished) {
          // Finished racer: cut throttle & nitro, coast/brake smoothly to a complete stop past finish line
          bot.kart.boostTime = 0;
          bot.kart.applyInput(0, 0, false, dt, this.physics);
          const curLv = bot.kart.rigidBody.linvel();
          const damp = Math.max(0, 1.0 - dt * 2.5);
          bot.kart.rigidBody.setLinvel({ x: curLv.x * damp, y: curLv.y, z: curLv.z * damp }, true);
        } else {
          bot.update(dt, this.physics, this.allKarts);
        }
        if (!this.isRumbleMode && !isBotFinished) {
          this.checkpoints.update(
            bot.kart.id,
            bot.kart.group.position,
            bot.kart.group.quaternion,
            dt,
            (pos, rot) => {
              bot.kart.resetTo(pos, rot, this.physics);
              bot.onRespawn(pos, rot);
            },
            bot.kart.isGrounded,
            bot.kart.airLaunchTimer > 0
          );
        }
      }

      // 2c-2. Update Rumble Manager in Arena mode
      if (this.isRumbleMode && this.rumbleManager) {
        this.rumbleManager.update(dt);
        let spectatedId: string | undefined;
        if (this.isSpectating) {
          const spectatables = this.getSpectatableKarts();
          if (spectatables.length > 0) {
            spectatedId = spectatables[this.spectatedTargetIdx % spectatables.length]?.id;
          }
        }
        this.hud.updateRumbleHud(this.rumbleManager, this.player.kart, spectatedId);

        // Host Periodic 1.0s Score Heartbeat to prevent ANY desync across all 8 players
        if (this.isMultiplayer && net.isHost) {
          this.rumbleScoreSyncTimer += dt;
          if (this.rumbleScoreSyncTimer >= 1.0) {
            this.rumbleScoreSyncTimer = 0;
            net.broadcastRumbleScoreSync(
              this.rumbleManager.frostScore,
              this.rumbleManager.blazeScore,
              this.rumbleManager.getRacerScoresArray()
            );
          }
        }
      }

      // 2d. Continuous Combat Collision Check
      if (!this.isNoCollisionMode) {
        for (let i = 0; i < this.allKarts.length; i++) {
          for (let j = i + 1; j < this.allKarts.length; j++) {
            const kA = this.allKarts[i];
            const kB = this.allKarts[j];

            if (this.isRumbleMode && this.rumbleManager) {
              // Ignore karts that have fallen below the arena deck
              if (kA.group.position.y < -3.0 || kB.group.position.y < -3.0) continue;
              const distSq = kA.group.position.distanceToSquared(kB.group.position);
              // Max oriented bounding diagonal extent across two karts is ~3.2m -> distSq ~ 11.5
              if (distSq < 11.5) {
                // Continuous 60fps solid separation, velocity deflection & fair combat resolution
                resolveRumbleCombat(
                  kA,
                  kB,
                  this.sparks,
                  this.player.kart,
                  this.rumbleManager,
                  (msg, type) => this.hud.showAlert(msg, type as any),
                  (intensity) => this.player.triggerImpactShake(intensity),
                  this.handleRumbleRemoteHit,
                  this.getRumbleKartVelocity,
                  this.isRemoteKart
                );
              }
            } else {
              // Classic Circuit / Hardcore Racing Mode (Solid Rigid-Body Bump)
              if (kA.isGhost || kB.isGhost) continue;
              const distSq = kA.group.position.distanceToSquared(kB.group.position);
              if (distSq < 7.2) {
                this.handleKartSmash(kA, kB);
              }
            }
          }
        }
      }

      // 3. Update Remote Peer Racers (No AFK kick - players only leave on explicit tab close or LEAVE click)
      for (const remote of this.remoteRacers.values()) {
        const k = remote.kart;

        if (remote.isSmashed) {
          remote.smashTimer -= dt;
          // TOP-LEVEL EXIT: only the full 3.5s safety timeout.
          // Natural landing (local Y hits arenaFloorY) is handled INSIDE the flight block below —
          // that's where blendFromPosition is also called with the correct floor-level Y.
          // Removing any early "victimHasLanded" check here because if victim lands on their phone
          // while our local pseudo-physics still has them at Y=8-10m, an early exit would cause
          // blendFromPosition to bridge a huge Y gap → the sudden "yanked to ground" feeling.
          // Ghost/shield state is NOT set here — driven by victim's own kart_transform isGhost field.
          if (remote.smashTimer <= 0) {
            remote.isSmashed = false;
            remote.interpolator.blendFromPosition(k.group.position);
          } else {
            // Gravity: exact match to Rapier world gravity (-28.0 m/s²)
            remote.launchVelocity.y -= 28.0 * dt;

            // Horizontal drag: exactly matches Rapier rigidBody linearDamping = 0.32
            // Formula: vel *= (1 - damping * dt), same as Rapier's internal integration
            const horizDamp = Math.max(0, 1.0 - dt * 0.32);
            remote.launchVelocity.x *= horizDamp;
            remote.launchVelocity.z *= horizDamp;

            k.group.position.addScaledVector(remote.launchVelocity, dt);

            // NOTE: XZ predictive convergence is intentionally REMOVED.
            // targetPos.xz is now frozen during isSmashed (see handleRemoteTransform).
            // The pseudo-physics arc naturally matches Rapier since gravity + drag now match exactly.
            // No invisible sideways pull = no "block substance in air" feeling!

            // Quaternion-based 3D stunt tumble (eliminates Euler wrapping / gimbal lock glitches)
            _scratchTumbleEuler.set(
              remote.tumbleAngularVel.x * dt,
              remote.tumbleAngularVel.y * dt,
              remote.tumbleAngularVel.z * dt,
              'YXZ'
            );
            _scratchTumbleQuat.setFromEuler(_scratchTumbleEuler);
            k.group.quaternion.multiply(_scratchTumbleQuat).normalize();
            remote.tumbleAngularVel.multiplyScalar(Math.max(0, 1.0 - dt * 0.45)); // Air drag

            // Dynamic floor elevation & upright recovery
            if (remote.launchVelocity.y < 0) {
              // Upright target quaternion (keeps horizontal yaw heading, levels pitch & roll to 0)
              const fwd = _scratchForward.set(0, 0, 1).applyQuaternion(k.group.quaternion);
              fwd.y = 0;
              if (fwd.lengthSq() > 0.001) fwd.normalize();
              const yawAngle = Math.atan2(fwd.x, fwd.z);
              _scratchUprightQuat.setFromAxisAngle(_scratchAxisY, yawAngle);

              if (this.isRumbleMode) {
                // In Sky Rumble coliseum: compute exact arena floor elevation
                const dCenter = Math.hypot(k.group.position.x, k.group.position.z);
                let arenaFloorY = 0.0;
                if (dCenter <= 11.5) {
                  arenaFloorY = 0.35;
                } else if (dCenter < 16.8) {
                  const t = (16.8 - dCenter) / (16.8 - 11.5);
                  arenaFloorY = 0.35 * (t * t * (3 - 2 * t));
                } else {
                  arenaFloorY = 0.0;
                }

                // If inside the arena coliseum (radius < 96.0m)
                if (dCenter < 96.0) {
                  // As kart descends near deck, smoothly slerp upright towards horizontal
                  const distToFloor = k.group.position.y - arenaFloorY;
                  if (distToFloor < 2.5) {
                    k.group.quaternion.slerp(_scratchUprightQuat, Math.min(1.0, dt * 14.0));
                  }

                  // Touchdown: land rock-solid on arena floor (or early sync when victim reports landed)
                  const victimGroundedOnDeck = (
                    remote.smashTimer < 3.1 &&
                    remote.targetPos.y <= (arenaFloorY + 0.25) &&
                    remote.targetPos.y >= (arenaFloorY - 0.25)
                  );
                  if (k.group.position.y <= arenaFloorY || victimGroundedOnDeck) {
                    k.group.position.y = arenaFloorY;
                    remote.launchVelocity.y = 0;
                    remote.isSmashed = false;
                    k.group.quaternion.copy(_scratchUprightQuat);
                    remote.interpolator.blendFromPosition(k.group.position);
                  }
                }
                // If dCenter >= 96.0, kart is outside arena perimeter: continues falling freely into the abyss!
              } else {
                // Classic Circuit mode: project onto track surface elevation
                const t = this.track.getClosestT(k.group.position);
                const slice = this.track.getTrackSlice(t);
                if (!slice.isGap) {
                  const dCenter = Math.hypot(k.group.position.x - slice.position.x, k.group.position.z - slice.position.z);
                  if (dCenter <= slice.halfWidth + 3.0) {
                    const distToFloor = k.group.position.y - slice.position.y;
                    if (distToFloor < 2.5) {
                      k.group.quaternion.slerp(_scratchUprightQuat, Math.min(1.0, dt * 14.0));
                    }
                    if (k.group.position.y <= slice.position.y) {
                      k.group.position.y = slice.position.y;
                      remote.launchVelocity.y = 0;
                      remote.isSmashed = false;
                      k.group.quaternion.copy(_scratchUprightQuat);
                      remote.interpolator.blendFromPosition(k.group.position);
                    }
                  }
                }
              }
            }
          }

          k.rigidBody.setTranslation({ x: k.group.position.x, y: k.group.position.y, z: k.group.position.z }, false);
          k.rigidBody.setRotation({ x: k.group.quaternion.x, y: k.group.quaternion.y, z: k.group.quaternion.z, w: k.group.quaternion.w }, false);
          k.rigidBody.setLinvel({ x: remote.launchVelocity.x, y: remote.launchVelocity.y, z: remote.launchVelocity.z }, false);
        } else {
          // Smooth snapshot interpolation with Hermite cubic spline & projective dead reckoning
          remote.interpolator.update(dt, k.group.position, k.group.quaternion);

          k.rigidBody.setTranslation({ x: k.group.position.x, y: k.group.position.y, z: k.group.position.z }, false);
          k.rigidBody.setRotation({ x: k.group.quaternion.x, y: k.group.quaternion.y, z: k.group.quaternion.z, w: k.group.quaternion.w }, false);

          const fwd = _scratchForward.set(0, 0, 1).applyQuaternion(k.group.quaternion);
          const spd = remote.interpolator.currentSpeed;
          k.rigidBody.setLinvel({ x: fwd.x * spd, y: 0, z: fwd.z * spd }, false);
        }

        // Update wheel spin and steering using smooth interpolator states
        k.currentSpeed = remote.interpolator.currentSpeed;
        const isBoosting = remote.interpolator.isBoosting;
        k.boostTime = isBoosting ? 0.5 : 0;
        k.isDrifting = remote.interpolator.isDrifting;
        k.isGrounded = !remote.isSmashed;
        if (isBoosting) {
          for (let i = 0; i < k.flames.length; i++) {
            k.flames[i].scale.set(1.0, 1.0, 2.2);
          }
        } else if (k.flames.length > 0 && k.flames[0].scale.x > 0.002) {
          for (let i = 0; i < k.flames.length; i++) {
            k.flames[i].scale.set(0.001, 0.001, 0.001);
          }
        }
        k.steerAngle = THREE.MathUtils.lerp(k.steerAngle, remote.interpolator.currentSteer * 0.45, dt * 12);
        const spinDelta = (k.currentSpeed * dt) / 0.42;
        k.wheels.forEach((wheel, idx) => {
          wheel.rotation.x += spinDelta;
          if (idx < 2) {
            wheel.parent!.rotation.y = -k.steerAngle;
          }
        });
        if (k.driverGroup) {
          k.driverGroup.rotation.z = THREE.MathUtils.lerp(k.driverGroup.rotation.z, -k.steerAngle * 0.38, dt * 10);
          k.driverGroup.rotation.y = THREE.MathUtils.lerp(k.driverGroup.rotation.y, k.steerAngle * 0.28, dt * 10);
        }
        if (k.steeringWheel) {
          k.steeringWheel.rotation.z = -k.steerAngle * 2.2;
        }

        // Track remote racer circuit progress ONLY in circuit modes (saves 7x 60fps spline searches in Rumble Arena)
        if (!this.isRumbleMode) {
          this.checkpoints.updateRemoteProgress(k.id, k.group.position);
        }
      }

      // 4. Check Boost Pads & Canyon Jump Launchers
      for (const pad of this.track.boostPads) {
        for (const kart of this.allKarts) {
          const triggerDist = 4.2;
          if (kart.group.position.distanceTo(pad.position) < triggerDist) {
            if (pad.isRampPad) {
              kart.applyBoost(2.0, 1.8);
              if (kart === this.player.kart) {
                sounds.playBoost();
              }
            } else {
              // Standard flat track & runway sprint boost pad
              kart.applyBoost(1.5, 1.6);
              if (kart === this.player.kart) {
                sounds.playBoost();
              }
            }
          }
        }
      }

      // 4b. Check Mini Kicker Ramps (Airborne Hops & Mini-Surge)
      for (const ramp of this.track.kickerRamps) {
        for (const kart of this.allKarts) {
          if (kart.airLaunchTimer > 0) continue;
          const dist = kart.group.position.distanceTo(ramp.position);
          if (dist < ramp.triggerRadius && kart.isGrounded) {
            _kickerHopVel.set(ramp.forward.x * 22.0, 10.5, ramp.forward.z * 22.0);
            kart.launchIntoAir(_kickerHopVel, true);
            kart.applyBoost(1.1, 1.3);

            if (kart === this.player.kart) {
              sounds.playBoost();
            }
          }
        }
      }

      // 4c. Check Road Hazard Blocks (Unbreakable Solid Rigid Barriers)
      for (const block of this.track.hazardBlocks) {
        for (const kart of this.allKarts) {
          // PRODUCTION FIX: AI Bots ignore hazard block collisions so they never get stuck on track barriers!
          if (kart.isBot || this.bots.some((b) => b.kart === kart)) continue;

          _scratchToBlock.subVectors(kart.group.position, block.position);

          // Fast vertical height check
          if (Math.abs(_scratchToBlock.y) > 2.5) continue;

          // Project onto block's lateral (width) and longitudinal (depth) axes
          const localLat = _scratchToBlock.dot(block.binormal); // Along 3.2m width
          const localLong = _scratchToBlock.dot(block.tangent);  // Along 1.2m depth

          // Half-extents: block (1.65m wide, 0.65m deep) + kart collision padding (0.95m wide, 1.55m long)
          const maxLat = block.halfWidth + 0.95;   // 2.60m
          const maxLong = block.halfDepth + 1.55;  // 2.20m

          const isOverlapping = Math.abs(localLat) < maxLat && Math.abs(localLong) < maxLong;

          if (isOverlapping) {
            // Determine rebound normal (which face of the block was struck)
            const overlapX = maxLat - Math.abs(localLat);
            const overlapZ = maxLong - Math.abs(localLong);

            if (overlapZ <= overlapX) {
              const signZ = localLong >= 0 ? 1 : -1;
              _scratchReboundDir.copy(block.tangent).multiplyScalar(signZ);
            } else {
              const signX = localLat >= 0 ? 1 : -1;
              _scratchReboundDir.copy(block.binormal).multiplyScalar(signX);
            }
            _scratchReboundDir.y = 0;
            _scratchReboundDir.normalize();

            // CONTINUOUS HARD PUSHBACK EVERY FRAME: Never allows car to penetrate or pass through!
            const pushDist = Math.max(0.75, Math.min(overlapX, overlapZ) + 0.35);
            kart.group.position.addScaledVector(_scratchReboundDir, pushDist);
            kart.rigidBody.setTranslation({
              x: kart.group.position.x,
              y: kart.group.position.y,
              z: kart.group.position.z,
            }, true);

            // Kill all forward velocity heading into the barrier
            const curLv = kart.rigidBody.linvel();
            const dotIntoBarrier = -(curLv.x * _scratchReboundDir.x + curLv.z * _scratchReboundDir.z);
            if (dotIntoBarrier > 0) {
              kart.rigidBody.setLinvel({
                x: curLv.x + _scratchReboundDir.x * dotIntoBarrier,
                y: curLv.y,
                z: curLv.z + _scratchReboundDir.z * dotIntoBarrier,
              }, true);
            }

            // High-energy impact air launch event (with cooldown for audio/FX)
            const now = performance.now();
            if (now - kart.lastImpactTime > 320) {
              kart.lastImpactTime = now;

              const incomingSpeed = Math.hypot(curLv.x, curLv.z);
              const boostBonus = (kart.boostTime > 0) ? 1.65 : 1.0;
              const impactPower = (incomingSpeed + 10.0) * boostBonus;

              const horizRebound = Math.min(20.0, 8.0 + impactPower * 0.5);
              const upwardLaunch = 1.2; // Stays grounded on tarmac

              _hazardLaunchVel.set(
                _scratchReboundDir.x * horizRebound,
                upwardLaunch,
                _scratchReboundDir.z * horizRebound
              );

              // Solid horizontal rebound
              kart.launchIntoAir(_hazardLaunchVel, false);

              if (kart === this.player.kart) {
                this.player.triggerImpactShake(2.5);
              }
            }
          }
        }
      }

      // 4c-2. Check Stadium Boulders in Rumble Arena (Unbreakable Solid Rocks)
      if (this.track && this.track.boulders) {
        for (const boulder of this.track.boulders) {
          for (const kart of this.allKarts) {
            const kPos = kart.group.position;
            const dx = kPos.x - boulder.position.x;
            const dz = kPos.z - boulder.position.z;
            const dist = Math.hypot(dx, dz);
            const solidRadius = boulder.radius + 1.1; // Total radius with bumper padding (~3.9m)

            if (dist < solidRadius && Math.abs(kPos.y - boulder.position.y) < 6.8) {
              const nx = dist > 0.001 ? dx / dist : 1;
              const nz = dist > 0.001 ? dz / dist : 0;

              // HARD PUSHBACK: Never allow car to penetrate or pass through the boulder!
              const pushX = boulder.position.x + nx * solidRadius;
              const pushZ = boulder.position.z + nz * solidRadius;
              kart.group.position.x = pushX;
              kart.group.position.z = pushZ;
              kart.rigidBody.setTranslation({ x: pushX, y: kPos.y, z: pushZ }, true);

              // Velocity reflection / rebound
              const curLv = kart.rigidBody.linvel();
              const velIntoRock = -(curLv.x * nx + curLv.z * nz);
              if (velIntoRock > 0) {
                const bounceRestitution = 0.65;
                kart.rigidBody.setLinvel({
                  x: curLv.x + (1.0 + bounceRestitution) * velIntoRock * nx,
                  y: Math.max(0.5, curLv.y),
                  z: curLv.z + (1.0 + bounceRestitution) * velIntoRock * nz,
                }, true);
              }

              // Visual sparks & camera shake with cooldown (ZERO crash audio on rocks/barriers)
              const now = performance.now();
              const lastHit = boulder.lastHitTimes.get(kart.id) || 0;
              if (now - lastHit > 280) {
                boulder.lastHitTimes.set(kart.id, now);
                const isPlayer = kart === this.player.kart;
                if (isPlayer) {
                  this.player.triggerImpactShake(1.5);
                }
              }
            }
          }
        }
      }

      // 4d. Kinetic Dynamic Hazards (Giant Sky Turbine, Wrecking Pendulum, Mud Slip Zone)
      if (this.track.kineticHazards) {
        this.track.kineticHazards.update(
          dt,
          this.allKarts,
          this.sparks
        );
      }

      // 4e. Cyber Jump Rings Check (Center Dive vs Solid Rim Collision)
      for (const ring of this.track.cyberRings) {
        for (const kart of this.allKarts) {
          _crToKart.subVectors(kart.group.position, ring.position);
          const distLong = _crToKart.dot(ring.tangent); // Plane distance

          // Within ring thickness corridor (depth along tangent)
          if (Math.abs(distLong) < 2.0) {
            const lat = _crToKart.dot(ring.binormal);
            const vert = _crToKart.dot(ring.normal);
            const radialDist = Math.hypot(lat, vert);

            // 1. Center Dive: inside ring hole (smooth pass through, ZERO vibration!)
            if (radialDist < (ring.radius - 0.9)) {
              // Smooth pass through the center - no vibration, no camera shaking!
            } else if (Math.abs(radialDist - ring.radius) <= (ring.rimThickness + 0.8)) {
              // 2. Solid Rim Collision
              const now = performance.now();
              const lastHit = ring.lastHitTimes.get(kart.id) || 0;
              if (now - lastHit > 600) {
                ring.lastHitTimes.set(kart.id, now);

                // Radial direction pointing outward from ring center
                _crRadDir.copy(ring.binormal).multiplyScalar(lat).addScaledVector(ring.normal, vert).normalize();
                const deflectSpeed = 16.0;
                // Deflect outward from ring rim + push back along -tangent + upward
                _crLaunchVel.copy(_crRadDir).multiplyScalar(deflectSpeed)
                  .addScaledVector(ring.tangent, -12.0);
                _crLaunchVel.y += 6.0;

                kart.launchIntoAir(_crLaunchVel, false);

                if (kart === this.player.kart) {
                  this.player.triggerImpactShake(1.2);
                }
              }
            }
          }
        }
      }

      // 4f. Update Persistent Skidmarks & Grounded Drift sparks along asphalt
      this.skidmarks.update(dt);

      for (const kart of this.allKarts) {
        if (kart.isDrifting && kart.isGrounded) {
          const kPos = kart.group.position;
          const kRot = kart.group.quaternion;
          _driftUpNorm.set(0, 1, 0).applyQuaternion(kRot);

          // Persistent Rubber Tire Skidmarks on Road Asphalt Surface
          _skidPosL.set(-0.95, 0.02, -1.05).applyQuaternion(kRot).add(kPos);
          _skidPosR.set(0.95, 0.02, -1.05).applyQuaternion(kRot).add(kPos);
          this.skidmarks.addSkidPoint(kart.wheelIdL, _skidPosL, _driftUpNorm, 1.0);
          this.skidmarks.addSkidPoint(kart.wheelIdR, _skidPosR, _driftUpNorm, 1.0);
        } else {
          this.skidmarks.breakWheel(kart.wheelIdL);
          this.skidmarks.breakWheel(kart.wheelIdR);
        }
      }

      // 5. Update HUD Status
      let displaySpeedKmh = this.player.getSpeedKmh();
      let displayNitroFraction = Math.min(1.0, this.player.kart.boostTime / 1.5);
      let displayNitroCharges = this.player.kart.nitroCharges;
      let displayRank = 1;
      let displayLap = 1;

      if (!this.isRumbleMode) {
        displayRank = this.checkpoints.getPlayerRank();
        const playerProgress = this.checkpoints.racers.get(this.player.kart.id)!;
        displayLap = playerProgress.lap;

        let spectatedId: string | undefined;
        if (this.isSpectating) {
          const spectatables = this.getSpectatableKarts();
          if (spectatables.length > 0) {
            const target = spectatables[this.spectatedTargetIdx % spectatables.length];
            spectatedId = target?.id;
            if (target?.kart) {
              displaySpeedKmh = target.kart.getSpeedKmh();
              displayNitroFraction = Math.min(1.0, target.kart.boostTime / 1.5);
              displayNitroCharges = target.kart.nitroCharges;
            }
            if (target?.id) {
              const spectatedProg = this.checkpoints.racers.get(target.id);
              if (spectatedProg) {
                displayRank = this.checkpoints.getRacerRank(target.id);
                displayLap = spectatedProg.lap;
              }
            }
          }
        }

        this.hud.updateStatus(
          displayRank,
          displayLap,
          this.checkpoints.totalLaps,
          this.raceTimer,
          displaySpeedKmh,
          displayNitroFraction,
          displayNitroCharges
        );

        // 5b. Update Live Standings & Laps Card
        const standings = this.checkpoints.getStandings();
        this.hud.updateLiveStandings(standings, this.checkpoints.totalLaps, spectatedId);

        // 5c. Real-Time Wrong-Way Reverse Driving Alert
        if (this.isSpectating || this.isPlayerFinished) {
          this.hud.showWrongWay(false);
        } else {
          const currentGate = this.checkpoints.gates[playerProgress.currentCheckpoint];
          if (currentGate) {
            const forward = _wrongWayFwd.set(0, 0, 1).applyQuaternion(this.player.kart.group.quaternion);
            // Project onto XZ plane to prevent false positives when pitching up slopes
            const forwardH = _wrongWayFwdH.set(forward.x, 0, forward.z).normalize();
            const gateForwardH = _wrongWayGateH.set(currentGate.forward.x, 0, currentGate.forward.z).normalize();
            const alignment = forwardH.dot(gateForwardH);

            if (alignment < -0.45 && Math.abs(displaySpeedKmh) > 6) {
              this.wrongWayTimer += dt;
              if (this.wrongWayTimer > 0.55) {
                this.hud.showWrongWay(true);
              }
            } else {
              this.wrongWayTimer = Math.max(0, this.wrongWayTimer - dt * 3.0);
              if (this.wrongWayTimer === 0) {
                this.hud.showWrongWay(false);
              }
            }
          } else {
            this.hud.showWrongWay(false);
          }
        }
      } else {
        // Sky Rumble Mode: Arena score and match timer are updated by rumbleManager.
        // Speedometer updated smoothly with spectated or player speed
        if (this.isSpectating) {
          const spectatables = this.getSpectatableKarts();
          if (spectatables.length > 0) {
            const target = spectatables[this.spectatedTargetIdx % spectatables.length];
            if (target?.kart) {
              displaySpeedKmh = target.kart.getSpeedKmh();
            }
          }
        }
        this.hud.updateSpeed(displaySpeedKmh);
        this.hud.showWrongWay(false);
      }

      // 6. Draw Minimap with all other racers
      _minimapOtherKarts.length = 0;
      for (let i = 0; i < this.allKarts.length; i++) {
        if (this.allKarts[i] !== this.player.kart) {
          _minimapOtherKarts.push(this.allKarts[i]);
        }
      }
      this.hud.drawMinimap(this.track, this.player.kart, _minimapOtherKarts);

      // 7. Finish Countdown Timer & End of Race (Classic & Hardcore only)
      if (!this.isRumbleMode && this.finishCountdownActive) {
        this.finishCountdownTimer -= dt;
        this.hud.showFinishCountdown(this.finishCountdownTimer);

        // Check if all registered racers have completed their laps
        const allFinished = Array.from(this.checkpoints.racers.values()).every(
          (r) => r.finishTime !== null
        );

        if (this.finishCountdownTimer <= 0 || allFinished) {
          this.endRace();
          return;
        }
      }

      // 7b. Sky Rumble Outro Celebration Timer (3 Seconds before Finalizing Scoreboard)
      if (this.isRumbleMode && this.isRumbleOutroActive) {
        this.rumbleOutroTimer -= dt;
        if (this.rumbleOutroTimer <= 0) {
          this.finalizeRumbleMatch();
          return;
        }
      }
    }

    // Update Tactical Nitro Speedlines (STRICTLY active when player kart has active boostTime > 0)
    const isNitroActive = this.state === GameState.RACING && !!this.player && !!this.player.kart && this.player.kart.boostTime > 0;
    speedlines.update(dt, isNitroActive);
  }
}

// Bootstrap game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.init().catch((err) => {
    console.error('[Game Init Failure]', err);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  });
});

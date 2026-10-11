/**
 * ============================================================================
 * AIRSKIDO RACING // BOT KART CONFIGURATION & TUNING SYSTEM (BotKartSettings.ts)
 * ============================================================================
 * Centralized control panel for AI Bot behavior, difficulty curves, cosmetics,
 * and authentic racer identities. Tune values here to adjust bot strength!
 */

export interface ArenaDifficultyConfig {
  /** Maximum player level considered a 'Beginner / Newbie' */
  maxLevel: number;
  /** Steering responsiveness multiplier (higher = sharper, more robotic) */
  steeringGain: number;
  /** Maximum forward throttle (0.0 to 1.0) */
  maxThrottle: number;
  /** Intercept prediction lead factor (0.0 = direct chase, 0.35 = predictive aimbot) */
  predictiveLeadFactor: number;
  /** Throttle reduction during sharp combat turns (gives human room to out-drift) */
  sharpTurnBrakeRatio: number;
  /** Minimum interval in seconds between target retargeting */
  retargetInterval: number;
  /** Maximum number of bots that can target the human player in Solo FFA (Anti-Swarm) */
  maxBotsTargetingPlayerFFA: number;
  /** Maximum number of enemy bots that can target the human player in TDM (Anti-Swarm) */
  maxBotsTargetingPlayerTDM: number;
}

export const BOT_CONFIG = {
  // ── 1. DIFFICULTY CURVES & LEVEL SCALING ──────────────────────────────────
  DIFFICULTY: {
    /** Cutoff level for Beginner Tier (Disabled - all bots run full competitive arcade intensity) */
    NEWBIE_CUTOFF_LEVEL: 0,

    /** Default Competitive Tier for all bots across all levels (Fast, responsive, natural aggression) */
    VETERAN_TIER: {
      maxLevel: 999,
      steeringGain: 1.80,           // Sharp, aggressive snap-to-target steering
      maxThrottle: 1.0,             // 100% full throttle
      predictiveLeadFactor: 0.35,   // Intercepts ahead of moving targets
      sharpTurnBrakeRatio: 0.0,     // Never brakes on turns
      retargetInterval: 0.0,        // Frame-by-frame 60Hz dynamic retargeting
      maxBotsTargetingPlayerFFA: 5, // Unrestricted competitive AI - natural aggression towards player!
      maxBotsTargetingPlayerTDM: 3, // Unrestricted competitive AI - natural aggression towards player!
    } as ArenaDifficultyConfig,

    BEGINNER_TIER: {
      maxLevel: 999,
      steeringGain: 1.80,
      maxThrottle: 1.0,
      predictiveLeadFactor: 0.35,
      sharpTurnBrakeRatio: 0.0,
      retargetInterval: 0.0,
      maxBotsTargetingPlayerFFA: 5,
      maxBotsTargetingPlayerTDM: 3,
    } as ArenaDifficultyConfig,
  },

  // ── 2. TRACK RACING BOT SETTINGS ──────────────────────────────────────────
  TRACK: {
    /** Nitro cooldown for bots in track races (seconds) */
    nitroCooldownMin: 6.0,
    nitroCooldownMax: 9.0,
    /** Base top speed safety threshold for hairpins */
    hairpinSafeSpeed: 22.0,
    gentleTurnSafeSpeed: 30.0,
    straightSafeSpeed: 46.0,
  },

  // ── 3. AUTHENTIC ONLINE RACER GAMERTAGS (60 DIVERSE COMPETITIVE NAMES) ─────
  AUTHENTIC_NAMES: [
    'ViperX',
    'ShadowRacer',
    'Kitsune99',
    'GhostDrifter',
    'NovaStorm',
    'VoltRunner',
    'HyperSpeed',
    'Zenith',
    'PhantomRider',
    'BlazeRider',
    'TurboMax',
    'PulseWave',
    'SkyDrift',
    'Thunderbolt',
    'FrostByte',
    'ZeroGravity',
    'AeroClaw',
    'PixelRacer',
    'NightRider',
    'Eclipse9',
    'TitanApex',
    'RazorDrift',
    'StormChaser',
    'BlazeNova',
    'NeonSurge',
    'SonicDrift',
    'CarbonKnight',
    'AeroViper',
    'TurboFang',
    'VelocityPro',
    'ApexPredator',
    'CrimsonFlash',
    'MidnightAce',
    'VortexRacer',
    'DriftSamurai',
    'Specter99',
    'NitroBlaster',
    'QuantumShift',
    'SolarFlare',
    'IronClaw',
    'HyperNova',
    'RuneRacer',
    'CyberPhantom',
    'WildFire7',
    'EchoDrift',
    'ShadowPulse',
    'AeroBlaster',
    'VenomRider',
    'CosmicApex',
    'ThunderClaw',
    'TurboKitsune',
    'FrostPhoenix',
    'BlazeVortex',
    'RazorFang',
    'NitroTitan',
    'VelocityZen',
    'OnyxRacer',
    'SkySurge',
    'NeonPhantom',
    'MatrixDrift',
  ],

  // Themed Names for Team Sky Rumble (16 Frost + 16 Blaze)
  FROST_NAMES: [
    'FrostByte',
    'GlacierAce',
    'FrostNova',
    'ArcticStorm',
    'GlacierClaw',
    'IceViper',
    'BlizzardKing',
    'PolarApex',
    'CryoDrifter',
    'SubZero99',
    'FrostPhoenix',
    'TundraRacer',
    'AvalanchePro',
    'FrostRider',
    'CrystalDrift',
    'IceKnight',
  ],
  BLAZE_NAMES: [
    'BlazeTitan',
    'InfernoViper',
    'DoomBlaze',
    'BlazeFury',
    'InfernoMax',
    'SolarFlare',
    'PyroRider',
    'LavaDrifter',
    'FlameStrike',
    'CinderKnight',
    'WildFire7',
    'BlazeNova',
    'MagmaApex',
    'IgnitePro',
    'CrimsonBlaze',
    'VolcanoFang',
  ],

  // ── 4. BOT COSMETICS & WARDROBE CATALOG ───────────────────────────────────
  COSMETICS: {
    SKINS: [
      'paint_cyan',
      'paint_gold',
      'paint_purple',
      'paint_white',
      'skin_neon_cyber',
      'skin_lava',
      'skin_stealth',
      'skin_arcadia',
      'skin_gold',
    ],
    HATS: [
      'hat_cowboy',
      'hat_party',
      'hat_crown',
      'hat_police',
      'hat_cat_ears',
      'hat_cyber_horns',
      'hat_tophat',
      'hat_beanie',
      'hat_propeller',
      'hat_pirate',
      'hat_viking',
      'hat_none',
    ],
    GLASSES: [
      'glasses_speed_matrix',
      'glasses_thug_life',
      'glasses_retro_3d',
      'glasses_top_gun',
      'glasses_cyber_visor',
      'glasses_star_party',
      'glasses_none',
    ],
  },
};

/**
 * Checks whether a given callsign is an official bot name (case-insensitive).
 * Used by NameSystem to prevent human players from claiming bot names.
 */
export function isBotReservedName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (BOT_CONFIG.AUTHENTIC_NAMES.some((n) => n.toLowerCase() === lower)) return true;
  if (BOT_CONFIG.FROST_NAMES.some((n) => n.toLowerCase() === lower)) return true;
  if (BOT_CONFIG.BLAZE_NAMES.some((n) => n.toLowerCase() === lower)) return true;
  return false;
}

/**
 * Returns a list of unique themed bot names for Team Deathmatch (TDM).
 * Guarantees no duplicate names within the match and excludes player's name.
 */
export function pickTeamBotNames(team: 'frost' | 'blaze', count: number, usedNames?: string[]): string[] {
  const sourcePool = team === 'frost' ? BOT_CONFIG.FROST_NAMES : BOT_CONFIG.BLAZE_NAMES;
  const available = sourcePool.filter((n) => {
    const lower = n.toLowerCase();
    return !usedNames?.some((u) => u.toLowerCase() === lower);
  });
  const pool = available.length >= count ? available : [...sourcePool];

  // Fisher-Yates shuffle
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const result: string[] = [];
  for (const name of shuffled) {
    if (result.length >= count) break;
    const lower = name.toLowerCase();
    if (!usedNames?.some((u) => u.toLowerCase() === lower) && !result.some((r) => r.toLowerCase() === lower)) {
      result.push(name);
    }
  }

  // Safe fallback if count not satisfied
  while (result.length < count) {
    const prefix = team === 'frost' ? 'Frost' : 'Blaze';
    const fallback = `${prefix}${Math.floor(10 + Math.random() * 90)}`;
    if (!result.includes(fallback)) result.push(fallback);
  }

  return result;
}

/**
 * Returns standard competitive bot difficulty configuration for all players.
 * Beginner handicap removed: all bots now run at full speed, sharp steering & natural aggression.
 */
export function getBotDifficulty(_playerLevel: number = 999): ArenaDifficultyConfig {
  return BOT_CONFIG.DIFFICULTY.VETERAN_TIER;
}

/**
 * Generates an authentic bot racer profile with unique kart, skin, hat, glasses, and randomized name.
 * - Filters out player's name and any already assigned names (case-insensitive).
 * - Shuffles/picks randomly so match opponents are dynamic every game.
 * - Excludes player's currently equipped skin so bots never clone the player!
 */
export function generateBotProfile(index: number, playerSkin?: string, usedNames?: string[]): {
  name: string;
  kartType: number;
  skinId: string;
  hatId: string;
  glassesId: string;
} {
  // 1. Pick authentic name (randomized from available pool, never matching human player or peers)
  const availableNames = BOT_CONFIG.AUTHENTIC_NAMES.filter((n) => {
    const lower = n.toLowerCase();
    return !usedNames?.some((u) => u.toLowerCase() === lower);
  });
  const pool = availableNames.length > 0 ? availableNames : BOT_CONFIG.AUTHENTIC_NAMES;
  const randNameIdx = Math.floor(Math.random() * pool.length);
  const name = pool[randNameIdx];

  // 2. Pick distinct kart chassis (0 to 3) with dynamic offset
  const kartType = (index + Math.floor(Math.random() * 4)) % 4;

  // 3. Filter skins to guarantee bot NEVER clones the player
  const eligibleSkins = BOT_CONFIG.COSMETICS.SKINS.filter((s) => s !== playerSkin);
  const skinId = eligibleSkins[Math.floor(Math.random() * eligibleSkins.length)] || 'paint_cyan';

  // 4. Pick distinct hat
  const hatId = BOT_CONFIG.COSMETICS.HATS[Math.floor(Math.random() * BOT_CONFIG.COSMETICS.HATS.length)];

  // 5. Pick distinct glasses
  const glassesId = BOT_CONFIG.COSMETICS.GLASSES[Math.floor(Math.random() * BOT_CONFIG.COSMETICS.GLASSES.length)];

  return { name, kartType, skinId, hatId, glassesId };
}

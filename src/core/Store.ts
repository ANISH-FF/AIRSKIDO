import { economy } from './Economy';
import { sounds } from './Sound';
import { adsManager } from './AdsManager';
import { ENABLE_VIP_AND_ADS } from './GameConfig';

export { ENABLE_VIP_AND_ADS };

export interface StoreItem {
  id: string;
  name: string;
  category: 'vip' | 'skin' | 'hat' | 'currency' | 'glasses';
  price: number;
  currency: 'coins' | 'gems' | 'ad';
  requiredLevel?: number;
  badge?: string;
  icon: string;
  description: string;
  previewColor?: number;
}

export const STORE_CATALOG: StoreItem[] = [
  // 1. VIP CROWN PASS SECTION (Controlled by ENABLE_VIP_AND_ADS)
  {
    id: 'vip_ad_15m',
    name: '15-MIN VIP TRIAL',
    category: 'vip',
    price: 0,
    currency: 'ad',
    badge: 'FREE TRIAL',
    icon: '⚡',
    description: 'Watch a quick 6s sponsor ad to get 15 Minutes of VIP Gold Crown + 1.5x Coins & XP!',
  },
  {
    id: 'vip_permanent',
    name: 'ROYAL VIP PASS',
    category: 'vip',
    price: 150,
    currency: 'gems',
    badge: 'LIFETIME',
    icon: 'VIP',
    description: 'Permanent VIP status! Golden name tag, Royal Crown symbol in races & leaderboards, +50% Coins & XP forever!',
  },

  // ── 2A. FACTORY STOCK RACING PAINTS (FREE - MATCHING DRIVER) ──
  {
    id: 'skin_default',
    name: 'CRIMSON APEX',
    category: 'skin',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '🔴',
    description: 'Crimson livery with aerodynamic white racing stripes.',
    previewColor: 0xff2244,
  },
  {
    id: 'paint_cyan',
    name: 'ELECTRIC CYAN',
    category: 'skin',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '🔵',
    description: 'Electric blue body with neon emerald accents.',
    previewColor: 0x00f0ff,
  },
  {
    id: 'paint_gold',
    name: 'SUNBURST GOLD',
    category: 'skin',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '🟡',
    description: 'Radiant amber gold chassis with dark midnight trim.',
    previewColor: 0xf59e0b,
  },
  {
    id: 'paint_purple',
    name: 'ULTRA VIOLET',
    category: 'skin',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '🟣',
    description: 'Ultraviolet purple finish with laser cyan racing stripes.',
    previewColor: 0x9333ea,
  },

  // ── 2B. MID-TIER RACING LIVERIES (LEVEL 5+ PROGRESSION) ──
  {
    id: 'skin_neon_cyber',
    name: 'NEON SYNTHWAVE',
    category: 'skin',
    price: 8000,
    currency: 'coins',
    requiredLevel: 5,
    badge: '⚡ CYBER',
    icon: '⚡',
    description: 'Cyberpunk neon cyan with hot magenta stripes.',
    previewColor: 0x00f0ff,
  },
  {
    id: 'skin_lava',
    name: 'MAGMA INFERNO',
    category: 'skin',
    price: 16000,
    currency: 'coins',
    requiredLevel: 7,
    badge: '🔥 INFERNO',
    icon: '🔥',
    description: 'Volcanic magma chassis with glowing ember heat lines.',
    previewColor: 0xff2200,
  },

  // ── 2C. HIGH-SOCIETY PREMIUM & LEGENDARY SKINS (LEVEL 10+, 30K - 45K COINS) ──
  {
    id: 'paint_white',
    name: 'ALPINE WHITE // GT EDITION',
    category: 'skin',
    price: 30000,
    currency: 'coins',
    requiredLevel: 10,
    badge: '💎 PREMIUM WHITE',
    icon: '⚪',
    description: 'Gloss alpine white with crimson GT racing stripes.',
    previewColor: 0xf8fafc,
  },
  {
    id: 'skin_stealth',
    name: 'OBSIDIAN STEALTH',
    category: 'skin',
    price: 32000,
    currency: 'coins',
    requiredLevel: 10,
    badge: '🖤 OBSIDIAN',
    icon: '🖤',
    description: 'Matte obsidian carbon weave with dark titanium trim.',
    previewColor: 0x141418,
  },
  {
    id: 'skin_arcadia',
    name: 'ARCADIA DIAMOND',
    category: 'skin',
    price: 38000,
    currency: 'coins',
    requiredLevel: 12,
    badge: '💎 DIAMOND',
    icon: '💎',
    description: 'Lustrous pearlescent diamond white with cyan edges.',
    previewColor: 0xffffff,
  },
  {
    id: 'skin_gold',
    name: '24K ROYAL GOLD',
    category: 'skin',
    price: 45000,
    currency: 'coins',
    requiredLevel: 15,
    badge: '👑 24K ROYAL',
    icon: '🌟',
    description: 'Reflective 24K mirror gold chassis & platinum trim.',
    previewColor: 0xffd700,
  },

  // 3. CUTE HATS & HEADWEAR ACCESSORIES
  {
    id: 'hat_none',
    name: 'BARE HEAD (DEFAULT)',
    category: 'hat',
    price: 0,
    currency: 'coins',
    badge: 'DEFAULT',
    icon: '🐾',
    description: 'Clean classic driver look without any hat.',
  },
  {
    id: 'hat_party',
    name: 'FESTIVE PARTY CONE',
    category: 'hat',
    price: 0,
    currency: 'coins',
    badge: 'STARTER',
    icon: '🥳',
    description: 'Bright polka-dot cone with fluffy pink pom-pom.',
  },
  {
    id: 'hat_beanie',
    name: 'STREETWEAR BEANIE',
    category: 'hat',
    price: 2000,
    currency: 'coins',
    requiredLevel: 5,
    badge: 'CASUAL',
    icon: '🧢',
    description: 'Vibrant orange knit streetwear slouch beanie.',
  },
  {
    id: 'hat_chef',
    name: 'MASTER CHEF TOQUE',
    category: 'hat',
    price: 2500,
    currency: 'coins',
    requiredLevel: 5,
    badge: 'FUNNY',
    icon: '👨‍🍳',
    description: 'Crisp tall white toque for culinary race champs.',
  },
  {
    id: 'hat_cowboy',
    name: 'WILD WEST COWBOY',
    category: 'hat',
    price: 3000,
    currency: 'coins',
    requiredLevel: 5,
    badge: 'COOL',
    icon: '🤠',
    description: 'Curved leather Stetson hat with gold sheriff star.',
  },
  {
    id: 'hat_sombrero',
    name: 'FIESTA SOMBRERO',
    category: 'hat',
    price: 3200,
    currency: 'coins',
    requiredLevel: 6,
    badge: 'FIESTA',
    icon: '🪅',
    description: 'Wide woven straw sombrero with vibrant fiesta trim.',
  },
  {
    id: 'hat_propeller',
    name: 'PROPELLER BEANIE',
    category: 'hat',
    price: 3500,
    currency: 'coins',
    requiredLevel: 6,
    badge: 'RETRO',
    icon: '🚁',
    description: 'Retro multi-tone cap with spinning twin propellers.',
  },
  {
    id: 'hat_flower',
    name: 'DAISY PLANT SPROUT',
    category: 'hat',
    price: 3800,
    currency: 'coins',
    requiredLevel: 6,
    badge: 'NATURE',
    icon: '🌸',
    description: 'Green plant sprout with blooming sunny daisy.',
  },
  {
    id: 'hat_frog',
    name: 'FROGGY BUCKET HAT',
    category: 'hat',
    price: 4200,
    currency: 'coins',
    requiredLevel: 7,
    badge: 'KAWAII',
    icon: '🐸',
    description: 'Pastel green bucket hat with big cute googly eyes.',
  },
  {
    id: 'hat_police',
    name: 'HIGHWAY PATROL CAP',
    category: 'hat',
    price: 4500,
    currency: 'coins',
    requiredLevel: 7,
    badge: 'LAW',
    icon: '👮',
    description: 'Navy officer peaked cap with polished silver badge.',
  },
  {
    id: 'hat_santa',
    name: 'HOLIDAY SANTA CAP',
    category: 'hat',
    price: 5000,
    currency: 'coins',
    requiredLevel: 8,
    badge: 'HOLIDAY',
    icon: '🎅',
    description: 'Red velvet holiday cone with white fur trim.',
  },
  {
    id: 'hat_duck',
    name: 'RUBBER DUCKY',
    category: 'hat',
    price: 5200,
    currency: 'coins',
    requiredLevel: 8,
    badge: 'CUTE',
    icon: '🦆',
    description: 'Adorable squeaky yellow rubber bath ducky.',
  },
  {
    id: 'hat_tophat',
    name: 'GENTLEMAN TOP HAT',
    category: 'hat',
    price: 5500,
    currency: 'coins',
    requiredLevel: 8,
    badge: 'CLASSY',
    icon: '🎩',
    description: 'Black silk cylinder hat with rich velvet ribbon.',
  },
  {
    id: 'hat_cat_ears',
    name: 'KAWAII NEKO EARS',
    category: 'hat',
    price: 5800,
    currency: 'coins',
    requiredLevel: 9,
    badge: 'POPULAR',
    icon: '🐱',
    description: 'Fluffy white kitten ears with golden jingle bell.',
  },
  {
    id: 'hat_pirate',
    name: 'PIRATE TRICORNE',
    category: 'hat',
    price: 6200,
    currency: 'coins',
    requiredLevel: 9,
    badge: 'OUTLAW',
    icon: '🏴‍☠️',
    description: 'Pirate captain tricorne with skull insignia.',
  },
  {
    id: 'hat_wizard',
    name: 'ARCANE WIZARD HAT',
    category: 'hat',
    price: 6500,
    currency: 'coins',
    requiredLevel: 10,
    badge: 'MYSTIC',
    icon: '🧙‍♂️',
    description: 'Pointy midnight-blue hat with golden crescent.',
  },
  {
    id: 'hat_viking',
    name: 'VIKING WAR HELMET',
    category: 'hat',
    price: 7000,
    currency: 'coins',
    requiredLevel: 10,
    badge: 'FIERCE',
    icon: '🛡️',
    description: 'Forged iron dome helmet with twin curved horns.',
  },
  {
    id: 'hat_cyber_horns',
    name: 'CYBER DEVIL HORNS',
    category: 'hat',
    price: 7500,
    currency: 'coins',
    requiredLevel: 11,
    badge: 'EDGY',
    icon: '😈',
    description: 'Glowing neon crimson horns on tech brackets.',
  },
  {
    id: 'hat_crown',
    name: 'ROYAL GOLD CROWN',
    category: 'hat',
    price: 8000,
    currency: 'coins',
    requiredLevel: 12,
    badge: '👑 ROYAL PREMIUM',
    icon: '⚜️',
    description: 'Gleaming 24K pure gold crown with royal jewels.',
  },
  {
    id: 'hat_halo',
    name: 'ANGELIC NEON HALO',
    category: 'hat',
    price: 8000,
    currency: 'coins',
    requiredLevel: 12,
    badge: '✨ DIVINE PREMIUM',
    icon: '😇',
    description: 'Hovering cyber-gold halo ring with divine glow.',
  },

  // 4. CHASMA & SUNGLASSES ACCESSORIES
  {
    id: 'glasses_none',
    name: 'BARE EYES (DEFAULT)',
    category: 'glasses',
    price: 0,
    currency: 'coins',
    badge: 'DEFAULT',
    icon: '👀',
    description: 'Natural clear eyes without any eyewear.',
  },
  {
    id: 'glasses_speed_matrix',
    name: 'SPEED MATRIX SHADES',
    category: 'glasses',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '🕶️',
    description: 'Curved dark racing glasses with UV reflection tint.',
  },
  {
    id: 'glasses_thug_life',
    name: 'THUG LIFE (DEAL WITH IT)',
    category: 'glasses',
    price: 2500,
    currency: 'coins',
    requiredLevel: 5,
    badge: '🔥 VIRAL MEME',
    icon: '😎',
    description: 'Iconic 8-bit pixel block deal-with-it shades.',
  },
  {
    id: 'glasses_retro_3d',
    name: 'RETRO 3D SHADES',
    category: 'glasses',
    price: 2800,
    currency: 'coins',
    requiredLevel: 5,
    badge: 'CLASSIC',
    icon: '🎬',
    description: 'Vintage white frames with Red & Cyan 3D lenses.',
  },
  {
    id: 'glasses_top_gun',
    name: 'TOP GUN AVIATORS',
    category: 'glasses',
    price: 3500,
    currency: 'coins',
    requiredLevel: 6,
    badge: 'PILOT',
    icon: '✈️',
    description: 'Gold wireframe aviator frames with deep smoke lenses.',
  },
  {
    id: 'glasses_star_party',
    name: 'SUPERSTAR GOLD',
    category: 'glasses',
    price: 4500,
    currency: 'coins',
    requiredLevel: 7,
    badge: 'PARTY',
    icon: '⭐',
    description: '5-pointed gold star frames for podium celebrations.',
  },
  {
    id: 'glasses_heart_rave',
    name: 'PIXEL HEART SHADES',
    category: 'glasses',
    price: 5500,
    currency: 'coins',
    requiredLevel: 8,
    badge: 'RAVE',
    icon: '💖',
    description: 'Neon hot pink heart-shaped rave cockpit glasses.',
  },
  {
    id: 'glasses_night_vision',
    name: 'TACTICAL NVG VISOR',
    category: 'glasses',
    price: 6500,
    currency: 'coins',
    requiredLevel: 9,
    badge: 'ELITE',
    icon: '🪖',
    description: 'Tactical night vision goggles with dual emerald lenses.',
  },
  {
    id: 'glasses_cyber_visor',
    name: 'CYBER NEON VISOR',
    category: 'glasses',
    price: 7200,
    currency: 'coins',
    requiredLevel: 10,
    badge: 'CYBER',
    icon: '⚡',
    description: 'Glowing laser cyan visor with digital scanline.',
  },
  {
    id: 'glasses_steampunk',
    name: 'STEAMPUNK GOGGLES',
    category: 'glasses',
    price: 8000,
    currency: 'coins',
    requiredLevel: 12,
    badge: '🥽 MASTER PREMIUM',
    icon: '🥽',
    description: 'Dual brass eye cups with amber lenses & leather strap.',
  },

  // 5. CURRENCY DROPS & EXCHANGES
  {
    id: 'ad_coins_500',
    name: 'FREE 500 COINS',
    category: 'currency',
    price: 0,
    currency: 'ad',
    badge: 'DAILY AD',
    icon: '🪙',
    description: 'Watch 1 quick arcade ad to instantly grab +500 Coins for your garage!',
  },
  {
    id: 'gem_swap_1000',
    name: '1,000 COIN BUNDLE',
    category: 'currency',
    price: 10,
    currency: 'gems',
    icon: '💰',
    description: 'Convert 10 Gems into 1,000 Coins immediately.',
  },
];

export class StoreManager {
  public buyItem(itemId: string): { success: boolean; message: string } {
    const item = STORE_CATALOG.find(i => i.id === itemId);
    if (!item) return { success: false, message: 'Item not found' };

    // Prevent purchase if VIP / Ads are disabled
    if (!ENABLE_VIP_AND_ADS && (item.category === 'vip' || item.currency === 'ad')) {
      return { success: false, message: 'Feature currently disabled.' };
    }

    // Check if already unlocked (except currency packs or consumable trials)
    if (item.category !== 'currency' && item.id !== 'vip_ad_15m' && economy.isItemUnlocked(itemId)) {
      return { success: false, message: 'Item already owned!' };
    }

    // Check level requirement
    if (item.requiredLevel && economy.getLevel() < item.requiredLevel) {
      return {
        success: false,
        message: `🔒 Requires Level ${item.requiredLevel}! (Your Level: ${economy.getLevel()}). Keep racing to gain XP!`,
      };
    }

    // Check VIP permanent
    if (itemId === 'vip_permanent') {
      if (economy.isVip() && economy.getVipRemainingTime() === 'PERMANENT') {
        return { success: false, message: 'You already own Permanent VIP!' };
      }
      if (!economy.deductGems(item.price)) {
        return { success: false, message: 'Not enough Gems! Race more or watch ads.' };
      }
      economy.activateVip(-1);
      sounds.playVictory();
      return { success: true, message: 'ROYAL VIP UNLOCKED! Welcome to the Elite Club!' };
    }

    // Currencies
    if (item.currency === 'coins') {
      if (!economy.deductCoins(item.price)) {
        return { success: false, message: `Need ${item.price.toLocaleString()} Coins! Keep racing!` };
      }
    } else if (item.currency === 'gems') {
      if (!economy.deductGems(item.price)) {
        return { success: false, message: `Need ${item.price} Gems!` };
      }
    }

    // Handle Item Reward
    if (itemId === 'gem_swap_1000') {
      economy.addCoins(1000);
      sounds.playCoin();
      return { success: true, message: '🪙 +1,000 Coins added to your bank!' };
    }

    economy.unlockItem(itemId);
    sounds.playCoin();

    // Auto-equip purchased skin/hat/glasses
    if (item.category === 'skin') {
      economy.setEquippedSkin(itemId);
    } else if (item.category === 'hat') {
      economy.setEquippedHat(itemId);
    } else if (item.category === 'glasses') {
      economy.setEquippedGlasses(itemId);
    }

    return { success: true, message: `🎉 ${item.name} UNLOCKED & EQUIPPED!` };
  }

  public watchAdForVip(onSuccess: () => void) {
    adsManager.showRewardedAd(
      {
        id: 'ad_vip',
        title: 'UNLOCK 15-MIN VIP PASS',
        rewardType: 'vip_15m',
        description: 'Enjoy 15 minutes of VIP Gold Crown, Gold Name, and 1.5x Coins & XP bonus!',
      },
      () => {
        economy.activateVip(15);
        sounds.playVictory();
        onSuccess();
      }
    );
  }

  public watchAdForCoins(onSuccess: () => void) {
    adsManager.showRewardedAd(
      {
        id: 'ad_coins',
        title: 'CLAIM +500 FREE COINS',
        rewardType: 'coins_500',
        description: 'Watch to add +500 Coins straight into your garage bank account!',
      },
      () => {
        economy.addCoins(500);
        sounds.playCoin();
        onSuccess();
      }
    );
  }
}

export const store = new StoreManager();

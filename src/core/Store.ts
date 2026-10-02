import { economy } from './Economy';
import { sounds } from './Sound';
import { adsManager } from './AdsManager';

export interface StoreItem {
  id: string;
  name: string;
  category: 'vip' | 'skin' | 'trail' | 'currency' | 'glasses';
  price: number;
  currency: 'coins' | 'gems' | 'ad';
  requiredLevel?: number;
  badge?: string;
  icon: string;
  description: string;
  previewColor?: number;
}

export const STORE_CATALOG: StoreItem[] = [
  // 1. VIP CROWN PASS SECTION
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
    icon: '👑',
    description: 'Permanent VIP status! Golden name tag, 👑 Crown symbol in races & leaderboards, +50% Coins & XP forever!',
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
    description: 'Iconic Apex racing crimson with pure white aerodynamic accents & matching suit.',
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
    description: 'High-voltage electric blue body with neon emerald accents & matching cyan driver.',
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
    description: 'Radiant amber gold chassis with midnight slate accents & matching gold driver.',
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
    description: 'Deep ultraviolet purple body with laser cyan stripes & matching violet driver.',
    previewColor: 0x9333ea,
  },
  {
    id: 'paint_white',
    name: 'ALPINE WHITE',
    category: 'skin',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '⚪',
    description: 'Clean gloss alpine white with crimson racing stripes & matching white driver.',
    previewColor: 0xf8fafc,
  },

  // ── 2B. ROYAL & LEGENDARY LIVERIES (LEVEL-UNLOCKED EXCLUSIVES) ──
  {
    id: 'skin_neon_cyber',
    name: 'NEON SYNTHWAVE',
    category: 'skin',
    price: 1000,
    currency: 'coins',
    requiredLevel: 3,
    badge: '⚡ CYBER',
    icon: '⚡',
    description: 'Luminescent cyberpunk cyan & radiant hot magenta stripes with glowing synthwave mascot.',
    previewColor: 0x00f0ff,
  },
  {
    id: 'skin_lava',
    name: 'MAGMA INFERNO',
    category: 'skin',
    price: 1200,
    currency: 'coins',
    requiredLevel: 6,
    badge: '🔥 INFERNO',
    icon: '🔥',
    description: 'Molten volcanic magma with glowing ember heat stripes & fiery charred mascot.',
    previewColor: 0xff2200,
  },
  {
    id: 'skin_stealth',
    name: 'OBSIDIAN STEALTH',
    category: 'skin',
    price: 1400,
    currency: 'coins',
    requiredLevel: 10,
    badge: '🖤 OBSIDIAN',
    icon: '🖤',
    description: 'Murdered-out matte obsidian carbon weave with dark titanium trim & spec-ops shadow mascot.',
    previewColor: 0x141418,
  },
  {
    id: 'skin_arcadia',
    name: 'ARCADIA DIAMOND',
    category: 'skin',
    price: 1600,
    currency: 'coins',
    requiredLevel: 15,
    badge: '💎 DIAMOND',
    icon: '💎',
    description: 'Lustrous pearlescent diamond white with laser cyan edge & arctic diamond mascot.',
    previewColor: 0xffffff,
  },
  {
    id: 'skin_gold',
    name: '24K ROYAL GOLD',
    category: 'skin',
    price: 2000,
    currency: 'coins',
    requiredLevel: 20,
    badge: '👑 ROYAL',
    icon: '🌟',
    description: 'Luxurious reflective 24K mirror gold chassis with platinum trim & gilded royal knight mascot.',
    previewColor: 0xffd700,
  },

  // 3. DRIFT SPARK TRAILS
  {
    id: 'trail_cyan',
    name: 'ELECTRIC CYAN',
    category: 'trail',
    price: 0,
    currency: 'coins',
    badge: 'DEFAULT',
    icon: '⚡',
    description: 'Standard high-voltage electric blue tire friction sparks.',
  },
  {
    id: 'trail_gold',
    name: 'GOLD DUST FLAMES',
    category: 'trail',
    price: 600,
    currency: 'coins',
    badge: 'STYLE',
    icon: '✨',
    description: 'Spits dazzling golden fire sparks whenever you drift around curves!',
  },
  {
    id: 'trail_rainbow',
    name: 'HYPER RAINBOW',
    category: 'trail',
    price: 900,
    currency: 'coins',
    badge: 'VIBRANT',
    icon: '🌈',
    description: 'Rainbow spectrum color-shifting sparks while cornering.',
  },
  {
    id: 'trail_lava',
    name: 'VOLCANIC EMBERS',
    category: 'trail',
    price: 800,
    currency: 'coins',
    badge: 'HEAT',
    icon: '🔥',
    description: 'Fiery glowing orange and ruby embers trailing behind your wheels.',
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
    description: 'Natural cute driver expression without any glasses or shades.',
  },
  {
    id: 'glasses_speed_matrix',
    name: 'SPEED MATRIX SHADES',
    category: 'glasses',
    price: 0,
    currency: 'coins',
    badge: 'STOCK',
    icon: '🕶️',
    description: 'Sleek aerodynamic curved dark racing glasses with UV reflection tint.',
  },
  {
    id: 'glasses_thug_life',
    name: 'THUG LIFE (DEAL WITH IT)',
    category: 'glasses',
    price: 400,
    currency: 'coins',
    badge: '🔥 VIRAL MEME',
    icon: '😎',
    description: 'Iconic 8-bit pixel block shades with stepped bottom and white reflection blocks!',
  },
  {
    id: 'glasses_retro_3d',
    name: 'RETRO 3D SHADES',
    category: 'glasses',
    price: 500,
    currency: 'coins',
    badge: 'CLASSIC',
    icon: '🎬',
    description: 'Vintage cardboard white frames with vibrant Red left & Cyan right lenses!',
  },
  {
    id: 'glasses_top_gun',
    name: 'TOP GUN AVIATORS',
    category: 'glasses',
    price: 800,
    currency: 'coins',
    badge: 'PILOT',
    icon: '✈️',
    description: 'Luxury polished gold wireframe aviator frames with deep smoke teardrop lenses.',
  },
  {
    id: 'glasses_star_party',
    name: 'SUPERSTAR GOLD',
    category: 'glasses',
    price: 1000,
    currency: 'coins',
    requiredLevel: 3,
    badge: 'PARTY',
    icon: '⭐',
    description: 'Radiant 5-pointed star-shaped fiesta frames for champions celebrating podium wins!',
  },
  {
    id: 'glasses_heart_rave',
    name: 'PIXEL HEART SHADES',
    category: 'glasses',
    price: 1200,
    currency: 'coins',
    requiredLevel: 5,
    badge: 'RAVE',
    icon: '💖',
    description: 'Radiant neon hot pink heart-shaped rave glasses that light up the cockpit!',
  },
  {
    id: 'glasses_cyber_visor',
    name: 'CYBER NEON VISOR',
    category: 'glasses',
    price: 1500,
    currency: 'coins',
    requiredLevel: 7,
    badge: 'CYBER',
    icon: '⚡',
    description: 'Daft Punk style high-tech glowing cyan laser visor with digital HUD scanline!',
  },
  {
    id: 'glasses_steampunk',
    name: 'STEAMPUNK GOGGLES',
    category: 'glasses',
    price: 2000,
    currency: 'coins',
    requiredLevel: 10,
    badge: 'MASTER',
    icon: '🥽',
    description: 'Heavy dual brass eye cups with dark amber glass and leather racing strap.',
  },
  {
    id: 'glasses_night_vision',
    name: 'TACTICAL NVG VISOR',
    category: 'glasses',
    price: 35,
    currency: 'gems',
    badge: 'ELITE',
    icon: '🪖',
    description: 'Special forces night vision goggles with dual glowing emerald combat lenses!',
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
      return { success: true, message: '👑 ROYAL VIP UNLOCKED! Welcome to the Elite Club!' };
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

    // Auto-equip purchased skin/trail/glasses
    if (item.category === 'skin') {
      economy.setEquippedSkin(itemId);
    } else if (item.category === 'trail') {
      economy.setEquippedTrail(itemId);
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

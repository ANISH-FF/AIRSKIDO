// Dynamic Neo-Brutalist Isometric Kart & Skin Avatar Generator
// Built exclusively for the universal single AirSkid Proto racer

export interface KartColors {
  body: string;
  bodyDark: string;
  secondary: string;
  trim: string;
  glow: string;
  kartName: string;
  skinName: string;
}

export function getKartDisplayName(_kartType?: number): string {
  return 'AIRSKID PROTO';
}

export function getSkinDisplayName(skinId?: string): string {
  switch (skinId) {
    case 'skin_gold':
      return '24K ROYAL GOLD';
    case 'skin_neon_cyber':
      return 'NEON CYBERPUNK';
    case 'skin_lava':
      return 'MAGMA INFERNO';
    case 'skin_stealth':
      return 'STEALTH CARBON';
    case 'skin_arcadia':
      return 'ARCADIA PEARL';
    case 'skin_default':
    default:
      return 'FACTORY STOCK';
  }
}

export function getKartSkinColors(_kartType?: number, skinId?: string): KartColors {
  const kName = 'AIRSKID PROTO';
  const sName = getSkinDisplayName(skinId);

  // If specific cosmetic livery equipped:
  if (skinId && skinId !== 'skin_default') {
    switch (skinId) {
      case 'skin_gold':
        return {
          body: '#FFD700',
          bodyDark: '#B45309',
          secondary: '#FFFBEB',
          trim: '#78350F',
          glow: '#FEF08A',
          kartName: kName,
          skinName: sName,
        };
      case 'skin_neon_cyber':
        return {
          body: '#00F0FF',
          bodyDark: '#0284C7',
          secondary: '#FF00AA',
          trim: '#18181B',
          glow: '#38BDF8',
          kartName: kName,
          skinName: sName,
        };
      case 'skin_lava':
        return {
          body: '#FF2200',
          bodyDark: '#991B1B',
          secondary: '#F59E0B',
          trim: '#450A0A',
          glow: '#FB923C',
          kartName: kName,
          skinName: sName,
        };
      case 'skin_stealth':
        return {
          body: '#27272A',
          bodyDark: '#18181B',
          secondary: '#52525B',
          trim: '#09090B',
          glow: '#A1A1AA',
          kartName: kName,
          skinName: sName,
        };
      case 'skin_arcadia':
        return {
          body: '#FFFFFF',
          bodyDark: '#CBD5E1',
          secondary: '#00D2FF',
          trim: '#0284C7',
          glow: '#A7F3D0',
          kartName: kName,
          skinName: sName,
        };
    }
  }

  // Default Factory Livery (Racing Crimson & White):
  return {
    body: '#FF2244',
    bodyDark: '#9F1239',
    secondary: '#FFFFFF',
    trim: '#111827',
    glow: '#FDA4AF',
    kartName: kName,
    skinName: sName,
  };
}

/**
 * Returns a high-energy 3/4 isometric cartoon racing kart SVG badge.
 * Features an authentic Neo-Brutalist arcade spotlight turntable pedestal,
 * pilot helmet, aerodynamic race wing, and equipped livery colors.
 */
export function getKartAvatarSVG(_kartType: number, skinId?: string, size: number = 145): string {
  const colors = getKartSkinColors(0, skinId);

  // Common Wheels & Tires (Isometric Angled Perspective)
  const wheelFL = `
    <!-- Front Left Wheel -->
    <g transform="translate(18, 54)">
      <rect x="0" y="0" width="16" height="24" rx="6" fill="#18181B" stroke="#000" stroke-width="2.5"/>
      <rect x="3" y="4" width="10" height="16" rx="4" fill="${colors.secondary}" stroke="#000" stroke-width="1.5"/>
      <circle cx="8" cy="12" r="3" fill="#18181B"/>
    </g>
  `;
  const wheelRL = `
    <!-- Rear Left Wheel -->
    <g transform="translate(74, 50)">
      <rect x="0" y="0" width="20" height="30" rx="7" fill="#18181B" stroke="#000" stroke-width="2.5"/>
      <rect x="4" y="5" width="12" height="20" rx="4" fill="${colors.secondary}" stroke="#000" stroke-width="1.5"/>
      <circle cx="10" cy="15" r="3.5" fill="#18181B"/>
    </g>
  `;
  const wheelFR = `
    <!-- Front Right Wheel (Offset background) -->
    <g transform="translate(42, 38)">
      <rect x="0" y="0" width="14" height="20" rx="5" fill="#111827" stroke="#000" stroke-width="2"/>
      <rect x="3" y="3" width="8" height="14" rx="3" fill="${colors.bodyDark}"/>
    </g>
  `;
  const wheelRR = `
    <!-- Rear Right Wheel (Offset background) -->
    <g transform="translate(90, 34)">
      <rect x="0" y="0" width="16" height="24" rx="6" fill="#111827" stroke="#000" stroke-width="2"/>
      <rect x="3" y="4" width="10" height="16" rx="4" fill="${colors.bodyDark}"/>
    </g>
  `;

  // Pilot Helmet
  const helmet = `
    <g transform="translate(52, 26)">
      <!-- Racer Helmet Dome -->
      <circle cx="10" cy="10" r="10" fill="${colors.secondary}" stroke="#000" stroke-width="2.5"/>
      <!-- Visor Goggles -->
      <path d="M4 8 Q12 6 18 9 Q17 14 6 14 Z" fill="#00D2FF" stroke="#000" stroke-width="1.8"/>
      <!-- Visor Glares -->
      <path d="M7 9 L11 8" stroke="#FFF" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Helmet Racing Stripe -->
      <path d="M9 0 Q10 5 10 10" stroke="${colors.body}" stroke-width="2.5" fill="none"/>
    </g>
  `;

  // Formula-Arcade Proto Chassis
  const chassisSVG = `
    <!-- Rear Aerodynamic Wing -->
    <g transform="translate(86, 24)">
      <path d="M0 0 L16 -4 L18 8 L2 12 Z" fill="${colors.secondary}" stroke="#000" stroke-width="2.5"/>
      <line x1="6" y1="10" x2="4" y2="24" stroke="#000" stroke-width="3" stroke-linecap="round"/>
      <line x1="14" y1="6" x2="12" y2="20" stroke="#000" stroke-width="3" stroke-linecap="round"/>
    </g>
    <!-- Main Chassis Lower Side -->
    <path d="M22 66 L86 62 L96 44 L70 36 L28 46 Z" fill="${colors.bodyDark}" stroke="#000" stroke-width="2.5"/>
    <!-- Main Chassis Top Hood -->
    <path d="M8 62 L36 48 L72 36 L84 44 L28 64 Z" fill="${colors.body}" stroke="#000" stroke-width="2.5"/>
    <!-- Front Aerodynamic Nosecone -->
    <path d="M4 62 L26 54 L24 66 L6 70 Z" fill="${colors.secondary}" stroke="#000" stroke-width="2.5"/>
    <!-- Front Splitter Wing -->
    <path d="M2 66 L22 60 L24 70 L4 74 Z" fill="#18181B" stroke="#000" stroke-width="2"/>
    <!-- Windshield -->
    <path d="M38 48 L56 40 L64 46 L46 54 Z" fill="#00D2FF" fill-opacity="0.85" stroke="#000" stroke-width="2"/>
    <line x1="42" y1="49" x2="52" y2="43" stroke="#FFF" stroke-width="2" stroke-linecap="round"/>
    <!-- Side Pod Stripe -->
    <path d="M38 60 L74 56 L78 61 L42 64 Z" fill="${colors.secondary}" stroke="#000" stroke-width="1.8"/>
    <!-- Exhaust Nitro Flame Spark -->
    <path d="M96 50 L108 48 L102 54 L112 53 L98 58 Z" fill="#FFDE59" stroke="#FF385C" stroke-width="1.5"/>
  `;

  const height = Math.round((size * 96) / 130);

  return `
    <svg viewBox="0 0 130 96" width="${size}" height="${height}" xmlns="http://www.w3.org/2000/svg" class="mp-kart-svg" style="display: block; overflow: visible; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));">
      <!-- Arcade Spotlight Pedestal / Turntable Stage -->
      <g class="mp-pedestal-stage" transform="translate(62, 75)">
        <!-- Turntable Cast Shadow -->
        <ellipse cx="0" cy="9" rx="54" ry="12" fill="rgba(0,0,0,0.3)"/>
        <!-- Pedestal Cylinder Bevel Rim -->
        <path d="M -48 0 C -48 7, 48 7, 48 0 L 48 6 C 48 13, -48 13, -48 6 Z" fill="#0F172A" stroke="#000" stroke-width="2.2"/>
        <!-- Pedestal Top Surface -->
        <ellipse cx="0" cy="0" rx="48" ry="10" fill="#1E293B" stroke="#000" stroke-width="2.2"/>
        <!-- Neon Underglow Edge Accent -->
        <ellipse cx="0" cy="0" rx="42" ry="8" fill="none" stroke="${colors.glow}" stroke-width="2" stroke-dasharray="7 3" opacity="0.95"/>
        <!-- Center Spotlight Flare -->
        <ellipse cx="0" cy="0" rx="30" ry="5.5" fill="${colors.glow}" fill-opacity="0.2"/>
      </g>

      <!-- Right Side Wheels (Behind) -->
      ${wheelFR}
      ${wheelRR}

      <!-- Main Chassis & Cockpit -->
      ${chassisSVG}

      <!-- Pilot Helmet -->
      ${helmet}

      <!-- Left Side Wheels (Forefront) -->
      ${wheelFL}
      ${wheelRL}
    </svg>
  `;
}

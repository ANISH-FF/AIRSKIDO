import * as THREE from 'three';

/**
 * AIRSKID RACING // 3D CHARACTER SUNGLASSES & ACCESSORIES BUILDER
 * Production-ready, AAA arcade-quality 3D eyewear for the driver character.
 * Perfectly calibrated to the head size (width ~0.72) and resting proudly
 * over the bridge of the snout at (0, 0.738, 0.418) with ZERO eye clipping.
 */
export function buildGlassesMesh(glassesId: string): THREE.Group | null {
  if (!glassesId || glassesId === 'glasses_none') return null;

  const root = new THREE.Group();
  // Positioned proudly in front of the eyes (z = 0.422) and right above nose (y = 0.738)
  root.position.set(0, 0.738, 0.422);
  root.rotation.x = -0.04; // subtle anatomical tilt matching character head contour

  switch (glassesId) {
    // ══════════════════════════════════════════════════════════════════
    // 1. THUG LIFE (DEAL WITH IT) // 8-BIT ICONIC MEME PIXEL SHADES
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_thug_life': {
      const pw = 0.042; // pixel width
      const ph = 0.038; // pixel height
      const pd = 0.024; // pixel thickness

      const blackMat = new THREE.MeshStandardMaterial({
        color: 0x08080c,
        roughness: 0.3,
        metalness: 0.2,
      });
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

      const pixelGroup = new THREE.Group();

      // Helper to stamp a pixel box
      const stampPixel = (col: number, row: number, isWhite: boolean = false) => {
        const geom = new THREE.BoxGeometry(pw, ph, isWhite ? pd + 0.003 : pd);
        const mesh = new THREE.Mesh(geom, isWhite ? whiteMat : blackMat);
        mesh.position.set(col * pw, -row * ph, 0);
        pixelGroup.add(mesh);
      };

      // Top Brow Bar: Row 0 across all columns from -8 to +8 (total width ~0.71)
      for (let c = -8; c <= 8; c++) {
        stampPixel(c, 0);
      }

      // Middle Nose Bridge: Row 1 at center (-1, 0, 1)
      stampPixel(-1, 1);
      stampPixel(0, 1);
      stampPixel(1, 1);

      // Both Lenses with Stepped 8-Bit Staircase Bottom Edge
      for (const side of [-1, 1]) {
        // Row 1: Full width of lens (cols 2 to 8)
        for (let c = 2; c <= 8; c++) stampPixel(side * c, 1);

        // Row 2: cols 3 to 8 (stepped in by 1)
        for (let c = 3; c <= 8; c++) stampPixel(side * c, 2);

        // Row 3: cols 4 to 8 (stepped in by 2)
        for (let c = 4; c <= 8; c++) stampPixel(side * c, 3);

        // Row 4: cols 6 to 8 (outermost deep drop)
        for (let c = 6; c <= 8; c++) stampPixel(side * c, 4);

        // ── Iconic 8-bit White Reflection Highlights (4 white blocks per lens) ──
        stampPixel(side * 6, 1, true);
        stampPixel(side * 5, 1, true);
        stampPixel(side * 5, 2, true);
        stampPixel(side * 4, 2, true);
      }

      root.add(pixelGroup);

      // Temples / Side Arms: Sturdy black arms hugging head back to z = -0.35
      for (const side of [-1, 1]) {
        const armGeom = new THREE.BoxGeometry(0.022, 0.034, 0.38);
        const arm = new THREE.Mesh(armGeom, blackMat);
        arm.position.set(side * 0.35, 0, -0.18);
        arm.rotation.y = side * 0.05;
        root.add(arm);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 2. TOP GUN AVIATORS // LUXURY GOLD WIREFRAME & SMOKE TEARDROPS
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_top_gun': {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.95,
        roughness: 0.12,
      });
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x0f1118,
        metalness: 0.6,
        roughness: 0.08,
        transparent: true,
        opacity: 0.92,
      });

      // Dual Teardrop Lenses and Gold Rims
      for (const side of [-1, 1]) {
        // Metallic Rim
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 10, 24), goldMat);
        rim.scale.set(1.0, 1.18, 1.0);
        rim.position.set(side * 0.165, -0.01, 0.01);
        root.add(rim);

        // Dark Smoked Lens
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.116, 0.01, 24), lensMat);
        lens.rotation.x = Math.PI / 2;
        lens.scale.set(1.0, 1.0, 1.18);
        lens.position.set(side * 0.165, -0.01, 0.01);
        root.add(lens);
      }

      // Classic Aviator Double Bridge (Top Brow Bar + Nose Bridge)
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.016, 0.016), goldMat);
      topBar.position.set(0, 0.12, 0.01);
      root.add(topBar);

      const bridgeBar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.014), goldMat);
      bridgeBar.position.set(0, 0.02, 0.01);
      root.add(bridgeBar);

      // Gold Temples
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.38), goldMat);
        arm.position.set(side * 0.34, 0.06, -0.18);
        arm.rotation.y = side * 0.06;
        root.add(arm);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 3. CYBER NEON VISOR // FUTURISTIC DAFT PUNK / CYBERPUNK HUD
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_cyber_visor': {
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00d2ff,
        emissiveIntensity: 1.1,
        roughness: 0.1,
        metalness: 0.4,
        transparent: true,
        opacity: 0.94,
      });
      const carbonMat = new THREE.MeshStandardMaterial({
        color: 0x090a10,
        roughness: 0.4,
        metalness: 0.8,
      });

      // Wide Wraparound Visor Shield
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.16, 32, 1, true, -Math.PI * 0.46, Math.PI * 0.92),
        visorMat
      );
      visor.position.set(0, 0, -0.14);
      root.add(visor);

      // Heavy Carbon Brow Shield Rail
      const brow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.385, 0.385, 0.038, 32, 1, true, -Math.PI * 0.47, Math.PI * 0.94),
        carbonMat
      );
      brow.position.set(0, 0.08, -0.14);
      root.add(brow);

      // Center Laser Scanline (Glowing White Line)
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const laser = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.014, 0.02), laserMat);
      laser.position.set(0, 0, 0.24);
      root.add(laser);

      // Left & Right Audio Comm Earpieces
      for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.10), carbonMat);
        pod.position.set(side * 0.34, 0, -0.06);
        root.add(pod);

        const neonGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.022, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xff0055 })
        );
        neonGlow.position.set(side * 0.365, 0, -0.06);
        root.add(neonGlow);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 4. RETRO 3D SHADES // CLASSIC WAYFARER WHITE + RED/CYAN LENSES
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_retro_3d': {
      const whiteFrameMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.1,
      });
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff0044, transparent: true, opacity: 0.88 });
      const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.88 });

      // Solid White Frame Bar across top
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 0.028), whiteFrameMat);
      topBar.position.set(0, 0.08, 0);
      root.add(topBar);

      // Bottom Frame Bar
      const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.03, 0.028), whiteFrameMat);
      bottomBar.position.set(0, -0.08, 0);
      root.add(bottomBar);

      // Center Nose Bridge & Outer Wings
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.028), whiteFrameMat);
      bridge.position.set(0, 0, 0);
      root.add(bridge);

      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.028), whiteFrameMat);
        wing.position.set(side * 0.32, 0, 0);
        root.add(wing);

        // Temples
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.36), whiteFrameMat);
        arm.position.set(side * 0.33, 0.02, -0.18);
        root.add(arm);
      }

      // Left Red Lens
      const redLens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.02), redMat);
      redLens.position.set(-0.165, 0, 0.005);
      root.add(redLens);

      // Right Cyan Lens
      const cyanLens = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.13, 0.02), cyanMat);
      cyanLens.position.set(0.165, 0, 0.005);
      root.add(cyanLens);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 5. SPEED MATRIX // OAKLEY / PIT-VIPER AGGRESSIVE RACING SHADES
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_speed_matrix': {
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x050508,
        roughness: 0.1,
        metalness: 0.8,
      });
      const polarizedMat = new THREE.MeshStandardMaterial({
        color: 0x0a0c14,
        roughness: 0.05,
        metalness: 0.9,
      });

      // Top Angular Brow Bar
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.035, 0.03), frameMat);
      topBar.position.set(0, 0.075, 0.01);
      root.add(topBar);

      // Angular aerodynamic blade lenses (curved and angled back)
      for (const side of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.024), polarizedMat);
        lens.position.set(side * 0.17, -0.01, 0.015);
        lens.rotation.y = -side * 0.18;
        lens.rotation.z = side * 0.04;
        root.add(lens);

        // Neon Accent Line along brow
        const lineGeom = new THREE.BoxGeometry(0.24, 0.008, 0.026);
        const line = new THREE.Mesh(lineGeom, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
        line.position.set(side * 0.17, 0.065, 0.02);
        root.add(line);

        // Side aerodynamic temples
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.05, 0.36), frameMat);
        arm.position.set(side * 0.335, 0.03, -0.16);
        arm.rotation.y = side * 0.08;
        root.add(arm);
      }

      // Nose Pad
      const nosePad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.03), frameMat);
      nosePad.position.set(0, 0.01, 0.015);
      root.add(nosePad);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 6. SUPERSTAR GOLD // 5-POINTED STAR CHAMPIONSHIP CELEBRATION
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_star_party': {
      const starGoldMat = new THREE.MeshStandardMaterial({
        color: 0xffde59,
        metalness: 0.7,
        roughness: 0.15,
      });
      const starLensMat = new THREE.MeshStandardMaterial({
        color: 0x221805,
        roughness: 0.1,
        metalness: 0.5,
      });

      // 5-point Star Polygon Helper
      const createStarShape = (outerR: number, innerR: number) => {
        const shape = new THREE.Shape();
        const pts = 5;
        for (let i = 0; i < pts * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / pts - Math.PI / 2;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (i === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        }
        shape.closePath();
        return shape;
      };

      const starGeom = new THREE.ExtrudeGeometry(createStarShape(0.165, 0.078), {
        depth: 0.025,
        bevelEnabled: false,
      });

      for (const side of [-1, 1]) {
        // Gold Outer Star Frame
        const star = new THREE.Mesh(starGeom, starGoldMat);
        star.position.set(side * 0.17, 0, 0);
        root.add(star);

        // Dark Star Center Lens
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16), starLensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(side * 0.17, 0, 0.005);
        root.add(lens);

        // Gold Temple
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.025, 0.36), starGoldMat);
        arm.position.set(side * 0.33, 0.01, -0.17);
        arm.rotation.y = side * 0.06;
        root.add(arm);
      }

      // Connecting Bridge
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.024, 0.024), starGoldMat);
      bridge.position.set(0, 0.02, 0.01);
      root.add(bridge);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. STEAMPUNK GOGGLES // HEAVY BRASS RIMS & STUDDED LEATHER
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_steampunk': {
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xcd7f32,
        metalness: 0.95,
        roughness: 0.22,
      });
      const amberLensMat = new THREE.MeshStandardMaterial({
        color: 0x92400e,
        metalness: 0.5,
        roughness: 0.08,
        transparent: true,
        opacity: 0.88,
      });
      const leatherMat = new THREE.MeshStandardMaterial({
        color: 0x3d1d07,
        roughness: 0.85,
      });

      // Dual Brass Cylindrical Eyecups
      for (const side of [-1, 1]) {
        // Brass Barrel
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.125, 0.125, 0.075, 24, 1, true),
          brassMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(side * 0.17, 0, 0.03);
        root.add(barrel);

        // Amber Convex Lens
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.012, 20), amberLensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(side * 0.17, 0, 0.06);
        root.add(lens);

        // Circular Brass Studs around Rim
        for (let s = 0; s < 8; s++) {
          const angle = (s * Math.PI * 2) / 8;
          const stud = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), brassMat);
          stud.position.set(
            side * 0.17 + Math.cos(angle) * 0.122,
            Math.sin(angle) * 0.122,
            0.072
          );
          root.add(stud);
        }
      }

      // Center Leather Nose Strap
      const noseStrap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.045, 0.026), leatherMat);
      noseStrap.position.set(0, 0.01, 0.02);
      root.add(noseStrap);

      // Heavy Leather Head Strap wrapping around head
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.065, 0.38), leatherMat);
        strap.position.set(side * 0.33, 0, -0.16);
        root.add(strap);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 8. PIXEL HEART SHADES // NEON HOT PINK RAVE SUNGLASSES
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_heart_rave': {
      const pinkMat = new THREE.MeshStandardMaterial({
        color: 0xff007f,
        emissive: 0x990044,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.1,
      });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x140410, roughness: 0.1 });

      // Procedural Heart Shape Helper
      const createHeartShape = (scale: number) => {
        const s = new THREE.Shape();
        s.moveTo(0, scale * 0.3);
        s.bezierCurveTo(0, scale * 0.6, -scale * 0.6, scale * 0.9, -scale * 0.9, scale * 0.6);
        s.bezierCurveTo(-scale * 1.3, scale * 0.2, -scale * 0.9, -scale * 0.5, 0, -scale * 1.1);
        s.bezierCurveTo(scale * 0.9, -scale * 0.5, scale * 1.3, scale * 0.2, scale * 0.9, scale * 0.6);
        s.bezierCurveTo(scale * 0.6, scale * 0.9, 0, scale * 0.6, 0, scale * 0.3);
        return s;
      };

      const heartGeom = new THREE.ExtrudeGeometry(createHeartShape(0.12), {
        depth: 0.025,
        bevelEnabled: false,
      });

      for (const side of [-1, 1]) {
        const heart = new THREE.Mesh(heartGeom, pinkMat);
        heart.position.set(side * 0.17, 0.02, 0);
        root.add(heart);

        const innerLens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16), darkMat);
        innerLens.rotation.x = Math.PI / 2;
        innerLens.position.set(side * 0.17, 0.02, 0.005);
        root.add(innerLens);

        // Pink Temples
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.03, 0.36), pinkMat);
        arm.position.set(side * 0.33, 0.03, -0.17);
        arm.rotation.y = side * 0.06;
        root.add(arm);
      }

      // Pink Bridge
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.022), pinkMat);
      bridge.position.set(0, 0.02, 0.01);
      root.add(bridge);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 9. TACTICAL NIGHT VISION // MILITARY EMERALD COMBAT NVG
    // ══════════════════════════════════════════════════════════════════
    case 'glasses_night_vision': {
      const carbonMat = new THREE.MeshStandardMaterial({
        color: 0x121318,
        roughness: 0.5,
        metalness: 0.6,
      });
      const emeraldMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 1.5,
        roughness: 0.1,
      });

      // Dual Tactical Night Vision Objective Cylinders
      for (const side of [-1, 1]) {
        // Barrel
        const housing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.09, 20),
          carbonMat
        );
        housing.rotation.x = Math.PI / 2;
        housing.position.set(side * 0.17, 0, 0.045);
        root.add(housing);

        // Glowing Emerald Lens
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.02, 20), emeraldMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(side * 0.17, 0, 0.095);
        root.add(lens);
      }

      // Tactical Carbon Brow Mount & Forehead Rail
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.045, 0.05), carbonMat);
      mount.position.set(0, 0.08, 0.03);
      root.add(mount);

      // Military Tactical Head Harness
      for (const side of [-1, 1]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, 0.38), carbonMat);
        strap.position.set(side * 0.33, 0.04, -0.16);
        root.add(strap);
      }
      break;
    }

    default:
      return null;
  }

  return root;
}

import * as THREE from 'three';

/**
 * AIRSKID RACING // 3D CHARACTER HATS & HEADWEAR BUILDER
 * AAA arcade-quality 3D headwear calibrated for the driver character.
 * Sits comfortably on the crown of the head at (0, 1.04, 0.02)
 * Designed to fit between the ears (ears at x = +/- 0.245, y = 0.995).
 */
export function buildHatMesh(hatId: string): THREE.Group | null {
  if (!hatId || hatId === 'hat_none') return null;

  const root = new THREE.Group();
  // Calibrated snugly on driver skull - lowered to eliminate any floating gap
  root.position.set(0, 0.985, 0.02);
  // Scaled 15% wider in X/Z and 8% taller in Y so hats wrap and fit the character's head naturally
  root.scale.set(1.15, 1.08, 1.15);

  switch (hatId) {
    // ══════════════════════════════════════════════════════════════════
    // 1. ROYAL GOLD CROWN // Shiny medieval jewel crown
    // ══════════════════════════════════════════════════════════════════
    case 'hat_crown': {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.85,
        roughness: 0.2,
      });
      const rubyMat = new THREE.MeshStandardMaterial({
        color: 0xff1144,
        roughness: 0.15,
        metalness: 0.3,
        emissive: 0x440011,
        emissiveIntensity: 0.4,
      });
      const emeraldMat = new THREE.MeshStandardMaterial({
        color: 0x00e676,
        roughness: 0.15,
        metalness: 0.3,
        emissive: 0x003311,
        emissiveIntensity: 0.4,
      });

      // Circular base band
      const bandGeom = new THREE.CylinderGeometry(0.21, 0.22, 0.06, 16, 1, true);
      const band = new THREE.Mesh(bandGeom, goldMat);
      band.position.y = 0.015;
      root.add(band);

      // Crown spikes (5 peaked cones)
      const numSpikes = 6;
      for (let i = 0; i < numSpikes; i++) {
        const angle = (i / numSpikes) * Math.PI * 2;
        const r = 0.215;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;

        const spikeGeom = new THREE.ConeGeometry(0.045, 0.11, 4);
        const spike = new THREE.Mesh(spikeGeom, goldMat);
        spike.position.set(x, 0.085, z);
        spike.rotation.y = angle;
        root.add(spike);

        // Gem on each peak
        const gemGeom = new THREE.SphereGeometry(0.022, 6, 6);
        const gemMat = i % 2 === 0 ? rubyMat : emeraldMat;
        const gem = new THREE.Mesh(gemGeom, gemMat);
        gem.position.set(x, 0.145, z);
        root.add(gem);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 2. WILD WEST COWBOY HAT // Classic brown leather Stetson
    // ══════════════════════════════════════════════════════════════════
    // 2. WILD WEST COWBOY HAT // Classic brown leather Stetson with curved brim
    // ══════════════════════════════════════════════════════════════════
    case 'hat_cowboy': {
      const leatherMat = new THREE.MeshStandardMaterial({
        color: 0x6e3b18,
        roughness: 0.6,
        metalness: 0.08,
      });
      const bandMat = new THREE.MeshStandardMaterial({
        color: 0x1f1106,
        roughness: 0.45,
      });
      const starMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.85,
        roughness: 0.2,
      });

      const cowboyGroup = new THREE.Group();
      cowboyGroup.rotation.x = -0.08; // Jaunty tilt revealing eyes/forehead

      // Authentic curved Stetson brim: curves UP on the sides and dips front & back
      const brimGeom = new THREE.CylinderGeometry(0.38, 0.40, 0.024, 24, 4);
      brimGeom.scale(0.92, 1.0, 1.25);
      const brimPos = brimGeom.attributes.position;
      for (let i = 0; i < brimPos.count; i++) {
        const x = brimPos.getX(i);
        const z = brimPos.getZ(i);
        const y = brimPos.getY(i);
        const curlX = Math.pow(Math.abs(x) / 0.35, 2) * 0.085;
        const dipZ = -Math.pow(Math.abs(z) / 0.45, 2) * 0.025;
        brimPos.setY(i, y + curlX + dipZ);
      }
      brimGeom.computeVertexNormals();
      const brim = new THREE.Mesh(brimGeom, leatherMat);
      brim.position.set(0, 0.015, -0.01);
      cowboyGroup.add(brim);

      // Creased cattleman crown
      const crownGeom = new THREE.CylinderGeometry(0.20, 0.24, 0.22, 20, 4);
      crownGeom.scale(0.88, 1.0, 1.15);
      const crownPos = crownGeom.attributes.position;
      for (let i = 0; i < crownPos.count; i++) {
        const x = crownPos.getX(i);
        const y = crownPos.getY(i);
        if (y > 0.02) {
          const topFactor = (y - 0.02) / 0.09;
          const crease = (1 - Math.min(1, Math.abs(x) / 0.12)) * 0.04 * topFactor;
          crownPos.setY(i, y - crease);
        }
      }
      crownGeom.computeVertexNormals();
      const crown = new THREE.Mesh(crownGeom, leatherMat);
      crown.position.set(0, 0.10, -0.01);
      cowboyGroup.add(crown);

      // Dark leather hatband
      const hatBandGeom = new THREE.CylinderGeometry(0.242, 0.245, 0.035, 20, 1, true);
      hatBandGeom.scale(0.89, 1.0, 1.16);
      const hatBand = new THREE.Mesh(hatBandGeom, bandMat);
      hatBand.position.set(0, 0.035, -0.01);
      cowboyGroup.add(hatBand);

      // Front gold star badge
      const starGeom = new THREE.CylinderGeometry(0.024, 0.024, 0.015, 5);
      starGeom.rotateX(Math.PI / 2);
      const star = new THREE.Mesh(starGeom, starMat);
      star.position.set(0, 0.045, 0.26);
      cowboyGroup.add(star);

      root.add(cowboyGroup);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 3. FROGGY BUCKET HAT // Pastel green with cute googly frog eyes
    // ══════════════════════════════════════════════════════════════════
    case 'hat_frog': {
      const frogGreen = new THREE.MeshStandardMaterial({
        color: 0x48bb78,
        roughness: 0.45,
      });
      const eyeWhite = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.2,
      });
      const pupilBlack = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
      });
      const blushPink = new THREE.MeshStandardMaterial({
        color: 0xff80bf,
        roughness: 0.6,
      });

      // Sloping bucket brim
      const brimGeom = new THREE.CylinderGeometry(0.24, 0.35, 0.06, 18, 1, true);
      const brim = new THREE.Mesh(brimGeom, frogGreen);
      brim.position.y = 0.01;
      root.add(brim);

      // Bucket crown dome
      const domeGeom = new THREE.CylinderGeometry(0.21, 0.24, 0.14, 18);
      const dome = new THREE.Mesh(domeGeom, frogGreen);
      dome.position.y = 0.095;
      root.add(dome);

      // Top lid
      const lidGeom = new THREE.CircleGeometry(0.21, 18);
      lidGeom.rotateX(-Math.PI / 2);
      const lid = new THREE.Mesh(lidGeom, frogGreen);
      lid.position.y = 0.165;
      root.add(lid);

      // Two cute froggy eyes on top
      for (const side of [-1, 1]) {
        // Green eye socket
        const socketGeom = new THREE.SphereGeometry(0.065, 10, 10);
        const socket = new THREE.Mesh(socketGeom, frogGreen);
        socket.position.set(side * 0.11, 0.195, 0.08);
        root.add(socket);

        // White eyeball
        const eyeGeom = new THREE.SphereGeometry(0.048, 8, 8);
        const eye = new THREE.Mesh(eyeGeom, eyeWhite);
        eye.position.set(side * 0.11, 0.20, 0.115);
        root.add(eye);

        // Big black shiny pupil
        const pupilGeom = new THREE.SphereGeometry(0.026, 6, 6);
        const pupil = new THREE.Mesh(pupilGeom, pupilBlack);
        pupil.position.set(side * 0.11, 0.20, 0.15);
        root.add(pupil);

        // Cute blush cheeks on brim
        const blushGeom = new THREE.CircleGeometry(0.035, 8);
        const blush = new THREE.Mesh(blushGeom, blushPink);
        blush.position.set(side * 0.13, 0.03, 0.28);
        blush.rotation.x = -0.35;
        root.add(blush);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 4. KAWAII NEKO CAT EARS // Fluffy pink/white kitten ear headband
    // ══════════════════════════════════════════════════════════════════
    case 'hat_cat_ears': {
      const whiteFur = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
      });
      const pinkInner = new THREE.MeshStandardMaterial({
        color: 0xff77aa,
        roughness: 0.4,
      });
      const bandMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.3,
        metalness: 0.2,
      });
      const goldBellMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.85,
        roughness: 0.15,
      });

      // Curved headband over head
      const bandGeom = new THREE.TorusGeometry(0.25, 0.024, 8, 20, Math.PI);
      const band = new THREE.Mesh(bandGeom, bandMat);
      band.rotation.x = Math.PI / 2;
      band.rotation.z = Math.PI / 2;
      band.position.y = 0.01;
      root.add(band);

      for (const side of [-1, 1]) {
        // Outer fluffy cat ear
        const earGeom = new THREE.ConeGeometry(0.10, 0.22, 4);
        const ear = new THREE.Mesh(earGeom, whiteFur);
        ear.position.set(side * 0.21, 0.15, 0.01);
        ear.rotation.z = -side * 0.32;
        ear.rotation.y = side * 0.12;
        root.add(ear);

        // Pink inner ear flap
        const innerGeom = new THREE.ConeGeometry(0.065, 0.15, 4);
        const inner = new THREE.Mesh(innerGeom, pinkInner);
        inner.position.set(side * 0.205, 0.135, 0.035);
        inner.rotation.z = -side * 0.32;
        inner.rotation.y = side * 0.12;
        root.add(inner);
      }

      // Cute golden jingle bell on right ear
      const bellGeom = new THREE.SphereGeometry(0.034, 8, 8);
      const bell = new THREE.Mesh(bellGeom, goldBellMat);
      bell.position.set(0.14, 0.07, 0.05);
      root.add(bell);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 5. GENTLEMAN TOP HAT // Tall glossy black silk cylinder
    // ══════════════════════════════════════════════════════════════════
    case 'hat_tophat': {
      const silkBlack = new THREE.MeshStandardMaterial({
        color: 0x111317,
        roughness: 0.25,
        metalness: 0.35,
      });
      const redRibbon = new THREE.MeshStandardMaterial({
        color: 0xd90429,
        roughness: 0.35,
      });

      // Flat wide circular brim
      const brimGeom = new THREE.CylinderGeometry(0.34, 0.34, 0.022, 24);
      const brim = new THREE.Mesh(brimGeom, silkBlack);
      brim.position.y = 0.01;
      root.add(brim);

      // Tall top hat cylinder
      const cylGeom = new THREE.CylinderGeometry(0.21, 0.19, 0.28, 20);
      const cyl = new THREE.Mesh(cylGeom, silkBlack);
      cyl.position.y = 0.15;
      root.add(cyl);

      // Crimson silk ribbon band at base
      const bandGeom = new THREE.CylinderGeometry(0.195, 0.192, 0.05, 20, 1, true);
      const band = new THREE.Mesh(bandGeom, redRibbon);
      band.position.y = 0.04;
      root.add(band);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 6. FESTIVE PARTY CONE // Bright polka-dot cone with fluffy pom-pom
    // ══════════════════════════════════════════════════════════════════
    case 'hat_party': {
      const coneMat = new THREE.MeshStandardMaterial({
        color: 0xffea00,
        roughness: 0.4,
      });
      const pomMat = new THREE.MeshStandardMaterial({
        color: 0xff1493,
        roughness: 0.6,
      });
      const blueDotMat = new THREE.MeshStandardMaterial({
        color: 0x00d2ff,
        roughness: 0.3,
      });

      // Party cone tilted back playfully
      const coneGeom = new THREE.ConeGeometry(0.16, 0.32, 16);
      const cone = new THREE.Mesh(coneGeom, coneMat);
      cone.position.set(0, 0.14, -0.02);
      cone.rotation.x = -0.15;
      root.add(cone);

      // Fluffy top pom-pom
      const pomGeom = new THREE.SphereGeometry(0.045, 8, 8);
      const pom = new THREE.Mesh(pomGeom, pomMat);
      pom.position.set(0, 0.30, -0.045);
      root.add(pom);

      // Cute polka dots on cone
      const dotCoords = [
        [0.08, 0.10, 0.08],
        [-0.08, 0.12, 0.07],
        [0.0, 0.20, 0.06],
        [-0.05, 0.06, 0.11],
        [0.05, 0.07, 0.11],
      ];
      dotCoords.forEach(([dx, dy, dz]) => {
        const dotGeom = new THREE.SphereGeometry(0.022, 6, 6);
        const dot = new THREE.Mesh(dotGeom, blueDotMat);
        dot.position.set(dx, dy, dz);
        root.add(dot);
      });
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. MASTER CHEF TOQUE // Tall puffy pleated white chef hat
    // ══════════════════════════════════════════════════════════════════
    case 'hat_chef': {
      const whiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
      });

      // Bottom fitted cylindrical headband
      const bandGeom = new THREE.CylinderGeometry(0.20, 0.20, 0.07, 18);
      const band = new THREE.Mesh(bandGeom, whiteMat);
      band.position.y = 0.02;
      root.add(band);

      // Puffy pleated middle volume
      const midGeom = new THREE.CylinderGeometry(0.29, 0.21, 0.18, 18);
      const mid = new THREE.Mesh(midGeom, whiteMat);
      mid.position.y = 0.135;
      root.add(mid);

      // Fluffy top dome puffs
      const topGeom = new THREE.SphereGeometry(0.28, 14, 10);
      topGeom.scale(1.0, 0.55, 1.0);
      const top = new THREE.Mesh(topGeom, whiteMat);
      top.position.y = 0.23;
      root.add(top);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 8. RUBBER DUCKY // Cute yellow bath ducky perched on head
    // ══════════════════════════════════════════════════════════════════
    case 'hat_duck': {
      const yellowMat = new THREE.MeshStandardMaterial({
        color: 0xffd000,
        roughness: 0.35,
      });
      const orangeBeakMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        roughness: 0.4,
      });
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

      // Duck round body
      const bodyGeom = new THREE.SphereGeometry(0.14, 12, 10);
      bodyGeom.scale(1.0, 0.85, 1.2);
      const body = new THREE.Mesh(bodyGeom, yellowMat);
      body.position.set(0, 0.065, -0.02);
      root.add(body);

      // Duck tail flick
      const tailGeom = new THREE.ConeGeometry(0.06, 0.10, 6);
      const tail = new THREE.Mesh(tailGeom, yellowMat);
      tail.position.set(0, 0.085, -0.16);
      tail.rotation.x = -Math.PI / 3;
      root.add(tail);

      // Duck cute round head
      const headGeom = new THREE.SphereGeometry(0.095, 10, 10);
      const head = new THREE.Mesh(headGeom, yellowMat);
      head.position.set(0, 0.165, 0.07);
      root.add(head);

      // Orange bill / beak
      const beakGeom = new THREE.CylinderGeometry(0.025, 0.05, 0.07, 8);
      beakGeom.scale(1.3, 0.45, 1.0);
      beakGeom.rotateX(Math.PI / 2);
      const beak = new THREE.Mesh(beakGeom, orangeBeakMat);
      beak.position.set(0, 0.15, 0.17);
      root.add(beak);

      // Two cute black eyes
      for (const side of [-1, 1]) {
        const eyeGeom = new THREE.SphereGeometry(0.016, 6, 6);
        const eye = new THREE.Mesh(eyeGeom, eyeMat);
        eye.position.set(side * 0.065, 0.185, 0.135);
        root.add(eye);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 9. RETRO PROPELLER BEANIE // Multi-color panel cap with spinning propeller!
    // ══════════════════════════════════════════════════════════════════
    case 'hat_propeller': {
      const redMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.4 });
      const blueMat = new THREE.MeshStandardMaterial({ color: 0x007aff, roughness: 0.4 });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });
      const cyanPropMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.25, metalness: 0.4 });

      // Cap hemispherical crown
      const capGeom = new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const cap = new THREE.Mesh(capGeom, redMat);
      cap.position.y = 0.005;
      root.add(cap);

      // Cap front bill / visor
      const visorGeom = new THREE.CylinderGeometry(0.24, 0.24, 0.018, 16, 1, false, 0, Math.PI * 0.7);
      const visor = new THREE.Mesh(visorGeom, blueMat);
      visor.position.set(0, 0.005, 0.05);
      visor.rotation.y = -Math.PI * 0.35;
      root.add(visor);

      // Propeller vertical spindle rod
      const rodGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8);
      const rod = new THREE.Mesh(rodGeom, yellowMat);
      rod.position.y = 0.225;
      root.add(rod);

      // Spinning twin-blade propeller group
      const propGroup = new THREE.Group();
      propGroup.position.y = 0.265;
      for (const side of [-1, 1]) {
        const bladeGeom = new THREE.BoxGeometry(0.16, 0.008, 0.042);
        const blade = new THREE.Mesh(bladeGeom, cyanPropMat);
        blade.position.x = side * 0.08;
        propGroup.add(blade);
      }
      root.add(propGroup);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 10. ARCANE WIZARD HAT // Conical midnight blue hat with crooked tip
    // ══════════════════════════════════════════════════════════════════
    case 'hat_wizard': {
      const clothMat = new THREE.MeshStandardMaterial({
        color: 0x241442,
        roughness: 0.6,
      });
      const goldStarMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        roughness: 0.2,
        metalness: 0.7,
        emissive: 0x443300,
        emissiveIntensity: 0.3,
      });

      // Floppy brim
      const brimGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.025, 20);
      const brim = new THREE.Mesh(brimGeom, clothMat);
      brim.position.y = 0.01;
      brim.rotation.x = -0.06;
      root.add(brim);

      // Lower cone
      const cone1Geom = new THREE.CylinderGeometry(0.12, 0.22, 0.20, 16);
      const cone1 = new THREE.Mesh(cone1Geom, clothMat);
      cone1.position.set(0, 0.11, -0.01);
      root.add(cone1);

      // Crooked bent tip
      const cone2Geom = new THREE.ConeGeometry(0.12, 0.22, 14);
      const cone2 = new THREE.Mesh(cone2Geom, clothMat);
      cone2.position.set(0.04, 0.27, -0.07);
      cone2.rotation.x = -0.45;
      cone2.rotation.z = 0.25;
      root.add(cone2);

      // Golden moon / star ornament on front
      const starGeom = new THREE.TorusGeometry(0.04, 0.015, 6, 12, Math.PI * 1.5);
      const star = new THREE.Mesh(starGeom, goldStarMat);
      star.position.set(0, 0.11, 0.18);
      star.rotation.z = Math.PI * 0.3;
      root.add(star);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 11. STREETWEAR KNIT BEANIE // Slouch knit beanie with folded cuff
    // ══════════════════════════════════════════════════════════════════
    case 'hat_beanie': {
      const knitOrange = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        roughness: 0.8,
      });
      const cuffDark = new THREE.MeshStandardMaterial({
        color: 0xd94e00,
        roughness: 0.85,
      });

      // Folded thick cuff ring
      const cuffGeom = new THREE.TorusGeometry(0.22, 0.048, 8, 20);
      const cuff = new THREE.Mesh(cuffGeom, cuffDark);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = 0.015;
      root.add(cuff);

      // Rounded slouch dome drooping backward
      const domeGeom = new THREE.SphereGeometry(0.23, 14, 12);
      domeGeom.scale(1.0, 1.0, 1.2);
      const dome = new THREE.Mesh(domeGeom, knitOrange);
      dome.position.set(0, 0.07, -0.05);
      root.add(dome);

      // Pom-pom ball on back tip
      const pomGeom = new THREE.SphereGeometry(0.05, 8, 8);
      const pom = new THREE.Mesh(pomGeom, cuffDark);
      pom.position.set(0, 0.10, -0.25);
      root.add(pom);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 12. BLOOMING DAISY SPROUT // Cute plant sprout with sunny daisy
    // ══════════════════════════════════════════════════════════════════
    case 'hat_flower': {
      const stemGreen = new THREE.MeshStandardMaterial({ color: 0x48bb78, roughness: 0.4 });
      const petalWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
      const flowerCenter = new THREE.MeshStandardMaterial({
        color: 0xffd000,
        roughness: 0.2,
        emissive: 0x553300,
        emissiveIntensity: 0.3,
      });

      // Soil root base pebble
      const baseGeom = new THREE.SphereGeometry(0.08, 8, 8);
      baseGeom.scale(1.5, 0.3, 1.5);
      const base = new THREE.Mesh(baseGeom, stemGreen);
      base.position.y = 0.005;
      root.add(base);

      // Curved plant stalk
      const stalkGeom = new THREE.CylinderGeometry(0.018, 0.024, 0.22, 8);
      const stalk = new THREE.Mesh(stalkGeom, stemGreen);
      stalk.position.set(0.02, 0.115, 0.01);
      stalk.rotation.z = -0.15;
      root.add(stalk);

      // Two cute green leaves
      for (const side of [-1, 1]) {
        const leafGeom = new THREE.SphereGeometry(0.045, 6, 6);
        leafGeom.scale(1.8, 0.25, 0.8);
        const leaf = new THREE.Mesh(leafGeom, stemGreen);
        leaf.position.set(side * 0.08, 0.09, 0.01);
        leaf.rotation.z = side * 0.4;
        leaf.rotation.y = side * 0.3;
        root.add(leaf);
      }

      // Yellow flower center
      const centerGeom = new THREE.SphereGeometry(0.042, 8, 8);
      const center = new THREE.Mesh(centerGeom, flowerCenter);
      center.position.set(0.05, 0.24, 0.02);
      root.add(center);

      // 6 white daisy petals
      const numPetals = 6;
      for (let i = 0; i < numPetals; i++) {
        const angle = (i / numPetals) * Math.PI * 2;
        const petalGeom = new THREE.SphereGeometry(0.034, 6, 6);
        petalGeom.scale(1.5, 0.3, 0.8);
        const petal = new THREE.Mesh(petalGeom, petalWhite);
        petal.position.set(
          0.05 + Math.cos(angle) * 0.065,
          0.24 + Math.sin(angle) * 0.065,
          0.02
        );
        petal.rotation.z = angle;
        root.add(petal);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 13. CHRISTMAS SANTA CAP // Velvet red cone with white fur trim
    // ══════════════════════════════════════════════════════════════════
    case 'hat_santa': {
      const redVelvet = new THREE.MeshStandardMaterial({ color: 0xd90429, roughness: 0.5 });
      const whiteFur = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });

      // Thick white fluffy fur brim
      const furGeom = new THREE.TorusGeometry(0.22, 0.052, 8, 18);
      const fur = new THREE.Mesh(furGeom, whiteFur);
      fur.rotation.x = Math.PI / 2;
      fur.position.y = 0.015;
      root.add(fur);

      // Red cone curving to the right side
      const coneGeom = new THREE.ConeGeometry(0.20, 0.32, 16);
      const cone = new THREE.Mesh(coneGeom, redVelvet);
      cone.position.set(0.08, 0.14, -0.02);
      cone.rotation.z = -0.45;
      cone.rotation.x = -0.15;
      root.add(cone);

      // White fluffy bobble / puff ball hanging down
      const puffGeom = new THREE.SphereGeometry(0.06, 10, 10);
      const puff = new THREE.Mesh(puffGeom, whiteFur);
      puff.position.set(0.22, 0.06, -0.05);
      root.add(puff);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 14. NORDIC VIKING HELMET // Heavy iron cap with curved white horns
    // ══════════════════════════════════════════════════════════════════
    case 'hat_viking': {
      const ironMat = new THREE.MeshStandardMaterial({
        color: 0x5a6270,
        metalness: 0.8,
        roughness: 0.35,
      });
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xc8963e,
        metalness: 0.85,
        roughness: 0.25,
      });
      const hornMat = new THREE.MeshStandardMaterial({
        color: 0xf4eedb,
        roughness: 0.45,
      });

      // Iron half-dome skullcap
      const domeGeom = new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const dome = new THREE.Mesh(domeGeom, ironMat);
      dome.position.y = 0.005;
      root.add(dome);

      // Brass reinforced ridge band
      const bandGeom = new THREE.TorusGeometry(0.232, 0.025, 8, 20);
      const band = new THREE.Mesh(bandGeom, brassMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.01;
      root.add(band);

      // Two cute curved horns on flanks
      for (const side of [-1, 1]) {
        // Brass horn socket
        const socketGeom = new THREE.CylinderGeometry(0.045, 0.055, 0.035, 10);
        socketGeom.rotateZ(side * Math.PI / 3);
        const socket = new THREE.Mesh(socketGeom, brassMat);
        socket.position.set(side * 0.20, 0.105, 0);
        root.add(socket);

        // Curved horn cone
        const hornGeom = new THREE.ConeGeometry(0.045, 0.22, 8);
        const horn = new THREE.Mesh(hornGeom, hornMat);
        horn.position.set(side * 0.27, 0.195, 0.02);
        horn.rotation.z = -side * 0.65;
        horn.rotation.x = 0.25;
        root.add(horn);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 15. PIRATE TRICORNE // 3-cornered captain hat with gold skull trim
    // ══════════════════════════════════════════════════════════════════
    case 'hat_pirate': {
      const blackMat = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.5 });
      const goldTrimMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
      const skullMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 });

      // Triangular pinched brim
      const brimGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.06, 3);
      brimGeom.scale(1.1, 1.0, 1.0);
      const brim = new THREE.Mesh(brimGeom, blackMat);
      brim.position.y = 0.02;
      brim.rotation.y = Math.PI;
      root.add(brim);

      // Gold edge trim on brim
      const trimGeom = new THREE.CylinderGeometry(0.365, 0.365, 0.02, 3, 1, true);
      trimGeom.scale(1.1, 1.0, 1.0);
      const trim = new THREE.Mesh(trimGeom, goldTrimMat);
      trim.position.y = 0.04;
      trim.rotation.y = Math.PI;
      root.add(trim);

      // Inner crown
      const crownGeom = new THREE.CylinderGeometry(0.18, 0.20, 0.14, 14);
      const crown = new THREE.Mesh(crownGeom, blackMat);
      crown.position.y = 0.07;
      root.add(crown);

      // White jolly roger skull badge on front
      const skullGeom = new THREE.SphereGeometry(0.038, 8, 8);
      const skull = new THREE.Mesh(skullGeom, skullMat);
      skull.position.set(0, 0.055, 0.24);
      root.add(skull);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 16. ANGELIC NEON HALO // Floating glowing ring above head
    // ══════════════════════════════════════════════════════════════════
    case 'hat_halo': {
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0xffea00,
        emissive: 0xffea00,
        emissiveIntensity: 0.9,
        roughness: 0.1,
        metalness: 0.3,
      });

      // Floating golden torus angled slightly forward
      const haloGeom = new THREE.TorusGeometry(0.22, 0.026, 10, 24);
      const halo = new THREE.Mesh(haloGeom, haloMat);
      halo.rotation.x = Math.PI / 2 + 0.15;
      halo.position.set(0, 0.22, 0.02);
      root.add(halo);

      // Subtle invisible stem keeping it anchored
      const stemGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.20, 6);
      const stemMat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.25 });
      const stem = new THREE.Mesh(stemGeom, stemMat);
      stem.position.set(0, 0.10, -0.16);
      root.add(stem);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 17. CYBER DEVIL HORNS // Glowing neon magenta/crimson horns
    // ══════════════════════════════════════════════════════════════════
    case 'hat_cyber_horns': {
      const hornMat = new THREE.MeshStandardMaterial({
        color: 0xff0055,
        emissive: 0xff0055,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      });
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x111218,
        metalness: 0.8,
        roughness: 0.3,
      });

      for (const side of [-1, 1]) {
        // Tech base mounting disc
        const discGeom = new THREE.CylinderGeometry(0.045, 0.055, 0.02, 10);
        const disc = new THREE.Mesh(discGeom, baseMat);
        disc.position.set(side * 0.14, 0.005, 0.05);
        disc.rotation.z = -side * 0.25;
        root.add(disc);

        // Curved sharp horn
        const hornGeom = new THREE.ConeGeometry(0.042, 0.18, 8);
        const horn = new THREE.Mesh(hornGeom, hornMat);
        horn.position.set(side * 0.17, 0.095, 0.06);
        horn.rotation.z = -side * 0.45;
        horn.rotation.x = 0.20;
        root.add(horn);
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 18. FIESTA SOMBRERO // Wide woven straw hat with colorful zigzag trim
    // ══════════════════════════════════════════════════════════════════
    case 'hat_sombrero': {
      const strawMat = new THREE.MeshStandardMaterial({ color: 0xecd599, roughness: 0.75 });
      const redTrim = new THREE.MeshStandardMaterial({ color: 0xef233c, roughness: 0.5 });
      const greenTrim = new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.5 });

      // Massive wide brim with upturned lip
      const brimGeom = new THREE.CylinderGeometry(0.44, 0.44, 0.025, 24);
      const brim = new THREE.Mesh(brimGeom, strawMat);
      brim.position.y = 0.01;
      root.add(brim);

      // Conical tall crown
      const crownGeom = new THREE.CylinderGeometry(0.12, 0.20, 0.22, 18);
      const crown = new THREE.Mesh(crownGeom, strawMat);
      crown.position.y = 0.115;
      root.add(crown);

      // Colored zigzag trims
      const band1Geom = new THREE.CylinderGeometry(0.205, 0.205, 0.035, 18, 1, true);
      const band1 = new THREE.Mesh(band1Geom, redTrim);
      band1.position.y = 0.03;
      root.add(band1);

      const band2Geom = new THREE.CylinderGeometry(0.165, 0.165, 0.035, 18, 1, true);
      const band2 = new THREE.Mesh(band2Geom, greenTrim);
      band2.position.y = 0.085;
      root.add(band2);
      break;
    }

    // ══════════════════════════════════════════════════════════════════
    // 19. HIGHWAY PATROL CAP // Sharp navy officer visor cap with badge
    // ══════════════════════════════════════════════════════════════════
    case 'hat_police': {
      const navyMat = new THREE.MeshStandardMaterial({ color: 0x14213d, roughness: 0.4 });
      const glossBlackMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0f, roughness: 0.1, metalness: 0.3 });
      const silverBadgeMat = new THREE.MeshStandardMaterial({ color: 0xe5e5e5, metalness: 0.9, roughness: 0.15 });

      // Peaked cap crown (slanted upward toward front)
      const capGeom = new THREE.CylinderGeometry(0.26, 0.21, 0.12, 18);
      const cap = new THREE.Mesh(capGeom, navyMat);
      cap.position.set(0, 0.05, 0.02);
      cap.rotation.x = -0.15;
      root.add(cap);

      // Shiny patent leather visor / bill
      const visorGeom = new THREE.CylinderGeometry(0.26, 0.26, 0.016, 18, 1, false, 0, Math.PI * 0.7);
      const visor = new THREE.Mesh(visorGeom, glossBlackMat);
      visor.position.set(0, 0.005, 0.10);
      visor.rotation.y = -Math.PI * 0.35;
      visor.rotation.x = 0.25;
      root.add(visor);

      // Silver officer shield badge on front
      const badgeGeom = new THREE.BoxGeometry(0.06, 0.06, 0.018);
      const badge = new THREE.Mesh(badgeGeom, silverBadgeMat);
      badge.position.set(0, 0.085, 0.245);
      badge.rotation.x = -0.15;
      root.add(badge);
      break;
    }

    default:
      return null;
  }

  return root;
}

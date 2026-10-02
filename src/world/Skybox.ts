import * as THREE from 'three';

export class SkyWorld {
  public cloudGroup: THREE.Group;
  public islandGroup: THREE.Group;
  private balloons: THREE.Group[] = [];

  constructor(scene: THREE.Scene) {
    // 1. Rotating Atmosphere Group (Only clouds drift very gently)
    this.cloudGroup = new THREE.Group();
    scene.add(this.cloudGroup);

    // 2. Static Horizon World Group (Islands NEVER rotate or drift into the track)
    this.islandGroup = new THREE.Group();
    scene.add(this.islandGroup);

    this.createClouds();
    this.createFloatingIslands();
    this.createHotAirBalloons();
  }

  // ── 1. ULTRA-HIGH-PERFORMANCE INSTANCED CLOUDS (1 Draw Call for all clouds!) ─
  private createClouds() {
    const puffGeom = new THREE.DodecahedronGeometry(1, 1);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      depthWrite: false, // Prevents depth-buffer thrashing and sorting stalls on mobile GPUs
      flatShading: true,
    });

    interface PuffData {
      pos: THREE.Vector3;
      scale: THREE.Vector3;
    }

    const allPuffs: PuffData[] = [];

    // Helper to generate cloud cluster puffs
    const addCluster = (cx: number, cy: number, cz: number, scaleMultiplier: number = 1.0) => {
      const numPuffs = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < numPuffs; j++) {
        const s = (16 + Math.random() * 20) * scaleMultiplier;
        const px = cx + (Math.random() - 0.5) * 28 * scaleMultiplier;
        const py = cy + (Math.random() - 0.5) * 8 * scaleMultiplier;
        const pz = cz + (Math.random() - 0.5) * 28 * scaleMultiplier;
        allPuffs.push({
          pos: new THREE.Vector3(px, py, pz),
          scale: new THREE.Vector3(s, s * (0.42 + Math.random() * 0.35), s),
        });
      }
    };

    // A. Lower Cloud Sea (Sitting below track: Y = -35 to -60, Radius = 120 to 600)
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const radius = 120 + Math.random() * 480;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -35 - Math.random() * 25;
      addCluster(x, y, z, 1.1);
    }

    // B. Upper Sky Cloud Layer (High overhead: Y = +55 to +110, Radius = 240 to 650)
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const radius = 240 + Math.random() * 400;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 55 + Math.random() * 55;
      addCluster(x, y, z, 1.3);
    }

    // C. Scenic Fluffy Horizon Clouds (Around the track outer perimeter: Y = -16 to -25, Radius = 160 to 380)
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const radius = 160 + Math.random() * 220;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -20 + Math.random() * 6;
      addCluster(x, y, z, 0.9);
    }

    // Single InstancedMesh: 250+ cloud puffs drawn in EXACTLY 1 GPU DRAW CALL!
    const instancedClouds = new THREE.InstancedMesh(puffGeom, cloudMat, allPuffs.length);
    instancedClouds.castShadow = false;
    instancedClouds.receiveShadow = false;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < allPuffs.length; i++) {
      const p = allPuffs[i];
      dummy.position.copy(p.pos);
      dummy.scale.copy(p.scale);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      instancedClouds.setMatrixAt(i, dummy.matrix);
    }
    instancedClouds.instanceMatrix.needsUpdate = true;

    this.cloudGroup.add(instancedClouds);
  }

  // ── 2. STATIC FLOATING SKY ISLANDS (Completely Stationary, Zero Waterfall) ────
  private createFloatingIslands() {
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
      color: 0x8a6d4d, // Timber
      flatShading: true,
    });

    const billboardDefs = [
      {
        text: 'JUMP // RACE // REPEAT',
        subtext: 'SKY DASH GRAND PRIX',
        arrow: '>>',
        islandIdx: 0,
      },
      {
        text: 'HIGHER  FASTER  FURTHER',
        subtext: 'CLOUD SUMMIT // APEX',
        arrow: '▲▲',
        islandIdx: 1,
      },
    ];

    // Static island horizon positions placed far outside the racing perimeter (500m - 750m away)
    // ZERO clipping with Classic (1,750m) or Hardcore (2,115m) circuits!
    const islandConfigs = [
      {
        pos: new THREE.Vector3(-520, 65, 540),
        radius: 48,
        depth: 70,
        trees: 7,
      },
      {
        pos: new THREE.Vector3(560, 80, -180),
        radius: 54,
        depth: 85,
        trees: 8,
      },
      {
        pos: new THREE.Vector3(-320, 70, -680),
        radius: 50,
        depth: 75,
        trees: 7,
      },
      {
        pos: new THREE.Vector3(-640, 55, 140),
        radius: 44,
        depth: 65,
        trees: 6,
      },
      {
        pos: new THREE.Vector3(260, 110, 680),
        radius: 56,
        depth: 90,
        trees: 8,
      },
      {
        pos: new THREE.Vector3(520, 50, 520),
        radius: 42,
        depth: 60,
        trees: 6,
      },
    ];

    islandConfigs.forEach((cfg, islandIdx) => {
      const { pos, radius, depth, trees } = cfg;
      const island = new THREE.Group();
      island.position.copy(pos);

      // A. Layered Tapered Rock Underside (Faceted low-poly cliff base)
      const rockSegments = 6;
      const tier1 = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.95, radius * 0.65, depth * 0.45, rockSegments),
        rockMat
      );
      tier1.position.y = -depth * 0.22;
      tier1.castShadow = false;
      tier1.receiveShadow = false;
      island.add(tier1);

      const tier2 = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.65, radius * 0.28, depth * 0.35, rockSegments),
        rockMat
      );
      tier2.position.y = -depth * 0.58;
      tier2.castShadow = false;
      tier2.receiveShadow = false;
      island.add(tier2);

      const tier3 = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.28, depth * 0.30, rockSegments),
        rockMat
      );
      tier3.rotation.x = Math.PI;
      tier3.position.y = -depth * 0.88;
      tier3.castShadow = false;
      tier3.receiveShadow = false;
      island.add(tier3);

      // B. Lush Green Grass Cap
      const grassDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 1.05, radius * 0.98, 3.5, rockSegments),
        grassMat
      );
      grassDeck.position.y = 1.5;
      grassDeck.castShadow = false;
      grassDeck.receiveShadow = false;
      island.add(grassDeck);

      const hill = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.55, radius * 0.75, 4.0, rockSegments),
        grassMat
      );
      hill.position.y = 4.5;
      hill.castShadow = false;
      hill.receiveShadow = false;
      island.add(hill);

      // C. Stylized Low-Poly Pine Trees
      for (let t = 0; t < trees; t++) {
        const treeAngle = (t / trees) * Math.PI * 2 + 0.3;
        const treeDist = 0.45 * radius;
        const tx = Math.cos(treeAngle) * treeDist;
        const tz = Math.sin(treeAngle) * treeDist;
        const treeScale = 0.9;

        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35 * treeScale, 0.5 * treeScale, 3.0 * treeScale, 5),
          woodMat
        );
        trunk.position.set(tx, 3.2 + 1.5 * treeScale, tz);
        trunk.castShadow = false;
        trunk.receiveShadow = false;
        island.add(trunk);

        for (let tier = 0; tier < 2; tier++) {
          const coneH = 3.5 * treeScale;
          const coneR = (2.4 - tier * 0.6) * treeScale;
          const canopy = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 5), foliageMat);
          canopy.position.set(tx, 3.2 + (3.2 + tier * 2.2) * treeScale, tz);
          canopy.castShadow = false;
          canopy.receiveShadow = false;
          island.add(canopy);
        }
      }

      // D. Fantasy Sky Citadel Towers
      if (islandIdx === 0 || islandIdx === 1 || islandIdx === 4) {
        const twX = -radius * 0.22;
        const twZ = -radius * 0.18;
        const twH = 9.0;
        const twW = 3.2;

        const tower = new THREE.Mesh(new THREE.BoxGeometry(twW, twH, twW), woodMat);
        tower.position.set(twX, 3.5 + twH * 0.5, twZ);
        tower.castShadow = false;
        tower.receiveShadow = false;
        island.add(tower);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(twW * 0.85, 4.0, 4), rockMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.set(twX, 3.5 + twH + 2.0, twZ);
        roof.castShadow = false;
        roof.receiveShadow = false;
        island.add(roof);
      }

      // E. Race Billboard facing towards track
      const bDef = billboardDefs.find((b) => b.islandIdx === islandIdx);
      if (bDef) {
        const bbMesh = this.createIslandBillboard(bDef.text, bDef.subtext, bDef.arrow);
        bbMesh.position.set(8, 8.5, -radius * 0.55);
        bbMesh.rotation.y = Math.atan2(-pos.x, -pos.z);
        island.add(bbMesh);
      }

      // Added to STATIC island group so it NEVER rotates!
      this.islandGroup.add(island);
    });
  }

  // ── 3. STYLIZED RACE BILLBOARDS ─────────────────────────────────────
  private createIslandBillboard(mainText: string, subText: string, arrow: string): THREE.Group {
    const group = new THREE.Group();

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0e1828';
    ctx.fillRect(0, 0, 512, 256);

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 498, 242);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, 476, 220);

    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(25, 25, 462, 8);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(mainText, 256, 105);

    ctx.fillStyle = '#00f0ff';
    ctx.font = '900 64px "Arial Black", Impact, sans-serif';
    ctx.fillText(arrow, 256, 175);

    ctx.fillStyle = '#ffe600';
    ctx.font = 'bold 20px "Arial", sans-serif';
    ctx.fillText(subText, 256, 222);

    const tex = new THREE.CanvasTexture(canvas);
    const boardMat = new THREE.MeshBasicMaterial({ map: tex });
    const board = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 0.5), boardMat);
    board.position.y = 5.5;
    group.add(board);

    const postMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 7, 6), postMat);
    post1.position.set(-6, 2.5, 0);
    group.add(post1);

    const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 7, 6), postMat);
    post2.position.set(6, 2.5, 0);
    group.add(post2);

    return group;
  }

  // ── 4. DISTANT HOT AIR BALLOONS ─────────────────────────────────────
  private createHotAirBalloons() {
    const balloonConfigs = [
      { pos: new THREE.Vector3(220, 85, -180), color1: 0xff3b30, color2: 0xffffff, scale: 1.1 },
      { pos: new THREE.Vector3(-250, 95, 260), color1: 0x00c7be, color2: 0xffcc00, scale: 0.9 },
    ];

    balloonConfigs.forEach((cfg) => {
      const bGroup = new THREE.Group();
      bGroup.position.copy(cfg.pos);

      const envGeo = new THREE.SphereGeometry(10 * cfg.scale, 8, 8);
      envGeo.scale(1.0, 1.35, 1.0);
      const envMat = new THREE.MeshLambertMaterial({
        color: cfg.color1,
        flatShading: true,
      });
      const envelope = new THREE.Mesh(envGeo, envMat);
      bGroup.add(envelope);

      const stripeGeo = new THREE.CylinderGeometry(9.8 * cfg.scale, 9.8 * cfg.scale, 4 * cfg.scale, 8);
      const stripeMat = new THREE.MeshLambertMaterial({
        color: cfg.color2,
        flatShading: true,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 1.0 * cfg.scale;
      bGroup.add(stripe);

      const basketGeo = new THREE.BoxGeometry(3 * cfg.scale, 2.5 * cfg.scale, 3 * cfg.scale);
      const basketMat = new THREE.MeshLambertMaterial({ color: 0x6e4e2a, flatShading: true });
      const basket = new THREE.Mesh(basketGeo, basketMat);
      basket.position.y = -16 * cfg.scale;
      bGroup.add(basket);

      this.balloons.push(bGroup);
      this.islandGroup.add(bGroup);
    });
  }

  public update(dt: number) {
    // Only the distant cloud atmosphere rotates very gently
    this.cloudGroup.rotation.y += dt * 0.0016;

    const time = performance.now() * 0.001;
    this.balloons.forEach((b, idx) => {
      b.position.y += Math.sin(time * 0.8 + idx * 2.0) * (dt * 1.5);
    });
  }
}

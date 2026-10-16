import * as THREE from 'three';

export class Engine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public clock: THREE.Clock;

  public dirLight!: THREE.DirectionalLight;
  public currentPreset: 'high' | 'low' = 'high';
  public shadowsEnabled: boolean = true;

  private onUpdateCallbacks: ((dt: number) => void)[] = [];
  private isRunning: boolean = false;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2693ff');

    // Detect mobile once — used for all conditional optimizations
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 840 || window.innerHeight <= 560;

    // Same exponential fog on ALL devices — consistent atmospheric depth look
    this.scene.fog = new THREE.FogExp2('#c0e5ff', 0.0018);

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    // Antialias ON everywhere — visual quality matches original CHECK version
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });

    // Mobile: 1.3 DPR — crisp retina look with 25% lower GPU fillrate load. PC: 2.0 DPR.
    const dpr = isMobile ? Math.min(window.devicePixelRatio || 1, 1.3) : Math.min(window.devicePixelRatio || 1, 2.0);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // ── FULL QUALITY SHADOWS ON ALL DEVICES (Cute 3D aesthetics!) ──
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // Soft shadows on mobile too
    // ACES Filmic tone mapping on ALL devices — same rich cinematic color grading
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.8, 800);
    this.camera.position.set(0, 10, 20);

    this.clock = new THREE.Clock();

    this.setupLighting(isMobile);
    this.setupResize();
  }

  private setupLighting(isMobile: boolean = false) {
    // Ambient light for soft filling
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    // Hemisphere sky/ground gradient light
    const hemiLight = new THREE.HemisphereLight(0x70b5ff, 0x3d7040, 0.5);
    this.scene.add(hemiLight);

    // Warm directional sun
    const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
    dirLight.position.set(60, 120, 50);
    dirLight.castShadow = true;

    // Shadow map: 1024px on all devices — same shadow quality everywhere
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = isMobile ? 220 : 300;
    const shadowDist = isMobile ? 38 : 70;
    dirLight.shadow.camera.left = -shadowDist;
    dirLight.shadow.camera.right = shadowDist;
    dirLight.shadow.camera.top = shadowDist;
    dirLight.shadow.camera.bottom = -shadowDist;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.02;

    this.dirLight = dirLight;
    this.scene.add(dirLight);
    this.scene.add(dirLight.target);
  }

  private setupResize() {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);

      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || width <= 840 || height <= 560;
      if (this.currentPreset === 'low') {
        this.renderer.setPixelRatio(1.0);
      } else {
        const dpr = isMobile ? Math.min(window.devicePixelRatio || 1, 1.3) : Math.min(window.devicePixelRatio || 1, 2.0);
        this.renderer.setPixelRatio(dpr);
      }
    });
  }

  public setGraphicsPreset(preset: 'high' | 'low') {
    this.currentPreset = preset;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth <= 840 || window.innerHeight <= 560;
    if (preset === 'low') {
      this.renderer.setPixelRatio(1.0);
      this.setShadows(false);
    } else {
      const dpr = isMobile ? Math.min(window.devicePixelRatio || 1, 1.3) : Math.min(window.devicePixelRatio || 1, 2.0);
      this.renderer.setPixelRatio(dpr);
      this.setShadows(true);
    }
  }

  public setShadows(enabled: boolean) {
    this.shadowsEnabled = enabled;
    this.renderer.shadowMap.enabled = enabled;
    if (this.dirLight) {
      this.dirLight.castShadow = enabled;
    }
  }

  public onUpdate(callback: (dt: number) => void) {
    this.onUpdateCallbacks.push(callback);
  }

  public start() {
    this.isRunning = true;
    this.clock.start();

    // High-precision FPS tracking variables
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsAccumTime = 0;

    const fpsValEl = document.getElementById('perf-fps-val');
    const fpsMsEl = document.getElementById('perf-fps-ms');
    const fpsDotEl = document.getElementById('perf-fps-dot');

    const TARGET_FRAME_MS = 1000 / 60; // 16.666ms
    let lastRenderTime = performance.now();

    const loop = (nowTime?: number) => {
      if (!this.isRunning) return;
      requestAnimationFrame(loop);

      const curTime = nowTime || performance.now();
      const elapsed = curTime - lastRenderTime;
      // 60 FPS lock: On 90Hz/120Hz/144Hz displays, skip sub-frames to keep 60 FPS flat (cool phone, fair racing)
      if (elapsed < TARGET_FRAME_MS - 1.5) {
        return;
      }
      lastRenderTime = curTime - (elapsed % TARGET_FRAME_MS);

      // Real-time FPS Calculation
      const now = performance.now();
      const frameMs = now - lastTime;
      lastTime = now;

      frameCount++;
      fpsAccumTime += frameMs;

      // Update tracker every 200ms (5 times a second) for smooth, flicker-free reading
      if (fpsAccumTime >= 200) {
        const currentFps = Math.round((frameCount * 1000) / fpsAccumTime);
        const avgMs = (fpsAccumTime / frameCount).toFixed(1);
        frameCount = 0;
        fpsAccumTime = 0;

        if (fpsValEl) {
          fpsValEl.textContent = `${currentFps}`;
          fpsValEl.style.color = '#000';
        }
        if (fpsMsEl) {
          fpsMsEl.textContent = `${avgMs}ms`;
        }
        if (fpsDotEl) {
          fpsDotEl.style.color = '#000';
        }
      }

      // Clamp delta time to 0.05s to prevent physics explosion if stutter occurs
      let dt = this.clock.getDelta();
      if (dt > 0.05) dt = 0.05;

      for (const cb of this.onUpdateCallbacks) {
        cb(dt);
      }

      this.renderer.render(this.scene, this.camera);
    };

    requestAnimationFrame(loop);
  }

  public stop() {
    this.isRunning = false;
  }
}

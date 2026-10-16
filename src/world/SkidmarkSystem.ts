import * as THREE from 'three';

interface SkidSegmentMeta {
  active: boolean;
  birthTime: number;
  baseAlpha: number;
}

export class SkidmarkSystem {
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private alphas: Float32Array;
  private segmentMetas: SkidSegmentMeta[];
  private readonly MAX_SEGMENTS: number;
  private readonly isMobile: boolean;
  private insertIdx: number = 0;
  private activeCount: number = 0;
  private fadeThrottle: number = 0;

  // Track previous position per wheel ID to connect smooth ribbon quads
  private wheelStates: Map<string, THREE.Vector3> = new Map();
  private wheelConnected: Set<string> = new Set();

  private static readonly _skidDir = new THREE.Vector3();
  private static readonly _skidBinormal = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.isMobile = typeof navigator !== 'undefined' && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (typeof window !== 'undefined' && (window.innerWidth <= 840 || window.innerHeight <= 560)));
    this.MAX_SEGMENTS = this.isMobile ? 260 : 700;
    this.geometry = new THREE.BufferGeometry();
    const vertCount = this.MAX_SEGMENTS * 4;
    const indexCount = this.MAX_SEGMENTS * 6;

    this.positions = new Float32Array(vertCount * 3);
    this.alphas = new Float32Array(vertCount);
    const indices = new Uint16Array(indexCount);

    this.segmentMetas = new Array(this.MAX_SEGMENTS);
    for (let i = 0; i < this.MAX_SEGMENTS; i++) {
      this.segmentMetas[i] = { active: false, birthTime: 0, baseAlpha: 0.75 };

      // Pre-compute quad triangle indices
      const vOffset = i * 4;
      const iOffset = i * 6;
      indices[iOffset + 0] = vOffset + 0;
      indices[iOffset + 1] = vOffset + 1;
      indices[iOffset + 2] = vOffset + 2;
      indices[iOffset + 3] = vOffset + 2;
      indices[iOffset + 4] = vOffset + 1;
      indices[iOffset + 5] = vOffset + 3;
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    // High-performance procedural rubber shader (Single draw-call, zero textures, zero z-fighting)
    const vertShader = `
      attribute float alpha;
      varying float vAlpha;
      void main() {
        vAlpha = alpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragShader = `
      varying float vAlpha;
      uniform vec3 uColor;
      void main() {
        if (vAlpha <= 0.01) discard;
        gl_FragColor = vec4(uColor, vAlpha);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader: vertShader,
      fragmentShader: fragShader,
      uniforms: {
        uColor: { value: new THREE.Color(0x0a0c10) }, // Deep charred asphalt rubber black
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false; // Always visible on active racing track
    scene.add(this.mesh);
  }

  /**
   * Adds a continuous rubber skidmark strip segment behind a slipping wheel
   */
  public addSkidPoint(
    wheelId: string,
    currentPos: THREE.Vector3,
    roadNormal: THREE.Vector3,
    intensity: number = 1.0
  ) {
    let prevPos = this.wheelStates.get(wheelId);
    if (!prevPos) {
      prevPos = new THREE.Vector3();
      this.wheelStates.set(wheelId, prevPos);
    }

    if (!this.wheelConnected.has(wheelId)) {
      this.wheelConnected.add(wheelId);
      prevPos.copy(currentPos);
      return;
    }

    const dist = prevPos.distanceTo(currentPos);
    // If vehicle jumped, teleported, or respawned, reset ribbon
    if (dist > 3.8) {
      prevPos.copy(currentPos);
      return;
    }

    // Minimum distance threshold between ribbon segments to prevent polygon bunching
    if (dist < 0.32) {
      return;
    }

    const dir = SkidmarkSystem._skidDir.subVectors(currentPos, prevPos).normalize();
    // Safety check against zero-length direction
    if (dir.lengthSq() < 0.001) return;

    // Lateral binormal perpendicular to driving direction along road normal
    const binormal = SkidmarkSystem._skidBinormal.crossVectors(roadNormal, dir).normalize();
    const halfWidth = 0.17; // 0.34m realistic racing slick tire width
    const offX = roadNormal.x * 0.026;
    const offY = roadNormal.y * 0.026;
    const offZ = roadNormal.z * 0.026;

    const bx = binormal.x * halfWidth;
    const by = binormal.y * halfWidth;
    const bz = binormal.z * halfWidth;

    const segIdx = this.insertIdx;
    const vOffset = segIdx * 4;
    const pOffset = vOffset * 3;

    // Corner 0
    this.positions[pOffset + 0] = prevPos.x + offX - bx;
    this.positions[pOffset + 1] = prevPos.y + offY - by;
    this.positions[pOffset + 2] = prevPos.z + offZ - bz;
    // Corner 1
    this.positions[pOffset + 3] = prevPos.x + offX + bx;
    this.positions[pOffset + 4] = prevPos.y + offY + by;
    this.positions[pOffset + 5] = prevPos.z + offZ + bz;
    // Corner 2
    this.positions[pOffset + 6] = currentPos.x + offX - bx;
    this.positions[pOffset + 7] = currentPos.y + offY - by;
    this.positions[pOffset + 8] = currentPos.z + offZ - bz;
    // Corner 3
    this.positions[pOffset + 9] = currentPos.x + offX + bx;
    this.positions[pOffset + 10] = currentPos.y + offY + by;
    this.positions[pOffset + 11] = currentPos.z + offZ + bz;

    const baseAlpha = THREE.MathUtils.clamp(0.72 * intensity, 0.35, 0.85);
    this.alphas[vOffset + 0] = baseAlpha;
    this.alphas[vOffset + 1] = baseAlpha;
    this.alphas[vOffset + 2] = baseAlpha;
    this.alphas[vOffset + 3] = baseAlpha;

    const meta = this.segmentMetas[segIdx];
    meta.active = true;
    meta.birthTime = performance.now();
    meta.baseAlpha = baseAlpha;

    this.insertIdx = (this.insertIdx + 1) % this.MAX_SEGMENTS;
    if (this.activeCount < this.MAX_SEGMENTS) this.activeCount++;

    prevPos.copy(currentPos);
    this.hasNewPoints = true;
  }

  private hasNewPoints: boolean = false;

  /**
   * Resets connection for a wheel when drift stops or kart becomes airborne
   */
  public breakWheel(wheelId: string) {
    this.wheelConnected.delete(wheelId);
  }

  /**
   * Smoothly fades out persistent skidmarks over 5.5 seconds (asphalt rubber cooling)
   * Batches GPU buffer uploads so WebGL receives at most 1 buffer sync per frame!
   */
  public update(_dt: number) {
    // 1. Single Batched GPU Buffer Sync for newly added drift points
    if (this.hasNewPoints) {
      this.hasNewPoints = false;
      (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.activeCount === 0) return;

    // Throttle GPU alpha decay (20Hz on PC, 12Hz on mobile to save GPU memory bandwidth)
    const throttleInterval = this.isMobile ? 5 : 3;
    this.fadeThrottle = (this.fadeThrottle + 1) % throttleInterval;
    if (this.fadeThrottle !== 0) return;

    const now = performance.now();
    const FADE_DURATION = 5500; // 5.5 seconds persistence
    let hasAlphaChange = false;

    for (let i = 0; i < this.MAX_SEGMENTS; i++) {
      const meta = this.segmentMetas[i];
      if (!meta.active) continue;

      const age = now - meta.birthTime;
      const vOffset = i * 4;

      if (age >= FADE_DURATION) {
        meta.active = false;
        this.alphas[vOffset + 0] = 0;
        this.alphas[vOffset + 1] = 0;
        this.alphas[vOffset + 2] = 0;
        this.alphas[vOffset + 3] = 0;
        hasAlphaChange = true;
      } else {
        const factor = 1.0 - (age / FADE_DURATION);
        // Subtle non-linear fade curve so marks stay crisp for first 3 seconds then dissolve
        const currentAlpha = meta.baseAlpha * Math.pow(factor, 1.25);
        this.alphas[vOffset + 0] = currentAlpha;
        this.alphas[vOffset + 1] = currentAlpha;
        this.alphas[vOffset + 2] = currentAlpha;
        this.alphas[vOffset + 3] = currentAlpha;
        hasAlphaChange = true;
      }
    }

    if (hasAlphaChange) {
      (this.geometry.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

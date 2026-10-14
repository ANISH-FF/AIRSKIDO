import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

/**
 * SparkParticles — High-Performance Zero-GC Particle Engine
 * Uses pre-allocated static ring buffer (zero Array.shift, zero Array.splice, zero runtime heap allocations).
 */
export class SparkParticles {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private particles: Particle[] = [];
  private poolCursor: number = 0;
  private readonly MAX_PARTICLES = 300;
  private hadActiveLastFrame: boolean = false;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.MAX_PARTICLES * 3);
    this.colors = new Float32Array(this.MAX_PARTICLES * 3);
    this.sizes = new Float32Array(this.MAX_PARTICLES);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Pre-allocate fixed particle pool (eliminates GC pauses completely)
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particles.push({
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        r: 1, g: 1, b: 1,
        life: 0,
        maxLife: 0.2,
        size: 1.0,
        active: false,
      });
    }

    // Circle texture for sparks
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.7, 'rgba(230, 240, 255, 0.5)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, material);
    scene.add(this.points);
  }

  // Grounded tire friction sparks (stay low to asphalt behind rear wheels)
  public emitDriftSparks(pos: THREE.Vector3, backwardDir: THREE.Vector3, count: number = 2, tint: number = 0x00d4ff) {
    const colR = ((tint >> 16) & 0xff) / 255;
    const colG = ((tint >> 8) & 0xff) / 255;
    const colB = (tint & 0xff) / 255;

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.poolCursor];
      this.poolCursor = (this.poolCursor + 1) % this.MAX_PARTICLES;

      const lateralSpread = (Math.random() - 0.5) * 2.0;
      const backSpeed = 4.0 + Math.random() * 6.0;

      p.x = pos.x + (Math.random() - 0.5) * 0.15;
      p.y = pos.y - 0.18;
      p.z = pos.z + (Math.random() - 0.5) * 0.15;

      p.vx = backwardDir.x * backSpeed + (-backwardDir.z) * lateralSpread;
      p.vy = 0.2 + Math.random() * 0.6;
      p.vz = backwardDir.z * backSpeed + backwardDir.x * lateralSpread;

      p.r = colR;
      p.g = colG;
      p.b = colB;
      p.life = 0;
      p.maxLife = 0.12 + Math.random() * 0.10;
      p.size = 0.7 + Math.random() * 0.6;
      p.active = true;
    }
  }

  // Multi-directional explosive sparks for vehicle-on-vehicle metal impacts
  public emitImpactSparks(pos: THREE.Vector3, count: number = 25, tint: number = 0xffe600) {
    const colR = ((tint >> 16) & 0xff) / 255;
    const colG = ((tint >> 8) & 0xff) / 255;
    const colB = (tint & 0xff) / 255;

    for (let i = 0; i < count; i++) {
      const p = this.particles[this.poolCursor];
      this.poolCursor = (this.poolCursor + 1) % this.MAX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.2) * Math.PI;
      const speed = 6 + Math.random() * 12;

      p.x = pos.x + (Math.random() - 0.5) * 0.3;
      p.y = pos.y + 0.2;
      p.z = pos.z + (Math.random() - 0.5) * 0.3;

      p.vx = Math.cos(angle) * Math.cos(elev) * speed;
      p.vy = Math.sin(elev) * speed * 0.5 + 2;
      p.vz = Math.sin(angle) * Math.cos(elev) * speed;

      p.r = colR;
      p.g = colG;
      p.b = colB;
      p.life = 0;
      p.maxLife = 0.22 + Math.random() * 0.18;
      p.size = 0.8 + Math.random() * 1.0;
      p.active = true;
    }
  }

  public emitSparks(pos: THREE.Vector3, count: number = 25, tint: number = 0xffe600) {
    this.emitImpactSparks(pos, count, tint);
  }

  public update(dt: number) {
    let hasActive = false;

    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) {
        this.sizes[i] = 0;
        continue;
      }

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.sizes[i] = 0;
        continue;
      }

      hasActive = true;
      p.vy -= 35 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const alpha = 1.0 - (p.life / p.maxLife);
      const idx3 = i * 3;

      this.positions[idx3] = p.x;
      this.positions[idx3 + 1] = p.y;
      this.positions[idx3 + 2] = p.z;

      this.colors[idx3] = p.r * alpha;
      this.colors[idx3 + 1] = p.g * alpha;
      this.colors[idx3 + 2] = p.b * alpha;

      this.sizes[i] = p.size * alpha;
    }

    if (hasActive || this.hadActiveLastFrame) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
    }
    this.hadActiveLastFrame = hasActive;
  }

  public dispose(scene?: THREE.Scene) {
    if (this.geometry) this.geometry.dispose();
    if (this.points) {
      if (Array.isArray(this.points.material)) {
        this.points.material.forEach((m) => m.dispose());
      } else if (this.points.material) {
        this.points.material.dispose();
      }
      if (scene) {
        scene.remove(this.points);
      } else if (this.points.parent) {
        this.points.parent.remove(this.points);
      }
    }
  }
}

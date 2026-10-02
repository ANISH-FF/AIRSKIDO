import RAPIER from '@dimforge/rapier3d-compat';

export interface CollisionEventData {
  handleA: number;
  handleB: number;
  started: boolean;
}

export class PhysicsEngine {
  public static RAPIER: typeof RAPIER;
  public world!: RAPIER.World;
  public eventQueue!: RAPIER.EventQueue;

  private collisionCallbacks: ((handleA: number, handleB: number) => void)[] = [];

  public static async init() {
    await RAPIER.init();
    PhysicsEngine.RAPIER = RAPIER;
  }

  public static readonly FIXED_TIMESTEP = 1 / 60; // 60 Hz Fixed Timestep
  private static readonly MAX_ACCUM_TIME = 0.1;
  private accumulator: number = 0;

  constructor() {
    // Punchy arcade gravity (-28.0 m/s^2) for great jump dynamics
    const gravity = new RAPIER.Vector3(0.0, -28.0, 0.0);
    this.world = new RAPIER.World(gravity);
    this.world.timestep = PhysicsEngine.FIXED_TIMESTEP;
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  public onCollision(callback: (handleA: number, handleB: number) => void) {
    this.collisionCallbacks.push(callback);
  }

  public step(dt: number) {
    // 1:1 Frame-synced physics simulation: exactly 1 step per render frame
    // Eliminates skipped-frame freeze/jump micro-stutter on 80Hz, 90Hz, 120Hz, and 144Hz displays!
    const stepDt = Math.min(Math.max(dt, 0.001), 0.033);
    this.world.timestep = stepDt;
    this.world.step(this.eventQueue);

    // Drain collision events
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (started) {
        for (const cb of this.collisionCallbacks) {
          cb(handle1, handle2);
        }
      }
    });
  }

  // Reusable RAPIER Ray to avoid creating WASM heap objects on every castRay call
  private _cachedRay?: RAPIER.Ray;

  public castRay(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxToi: number,
    solid: boolean = true,
    excludeRigidBody?: RAPIER.RigidBody,
    filterGroups?: number
  ): { toi: number; normal: RAPIER.Vector; point: RAPIER.Vector; collider: RAPIER.Collider } | null {
    if (!this._cachedRay) {
      this._cachedRay = new PhysicsEngine.RAPIER.Ray(
        new PhysicsEngine.RAPIER.Vector3(origin.x, origin.y, origin.z),
        new PhysicsEngine.RAPIER.Vector3(direction.x, direction.y, direction.z)
      );
    } else {
      this._cachedRay.origin.x = origin.x;
      this._cachedRay.origin.y = origin.y;
      this._cachedRay.origin.z = origin.z;
      this._cachedRay.dir.x = direction.x;
      this._cachedRay.dir.y = direction.y;
      this._cachedRay.dir.z = direction.z;
    }
    const ray = this._cachedRay;

    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      solid,
      undefined,
      filterGroups,
      undefined,
      excludeRigidBody
    );

    if (hit) {
      const point = ray.pointAt(hit.timeOfImpact);
      return {
        toi: hit.timeOfImpact,
        normal: hit.normal,
        point: point,
        collider: hit.collider,
      };
    }
    return null;
  }
}

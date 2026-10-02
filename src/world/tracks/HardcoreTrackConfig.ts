import * as THREE from 'three';
import { TrackDefinition, JumpZoneConfig, AntiGravTubeConfig } from './TrackTypes';

export class HardcoreTrackConfig implements TrackDefinition {
  public id = 'hardcore';
  public name = 'HARDCORE GAUNTLET';
  public isHardcore = true;
  public archTitle = 'AIRSKID // HARDCORE GAUNTLET';
  public curve: THREE.CatmullRomCurve3;

  public static readonly SAMPLES = 400;

  // 360° Anti-Gravity Vortex Parkour Tube Tunnel (Mountain Cloud Ridge)
  public antiGravTube: AntiGravTubeConfig = {
    enabled: true,
    startSlice: 156,
    endSlice: 196,
    radius: 8.8,
    name: 'CYBER VORTEX 360° TUBE',
  };

  // 4 Dedicated Stunt Jump Zones across the 2,115m Grand Circuit
  public jumpZones: JumpZoneConfig[] = [
    // 1. East Drag Supersonic Launch (Right on the long empty starting straightaway!)
    {
      id: 'hardcore-jump-1',
      name: 'EAST DRAG SUPERSONIC LAUNCH',
      startSlice: 28,
      launchSlice: 36,
      landingSlice: 44,
      endSlice: 52,
      rampHeight: 6.8,
      catchHeight: 3.5,
      flaredWidth: 13.0,
      rings: [
        { id: 'hc-j1-r1', t: 37 / 400, color: 0x00f0ff, scale: 10.5, altitude: 9.5 },
        { id: 'hc-j1-r2', t: 40 / 400, color: 0xffea00, scale: 11.0, altitude: 12.0 },
        { id: 'hc-j1-r3', t: 43 / 400, color: 0xff00bb, scale: 10.5, altitude: 9.5 },
      ],
    },
    // 2. Mountain Cloud Summit Leap (At the highest summit of the 360° carousel)
    {
      id: 'hardcore-jump-2',
      name: 'MOUNTAIN CLOUD SUMMIT LEAP',
      startSlice: 126,
      launchSlice: 134,
      landingSlice: 142,
      endSlice: 150,
      rampHeight: 6.5,
      catchHeight: 3.2,
      flaredWidth: 13.0,
      rings: [
        { id: 'hc-j2-r1', t: 135 / 400, color: 0x00f0ff, scale: 10.5, altitude: 9.2 },
        { id: 'hc-j2-r2', t: 138 / 400, color: 0x00ff88, scale: 11.0, altitude: 11.5 },
        { id: 'hc-j2-r3', t: 141 / 400, color: 0xffea00, scale: 10.5, altitude: 9.0 },
      ],
    },
    // 3. West Straight Approach Sky-Hop (Before reaching the 3 Turbines corridor)
    {
      id: 'hardcore-jump-3',
      name: 'WEST STRAIGHT APPROACH SKY-HOP',
      startSlice: 208,
      launchSlice: 216,
      landingSlice: 224,
      endSlice: 232,
      rampHeight: 5.8,
      catchHeight: 2.8,
      flaredWidth: 12.5,
      rings: [
        { id: 'hc-j3-r1', t: 217 / 400, color: 0xffea00, scale: 10.0, altitude: 8.5 },
        { id: 'hc-j3-r2', t: 220 / 400, color: 0x00f0ff, scale: 10.5, altitude: 10.5 },
        { id: 'hc-j3-r3', t: 223 / 400, color: 0xff00bb, scale: 10.0, altitude: 8.2 },
      ],
    },
    // 4. Return Skyline Leap (After dodging the 3 hammers, before Start/Finish line)
    {
      id: 'hardcore-jump-4',
      name: 'RETURN SKYLINE LEAP',
      startSlice: 360,
      launchSlice: 368,
      landingSlice: 376,
      endSlice: 384,
      rampHeight: 6.2,
      catchHeight: 3.0,
      flaredWidth: 12.5,
      rings: [
        { id: 'hc-j4-r1', t: 369 / 400, color: 0x00ff88, scale: 10.0, altitude: 8.8 },
        { id: 'hc-j4-r2', t: 372 / 400, color: 0xffea00, scale: 10.5, altitude: 11.0 },
        { id: 'hc-j4-r3', t: 375 / 400, color: 0x00f0ff, scale: 10.0, altitude: 8.5 },
      ],
    },
  ];

  constructor() {
    // Grand Hardcore Circuit (~2,115m) with Double 360° Mountain Cloud Carousel & Sweeping Hairpins
    // Point 0 aligned right at Start/Finish Arch (t = 0.0)
    const rawPoints = [
      new THREE.Vector3(75, 0, -15),   // 0: Start/Finish Arch (t = 0.0 line)
      new THREE.Vector3(75, 0, 80),    // 1: East launch straight
      new THREE.Vector3(75, 0, 170),   // 2: East braking zone
      // Sector 2: Double 360° Mountain Cloud Carousel (Drift Sweepers)
      new THREE.Vector3(55, 4.0, 245), // 3: Turn 1 sweep
      new THREE.Vector3(15, 8.0, 305), // 4: Climbing apex
      new THREE.Vector3(-45, 12.0, 325),// 5: Summit ridge
      new THREE.Vector3(-110, 14.0, 295),// 6: Summit crest overlooking clouds
      new THREE.Vector3(-145, 11.0, 220),// 7: Sweeping carousel turn
      new THREE.Vector3(-125, 7.0, 145), // 8: Return hairpin
      new THREE.Vector3(-65, 8.5, 165),  // 9: Chicane left
      new THREE.Vector3(-35, 10.0, 110), // 10: Chicane right
      new THREE.Vector3(-55, 6.0, 45),   // 11: Carousel exit
      // Sector 3: West Straight (The Triple Blades Gauntlet)
      new THREE.Vector3(-85, 3.5, -15),  // 12: West straight runway
      new THREE.Vector3(-85, 2.0, -85),  // 13: Mid West straight
      new THREE.Vector3(-85, 0.5, -155), // 14: End West straight
      // Sector 4: South Hairpins (The Triple Hammers Gauntlet)
      new THREE.Vector3(-105, 3.0, -215),// 15: South entry
      new THREE.Vector3(-65, 7.0, -275), // 16: South sweeper turn
      new THREE.Vector3(0, 9.5, -295),   // 17: South summit apex
      new THREE.Vector3(55, 6.0, -260),  // 18: South return banking
      new THREE.Vector3(75, 2.0, -185),  // 19: Return straight alignment
      new THREE.Vector3(75, 0.0, -100),  // 20: Final straight approach back to start
    ].map((p) => new THREE.Vector3(p.x * 1.35, p.y * 1.15, p.z * 1.35));

    this.curve = new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal', 0.5);
  }

  public getSliceProperties(normT: number, sliceIdx: number, baseHalfWidth: number) {
    let currentHalfWidth = baseHalfWidth;
    let extraY = 0;
    let isRamp = false;

    // 1. Flared Grand Grid Plaza (25m wide starting zone around t = 0.0)
    const distFromStart = Math.min(sliceIdx, HardcoreTrackConfig.SAMPLES - sliceIdx) / HardcoreTrackConfig.SAMPLES;
    if (distFromStart < 0.08) {
      const flareP = Math.cos((distFromStart / 0.08) * (Math.PI / 2));
      currentHalfWidth += flareP * 3.5; // Expands to 25m total road width
    }

    // 2. Smooth, High-Speed Stunt Jumps (Ramp Up -> Flight Zone -> Smooth Catch Runway)
    for (const j of this.jumpZones) {
      // Incline Ramp
      if (sliceIdx >= j.startSlice && sliceIdx <= j.launchSlice) {
        const p = (sliceIdx - j.startSlice) / (j.launchSlice - j.startSlice);
        extraY = Math.pow(p, 1.4) * j.rampHeight;
        isRamp = true;
        break;
      }
      // Catch Landing Runway
      else if (sliceIdx >= j.landingSlice && sliceIdx <= j.endSlice) {
        const p = (j.endSlice - sliceIdx) / (j.endSlice - j.landingSlice);
        extraY = Math.pow(p, 1.3) * j.catchHeight;
        if (j.flaredWidth) {
          currentHalfWidth = Math.max(currentHalfWidth, baseHalfWidth + p * (j.flaredWidth - baseHalfWidth));
        }
        isRamp = true;
        break;
      }
    }

    // Hardcore track has ZERO broken chasm gaps (100% continuous solid asphalt circuit)
    return { extraY, halfWidth: currentHalfWidth, isRamp, isGap: false };
  }

  // Strategic Boost Pads across the 2,115m Circuit
  public boostPads = [
    { t: 25 / 400, isRamp: true },   // Sprint pad before Jump 1 launch ramp
    { t: 55 / 400, isRamp: false },  // Landing exit surge pad after Jump 1
    { t: 122 / 400, isRamp: true },  // Mountain crest launch boost for Jump 2
    { t: 153 / 400, isRamp: false }, // Carousel landing surge pad (entrance to Cyber Vortex Tube)
    { t: 176 / 400, isRamp: false }, // Mid-tube Cyber Vortex hyper-drive boost strip
    { t: 204 / 400, isRamp: true },  // Pre-jump boost for Jump 3
    { t: 234 / 400, isRamp: false }, // West straight sprint pad leading toward 3 Turbines
    { t: 356 / 400, isRamp: true },  // Skyline launch boost for Jump 4
    { t: 386 / 400, isRamp: false }, // Final straightaway surge pad into Finish Line
  ];

  // Mini Kicker Ramps on Turning Corners ("Chhota Jumping Wala")
  public kickerRamps = [
    { t: 68 / 400, offsetLat: -4.0 },  // Turn 1 entry inside apex kicker
    { t: 105 / 400, offsetLat: 3.8 },  // Mountain carousel mid-apex kicker
    { t: 200 / 400, offsetLat: -3.5 }, // Post-tube S-turn apex kicker
    { t: 330 / 400, offsetLat: 4.2 },  // South sweeper drift apex kicker
  ];

  // Heavy Concrete Barrier Blocks for Slalom Weaving
  public hazardBlocks = [
    { id: 'hc-block-1', t: 85 / 400, offsetLat: -3.8 },   // Sector 2 entry left barrier
    { id: 'hc-block-2', t: 92 / 400, offsetLat: 3.8 },    // Sector 2 entry right barrier (slalom pair)
    { id: 'hc-block-3', t: 203 / 400, offsetLat: 2.5 },   // Post-tube chicane right divider block
    { id: 'hc-block-4', t: 295 / 400, offsetLat: -3.2 },  // South sweeper entry divider block
  ];

  // 3X Sequential Rotating Blades along West Straight (Cleanly spaced ~65m apart)
  public turbines = [
    { id: 'turbine-hc-1', t: 0.60, bladeRadius: 8.5, speed: 2.8, angleOffset: 0 },
    { id: 'turbine-hc-2', t: 0.63, bladeRadius: 8.5, speed: 3.2, angleOffset: Math.PI / 3 },
    { id: 'turbine-hc-3', t: 0.66, bladeRadius: 8.5, speed: 2.8, angleOffset: (2 * Math.PI) / 3 },
  ];

  // 3X Sequential Swinging Wrecking Pendulums along South Sweeper
  public pendulums = [
    { id: 'pendulum-hc-1', t: 0.76, armLength: 16.5, speed: 2.6, maxAngle: 0.44, phaseOffset: 0 },
    { id: 'pendulum-hc-2', t: 0.80, armLength: 16.5, speed: 2.9, maxAngle: 0.44, phaseOffset: Math.PI },
    { id: 'pendulum-hc-3', t: 0.84, armLength: 16.5, speed: 2.6, maxAngle: 0.44, phaseOffset: Math.PI / 2 },
  ];
}

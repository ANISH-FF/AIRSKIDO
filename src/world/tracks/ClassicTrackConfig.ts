import * as THREE from 'three';
import { TrackDefinition } from './TrackTypes';

export class ClassicTrackConfig implements TrackDefinition {
  public id = 'classic';
  public name = 'CLASSIC GRAND PRIX';
  public isHardcore = false;
  public archTitle = 'AIRSKIDO // GRAND PRIX';
  public curve: THREE.CatmullRomCurve3;

  public static readonly SAMPLES = 400;
  public static readonly GAP1_START_SLICE = 269;
  public static readonly GAP1_END_SLICE = 279;
  public static readonly GAP2_START_SLICE = 58;
  public static readonly GAP2_END_SLICE = 65;

  constructor() {
    // Grand Prix Circuit (~1,750m) with Flared 25m Starting Grid
    const rawPoints = [
      new THREE.Vector3(65, 0, -110),  // 0: Final straight approach
      new THREE.Vector3(65, 0, -15),   // 1: Start/Finish Arch (t = 0.0 line), 25m Wide Grid
      new THREE.Vector3(65, 0, 75),    // 2: Launch straightaway
      new THREE.Vector3(65, 0, 160),   // 3: High speed drag straight (Braking zone)
      new THREE.Vector3(45, 4.0, 220), // 4: Turn 1 sweep entry
      new THREE.Vector3(10, 7.5, 245), // 5: Summit apex
      new THREE.Vector3(-35, 10.0, 225),// 6: Downhill sweep overlooking Infield Cyber City
      new THREE.Vector3(-65, 6.0, 180),// 7: Chicane left turn
      new THREE.Vector3(-75, 3.5, 135),// 8: Exit onto West Straight
      new THREE.Vector3(-75, 2.0, 85), // 9: Approach runway (Sprint Boost Pad)
      new THREE.Vector3(-75, 1.8, 15), // 10: Between camelback slopes
      new THREE.Vector3(-75, 1.2, -45),// 11: Pre-canyon rollout
      new THREE.Vector3(-75, 0.0, -115),// 12: Exit West straight
      new THREE.Vector3(-55, 3.0, -180),// 13: South sweeping entry
      new THREE.Vector3(0, 6.5, -215),  // 14: Panoramic summit over the abyss
      new THREE.Vector3(45, 4.0, -185), // 15: Return banking downhill
      new THREE.Vector3(65, 1.5, -145), // 16: Aligning back with Main Straight
    ];
    this.curve = new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal', 0.5);
  }

  public getSliceProperties(normT: number, sliceIdx: number, baseHalfWidth: number) {
    let currentHalfWidth = baseHalfWidth;
    let extraY = 0;
    let isRamp = false;

    // 1. Flared Grand Grid Plaza (25m wide starting zone around t = 0.0)
    const distFromStart = Math.min(sliceIdx, ClassicTrackConfig.SAMPLES - sliceIdx) / ClassicTrackConfig.SAMPLES;
    if (distFromStart < 0.08) {
      const flareP = Math.cos((distFromStart / 0.08) * (Math.PI / 2));
      currentHalfWidth += flareP * 3.5;
    }

    // 2. The Roller-Coaster Camelback Slopes
    if (sliceIdx >= 194 && sliceIdx <= 220) {
      const p1 = (sliceIdx - 194) / 26;
      extraY = Math.pow(Math.sin(p1 * Math.PI), 2) * 6.0;
    } else if (sliceIdx >= 228 && sliceIdx <= 254) {
      const p2 = (sliceIdx - 228) / 26;
      extraY = Math.pow(Math.sin(p2 * Math.PI), 2) * 6.6;
    }
    // 3. Stunt Ski-Jump 1 (Canyon Ski-Jump)
    else if (sliceIdx >= 256 && sliceIdx < ClassicTrackConfig.GAP1_START_SLICE) {
      const rampP = (sliceIdx - 255) / (ClassicTrackConfig.GAP1_START_SLICE - 255);
      extraY = Math.pow(rampP, 1.5) * 9.2;
      isRamp = true;
    } else if (sliceIdx > ClassicTrackConfig.GAP1_END_SLICE && sliceIdx <= 296) {
      const landP = (296 - sliceIdx) / (296 - ClassicTrackConfig.GAP1_END_SLICE);
      extraY = Math.pow(landP, 1.3) * 4.2;
      currentHalfWidth = Math.max(currentHalfWidth, baseHalfWidth + landP * 4.0);
      isRamp = true;
    }
    // 4. Stunt Ski-Jump 2 (Sector 1 Main Straight Sky-Launch)
    else if (sliceIdx >= 48 && sliceIdx < ClassicTrackConfig.GAP2_START_SLICE) {
      const rampP = (sliceIdx - 47) / (ClassicTrackConfig.GAP2_START_SLICE - 47);
      extraY = Math.pow(rampP, 1.5) * 7.5;
      isRamp = true;
    } else if (sliceIdx > ClassicTrackConfig.GAP2_END_SLICE && sliceIdx <= 76) {
      const landP = (76 - sliceIdx) / (76 - ClassicTrackConfig.GAP2_END_SLICE);
      extraY = Math.pow(landP, 1.3) * 3.8;
      currentHalfWidth = Math.max(currentHalfWidth, baseHalfWidth + landP * 3.5);
      isRamp = true;
    }

    const isGap = (sliceIdx >= ClassicTrackConfig.GAP1_START_SLICE && sliceIdx <= ClassicTrackConfig.GAP1_END_SLICE) ||
                  (sliceIdx >= ClassicTrackConfig.GAP2_START_SLICE && sliceIdx <= ClassicTrackConfig.GAP2_END_SLICE);

    return { extraY, halfWidth: currentHalfWidth, isRamp, isGap };
  }

  public boostPads = [
    { t: 47 / 400, isRamp: true },
    { t: 68 / 400, isRamp: true },
    { t: 0.44, isRamp: false },
    { t: 187 / 400, isRamp: false },
    { t: 254 / 400, isRamp: true },
    { t: 283 / 400, isRamp: true },
    { t: 0.88, isRamp: false },
  ];

  public jumpZones = [
    {
      id: 'classic-jump-1',
      name: 'CANYON SKI JUMP',
      startSlice: 256,
      launchSlice: 268,
      landingSlice: 280,
      endSlice: 296,
      rampHeight: 9.2,
      catchHeight: 4.2,
      flaredWidth: 13.0,
      rings: [
        { id: 'c-jump1-r1', t: 269 / 400, color: 0x00f0ff, scale: 10.5, altitude: 14.2 },
        { id: 'c-jump1-r2', t: 272 / 400, color: 0x00f0ff, scale: 11.0, altitude: 17.5 },
        { id: 'c-jump1-r3', t: 275 / 400, color: 0xffea00, scale: 11.5, altitude: 18.0 },
        { id: 'c-jump1-r4', t: 278 / 400, color: 0xff00bb, scale: 11.0, altitude: 14.5 },
        { id: 'c-jump1-r5', t: 281 / 400, color: 0x00ff88, scale: 10.5, altitude: 10.0 },
      ],
    },
    {
      id: 'classic-jump-2',
      name: 'SUPERSONIC SKY LEAP',
      startSlice: 48,
      launchSlice: 57,
      landingSlice: 66,
      endSlice: 76,
      rampHeight: 7.5,
      catchHeight: 3.8,
      flaredWidth: 12.5,
      rings: [
        { id: 'c-jump2-r1', t: 58 / 400, color: 0x00f0ff, scale: 10.0, altitude: 11.5 },
        { id: 'c-jump2-r2', t: 61 / 400, color: 0xffea00, scale: 10.5, altitude: 13.8 },
        { id: 'c-jump2-r3', t: 64 / 400, color: 0x00ff88, scale: 10.0, altitude: 9.5 },
      ],
    },
  ];

  public kickerRamps = [
    { t: 114 / 400, offsetLat: -3.4 }, // Turn 1 apex turn (uphill into downhill transition)
    { t: 152 / 400, offsetLat: 3.2 },  // Chicane entry turn (high lateral load)
    { t: 176 / 400, offsetLat: -3.5 }, // Chicane exit sweeping left turn
    { t: 346 / 400, offsetLat: -3.2 }, // South sweeping summit curve apex
    { t: 370 / 400, offsetLat: 3.4 },  // South return downhill banking curve
  ];

  public hazardBlocks = [
    { id: 'c-block-1', t: 36 / 400, offsetLat: 3.6 },    // Main straight pre-ramp: breaks straight line
    { id: 'c-block-2', t: 104 / 400, offsetLat: -4.0 },  // Turn 1 entry inside apex
    { id: 'c-block-3', t: 122 / 400, offsetLat: 3.8 },   // Turn 1 exit downhill sweeper
    { id: 'c-block-4', t: 142 / 400, offsetLat: -3.6 },  // Chicane entrance inside curb
    { id: 'c-block-5', t: 164 / 400, offsetLat: 3.8 },   // Chicane mid-turn slalom barrier
    { id: 'c-block-6', t: 236 / 400, offsetLat: -3.2 },  // Between camelback rollercoaster dips
    { id: 'c-block-7', t: 312 / 400, offsetLat: -3.8 },  // Canyon landing rollout left
    { id: 'c-block-8', t: 326 / 400, offsetLat: 3.6 },   // Canyon rollout right (slalom gate)
    { id: 'c-block-9', t: 358 / 400, offsetLat: -3.4 },  // South panoramic summit inside curve
  ];

  public turbines = [
    { id: 'turbine-classic-1', t: 172 / 400, bladeRadius: 8.5, speed: 2.3, angleOffset: 0 },
  ];

  public pendulums = [
    { id: 'pendulum-classic-1', t: 335 / 400, armLength: 16.5, speed: 2.2, maxAngle: 0.44, phaseOffset: 0 },
  ];
}

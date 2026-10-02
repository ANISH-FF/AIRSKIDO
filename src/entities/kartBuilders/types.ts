import * as THREE from 'three';
import { KartStats } from '../Kart';

export interface KartBuilderContext {
  group: THREE.Group;
  stats: KartStats;
  bodyMat: THREE.MeshStandardMaterial;
  secondaryMat: THREE.MeshStandardMaterial;
  darkMetalMat: THREE.MeshStandardMaterial;
  materialsToFlash: THREE.Material[];
}

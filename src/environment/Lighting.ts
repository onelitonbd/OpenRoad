// Lighting.ts — streetlights emissive helper
import * as THREE from 'three';

export class Lighting {
  static updateStreetlights(scene: THREE.Scene, isNight: boolean, intensity: number) {
    // Find prop lamp meshes (InstancedMesh) and modulate emissiveIntensity
    // For now, traverse scene to find materials with emissive
    scene.traverse(obj=>{
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.LineBasicMaterial | undefined;
      if (mat && (mat as THREE.MeshStandardMaterial).emissive) {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.emissiveIntensity !== undefined && std.color?.getHexString() === '1e293b') {
          // It's lamp material — we identify via color 0x1e293b? Our lamp mat color is 0x1e293b
          std.emissiveIntensity = isNight ? 0.65 * intensity : 0;
        }
      }
    });
  }
}

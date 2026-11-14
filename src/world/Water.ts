// Water.ts — sea plane for coast
import * as THREE from 'three';

export class Water {
  mesh: THREE.Mesh;
  private time = 0;

  constructor() {
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: '#38bdf8', transparent: true, opacity: 0.92, roughness: 0.2, metalness: 0.1 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI/2;
    this.mesh.position.y = -3.5;
    this.mesh.position.z = -4200; // shift to cover south edge
    this.mesh.receiveShadow = false;
  }

  addToScene(scene: THREE.Scene) { scene.add(this.mesh); }

  update(dt:number, _playerPos: THREE.Vector3) {
    this.time += dt;
    // simple wobble via position y
    this.mesh.position.y = -3.5 + Math.sin(this.time*0.5)*0.12;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

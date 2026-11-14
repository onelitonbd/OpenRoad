// CarFactory.ts — builds mesh from GLB or procedural fallback
import * as THREE from 'three';

export interface CarMesh {
  root: THREE.Group;
  body: THREE.Mesh;
  wheels: THREE.Mesh[]; // 4 wheels
}

export class CarFactory {
  // Procedural low-poly cartoon car
  static createProcedural(color: string, dimensions: [number, number, number]): CarMesh {
    const [len, wid, hei] = dimensions;
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4, metalness: 0.2 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.3, metalness: 0.5 });

    // Body — boxy cartoon shape
    const bodyGeo = new THREE.BoxGeometry(len, hei * 0.55, wid);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = hei * 0.45;
    group.add(body);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(len * 0.55, hei * 0.6, wid * 0.92);
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.castShadow = true;
    cabin.position.set(-len * 0.05, hei * 0.95, 0);
    group.add(cabin);

    // Windshield hint (simple plane)
    const glassGeo = new THREE.PlaneGeometry(wid * 0.85, len * 0.3);
    const glassMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const windshield = new THREE.Mesh(glassGeo, glassMat);
    windshield.rotation.x = Math.PI / 2;
    windshield.rotation.y = 0.3;
    windshield.position.set(len * 0.15, hei * 0.95, 0);
    group.add(windshield);

    // Spoiler for sports look
    const spoilerGeo = new THREE.BoxGeometry(0.25, 0.08, wid * 0.9);
    const spoilerMat = new THREE.MeshStandardMaterial({ color: '#0f172a' });
    const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
    spoiler.position.set(-len * 0.5, hei * 0.7, 0);
    group.add(spoiler);

    // Headlights
    const lightGeo = new THREE.BoxGeometry(0.12, 0.22, 0.28);
    const lightMat = new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#facc15', emissiveIntensity: 0.6 });
    const hl1 = new THREE.Mesh(lightGeo, lightMat);
    hl1.position.set(len * 0.5, hei * 0.5, wid * 0.35);
    group.add(hl1);
    const hl2 = hl1.clone();
    hl2.position.z *= -1;
    group.add(hl2);

    // Wheels — 4 separate meshes for rotation/steer
    const wheelRadius = 0.34;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.32, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels: THREE.Mesh[] = [];
    const wheelPositions: [number, number, number][] = [
      [len * 0.35, wheelRadius, wid * 0.5],   // FL
      [len * 0.35, wheelRadius, -wid * 0.5],  // FR
      [-len * 0.33, wheelRadius, wid * 0.5],  // RL
      [-len * 0.33, wheelRadius, -wid * 0.5], // RR
    ];
    wheelPositions.forEach(pos => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.castShadow = true;
      const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, 0.33, 10);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      g.add(tire);
      g.add(rim);
      // Wrap group as mesh-like for simple rotation: use tire mesh as handle
      // We'll store group and rotate group's children via userData
      const wrapper = new THREE.Mesh(); // dummy, but we need Mesh[] type; we use Group instead
      // Instead return tire mesh but offset via parent
      const container = new THREE.Group();
      container.add(tire);
      container.add(rim);
      container.position.set(pos[0], pos[1], pos[2]);
      group.add(container);
      // Use container as wheel handle (cast to Mesh for typing simplicity)
      wheels.push(container as unknown as THREE.Mesh);
    });

    return { root: group, body, wheels };
  }

  static async loadGLB(_url: string): Promise<CarMesh | null> {
    // TODO Phase 7: load GLB with GLTFLoader, find wheels by name wheel_fl etc.
    return null;
  }
}

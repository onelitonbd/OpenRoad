import * as THREE from 'three';
import type { Terrain } from './Terrain';

/**
 * The landmarks of the world.
 *
 * They are the places the player can find on the minimap and drive to: a
 * tower in the middle of the city, a lighthouse on the coast and two
 * windmills out in the countryside.
 */
interface Landmark {
  name: string;
  x: number;
  z: number;
  kind: 'spire' | 'lighthouse' | 'windmill' | 'radioTower';
}

const LANDMARKS: Landmark[] = [
  { name: 'The Spire', x: 0, z: 0, kind: 'spire' },
  { name: 'Kestrel Light', x: 900, z: 2680, kind: 'lighthouse' },
  { name: 'Old Mill', x: -1200, z: 1500, kind: 'windmill' },
  { name: 'Hill Mill', x: 1900, z: 1900, kind: 'windmill' },
  { name: 'Beacon Hill', x: -2900, z: -1400, kind: 'radioTower' },
];

export class Landmarks {
  readonly group = new THREE.Group();
  /** The windmill blades, so they can turn slowly. */
  private readonly blades: THREE.Object3D[] = [];

  constructor(private readonly terrain: Terrain) {
    this.group.name = 'landmarks';
    for (const landmark of LANDMARKS) {
      const y = this.terrain.groundHeight(landmark.x, landmark.z);
      const mesh = this.build(landmark, y);
      mesh.name = landmark.name;
      this.group.add(mesh);
    }
  }

  /** The list of landmarks (used by the minimap). */
  get list(): readonly Landmark[] {
    return LANDMARKS;
  }

  private build(landmark: Landmark, y: number): THREE.Object3D {
    switch (landmark.kind) {
      case 'spire':
        return this.buildSpire(landmark.x, y, landmark.z);
      case 'lighthouse':
        return this.buildLighthouse(landmark.x, y, landmark.z);
      case 'windmill':
        return this.buildWindmill(landmark.x, y, landmark.z);
      default:
        return this.buildRadioTower(landmark.x, y, landmark.z);
    }
  }

  /** The tall tower in the middle of the city. */
  private buildSpire(x: number, y: number, z: number): THREE.Object3D {
    const group = new THREE.Group();

    const stone = new THREE.MeshLambertMaterial({ color: 0xd8d3c8 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x2f4a66 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xd9a441 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, 14, 12), stone);
    base.position.y = 7;
    group.add(base);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9, 15, 120, 12), stone);
    shaft.position.y = 74;
    group.add(shaft);

    const ring = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 11.5, 6, 12), glass);
    ring.position.y = 136;
    group.add(ring);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 12), glass);
    roof.position.y = 151;
    group.add(roof);

    const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 22, 6), gold);
    needle.position.y = 174;
    group.add(needle);

    const light = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe08a }),
    );
    light.position.y = 136;
    group.add(light);

    group.position.set(x, y, z);
    return group;
  }

  /** The lighthouse at the water line. */
  private buildLighthouse(x: number, y: number, z: number): THREE.Object3D {
    const group = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f0ea });
    const red = new THREE.MeshLambertMaterial({ color: 0xc0392b });

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 5.4, 26, 12), white);
    tower.position.y = 13;
    group.add(tower);

    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(4.3 - i * 0.2, 4.4 - i * 0.2, 2.4, 12), red);
      stripe.position.y = 5 + i * 8;
      group.add(stripe);
    }

    const balcony = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 1, 12), red);
    balcony.position.y = 26;
    group.add(balcony);

    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 4, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0 }),
    );
    lamp.position.y = 28.5;
    group.add(lamp);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 3, 12), red);
    cap.position.y = 32;
    group.add(cap);

    group.position.set(x, y, z);
    return group;
  }

  /** A windmill out in the countryside. */
  private buildWindmill(x: number, y: number, z: number): THREE.Object3D {
    const group = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xd9cfb8 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5636 });

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 5, 16, 10), stone);
    tower.position.y = 8;
    group.add(tower);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.8, 3.4, 10), wood);
    cap.position.y = 17;
    group.add(cap);

    // The blades turn around the front of the mill.
    const hub = new THREE.Group();
    hub.position.set(0, 15, 3.4);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.25), wood);
      blade.position.y = 4.5;
      blade.rotation.z = (i / 4) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 4) * Math.PI * 2;
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.5, 0.25), wood);
      inner.position.y = 5;
      pivot.add(inner);
      hub.add(pivot);
    }
    group.add(hub);
    this.blades.push(hub);

    group.position.set(x, y, z);
    return group;
  }

  /** A radio mast on the mountain. */
  private buildRadioTower(x: number, y: number, z: number): THREE.Object3D {
    const group = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0xb0b4ba });

    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 42, 5), metal);
      const angle = (i / 4) * Math.PI * 2;
      leg.position.set(Math.cos(angle) * 3.2, 21, Math.sin(angle) * 3.2);
      leg.rotation.z = Math.cos(angle) * 0.08;
      leg.rotation.x = -Math.sin(angle) * 0.08;
      group.add(leg);
    }

    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.18, 4, 10), metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 8 + i * 10;
      group.add(ring);
    }

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5555 }),
    );
    beacon.position.y = 43;
    group.add(beacon);

    group.position.set(x, y, z);
    return group;
  }

  /** Turn the windmill blades. */
  update(dt: number): void {
    for (const blades of this.blades) {
      blades.rotation.z += dt * 0.35;
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.group.clear();
  }
}

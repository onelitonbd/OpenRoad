import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VehicleConfig } from './VehicleConfig';

/**
 * Builds the visual car.
 *
 * Everything is generated from code so the game works before a single asset
 * file exists. If a GLB is available later it can be loaded instead - the
 * only requirement is that the wheels are named `wheel_fl`, `wheel_fr`,
 * `wheel_rr`, `wheel_rl`.
 */

export interface CarMesh {
  group: THREE.Group;
  /** Wheel meshes in the order front-left, front-right, rear-left, rear-right. */
  wheels: THREE.Object3D[];
  /** Meshes whose emissive colour is switched on at night (head lights). */
  lights: THREE.Mesh[];
}

interface BodyShapeSpec {
  /** Length of the lower body. */
  lowerLength: number;
  /** Height of the lower body. */
  lowerHeight: number;
  /** Length of the cabin. */
  cabinLength: number;
  /** Height of the cabin. */
  cabinHeight: number;
  /** How far back the cabin sits (negative = towards the front). */
  cabinOffset: number;
  /** Width of the cabin compared to the body. */
  cabinWidth: number;
  /** Extra length at the back (spoiler / trunk). */
  tailLength: number;
  /** Roof spoiler present. */
  spoiler: boolean;
  /** Roof slope factor (0 = boxy, 1 = very sloped). */
  slope: number;
}

/**
 * The body is built around the chassis origin, which is the vertical middle
 * of the car: the bottom of the car sits at `-height / 2` and the roof at
 * `+height / 2`. The physics box uses the same numbers, so the visual car
 * and the collision box always agree.
 */
function shapeSpec(config: VehicleConfig): BodyShapeSpec {
  const [w, h, l] = config.dimensions;
  const base: BodyShapeSpec = {
    lowerLength: l * 0.96,
    lowerHeight: h * 0.52,
    cabinLength: l * 0.42,
    cabinHeight: h * 0.48,
    cabinOffset: -l * 0.02,
    cabinWidth: w * 0.86,
    tailLength: l * 0.04,
    spoiler: false,
    slope: 0.5,
  };

  switch (config.bodyShape) {
    case 'coupe':
      return { ...base, cabinLength: l * 0.38, slope: 0.72, spoiler: true };
    case 'roadster':
      return { ...base, lowerHeight: h * 0.62, cabinHeight: h * 0.38, cabinLength: l * 0.3, slope: 0.6 };
    case 'muscle':
      return {
        ...base,
        lowerHeight: h * 0.55,
        cabinHeight: h * 0.45,
        cabinLength: l * 0.4,
        cabinWidth: w * 0.84,
        slope: 0.5,
        spoiler: true,
      };
    case 'hatch':
      return {
        ...base,
        lowerHeight: h * 0.55,
        cabinHeight: h * 0.45,
        cabinLength: l * 0.5,
        cabinWidth: w * 0.9,
        slope: 0.22,
      };
    case 'suv':
      return {
        ...base,
        lowerHeight: h * 0.6,
        cabinHeight: h * 0.4,
        cabinLength: l * 0.58,
        cabinWidth: w * 0.92,
        slope: 0.18,
      };
    case 'truck':
      return {
        ...base,
        lowerHeight: h * 0.45,
        cabinHeight: h * 0.55,
        cabinLength: l * 0.34,
        cabinWidth: w * 0.94,
        cabinOffset: l * 0.16,
        slope: 0.1,
      };
    case 'sedan':
    default:
      return { ...base, cabinLength: l * 0.46, cabinWidth: w * 0.88, slope: 0.45 };
  }
}

/** A rounded-ish box built from a scaled box with a slight taper. */
function box(
  width: number,
  height: number,
  length: number,
  x = 0,
  y = 0,
  z = 0,
  taperFront = 1,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, length, 1, 1, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  // Taper the front of the box so the nose is narrower - a cheap way to make
  // a blocky car look like a real shape.
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const half = length / 2;
    if (z > half * 0.25) {
      const t = (z - half * 0.25) / (half * 0.75);
      const scale = 1 + (taperFront - 1) * t;
      pos.setX(i, pos.getX(i) * scale);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.translate(x, y, z);
  return geo;
}

/** A simple wedge used for windscreen and rear window. */
function wedge(
  width: number,
  height: number,
  length: number,
  slope: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const hw = width / 2;
  const hh = height / 2;
  const hl = length / 2;
  const frontTop = hh * (1 - slope);
  const v = new Float32Array([
    // front face (bottom edge -> top edge pushed back)
    -hw, -hh, hl, hw, -hh, hl, -hw, frontTop, hl - length * slope * 0.55,
    hw, -hh, hl, hw, frontTop, hl - length * slope * 0.55, -hw, frontTop, hl - length * slope * 0.55,
    // back face
    -hw, -hh, -hl, -hw, frontTop, -hl + length * slope * 0.45, hw, -hh, -hl,
    hw, -hh, -hl, hw, frontTop, -hl + length * slope * 0.45, -hw, frontTop, -hl + length * slope * 0.45,
    // top
    -hw, frontTop, hl - length * slope * 0.55, -hw, frontTop, -hl + length * slope * 0.45, hw, frontTop, hl - length * slope * 0.55,
    -hw, frontTop, hl - length * slope * 0.55, hw, frontTop, hl - length * slope * 0.55, hw, frontTop, -hl + length * slope * 0.45,
    // bottom
    -hw, -hh, hl, hw, -hh, hl, hw, -hh, -hl,
    -hw, -hh, hl, hw, -hh, -hl, -hw, -hh, -hl,
    // left
    -hw, -hh, hl, -hw, frontTop, hl - length * slope * 0.55, -hw, frontTop, -hl + length * slope * 0.45,
    -hw, -hh, hl, -hw, frontTop, -hl + length * slope * 0.45, -hw, -hh, -hl,
    // right
    hw, -hh, hl, hw, frontTop, -hl + length * slope * 0.45, hw, frontTop, hl - length * slope * 0.55,
    hw, -hh, hl, hw, -hh, -hl, hw, frontTop, -hl + length * slope * 0.45,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  geo.translate(x, y, z);
  return geo;
}

function makeWheel(radius: number, width: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 12, 1);
  geo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a1c22 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;

  // A brighter hub makes the wheel spin visible.
  const hubGeo = new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, width * 1.06, 10, 1);
  hubGeo.rotateZ(Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, new THREE.MeshLambertMaterial({ color: 0xc9d1e0 }));
  mesh.add(hub);
  return mesh;
}

/**
 * Create the mesh for a car configuration.
 * `color` overrides the default paint colour from the config.
 */
export function buildCarMesh(config: VehicleConfig, color?: string): CarMesh {
  const [w, h, l] = config.dimensions;
  const spec = shapeSpec(config);
  const group = new THREE.Group();
  group.name = `car-${config.id}`;

  const paint = new THREE.MeshLambertMaterial({ color: new THREE.Color(color ?? config.color) });
  const trim = new THREE.MeshLambertMaterial({ color: new THREE.Color(config.accentColor) });
  const glass = new THREE.MeshLambertMaterial({
    color: 0x223244,
    transparent: true,
    opacity: 0.85,
  });
  const lampMat = new THREE.MeshLambertMaterial({
    color: 0xfff3c4,
    emissive: 0x000000,
  });
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0x7a1f1f,
    emissive: 0x000000,
  });

  const bodyY = -h / 2 + spec.lowerHeight / 2;

  // --- lower body ---
  const lower = box(w, spec.lowerHeight, spec.lowerLength, 0, bodyY, 0, 0.92);
  const parts: THREE.BufferGeometry[] = [lower];

  // --- cabin ---
  const cabinY = bodyY + spec.lowerHeight / 2 + spec.cabinHeight / 2;
  const cabin = box(
    spec.cabinWidth,
    spec.cabinHeight,
    spec.cabinLength,
    0,
    cabinY,
    spec.cabinOffset,
    0.86,
  );
  parts.push(cabin);

  // --- windscreen / rear window ---
  const wsLength = spec.cabinLength * 0.42;
  const ws = wedge(
    spec.cabinWidth * 0.92,
    spec.cabinHeight * 0.92,
    wsLength,
    spec.slope,
    0,
    cabinY,
    spec.cabinOffset + spec.cabinLength / 2 - wsLength * 0.42,
  );
  const rw = wedge(
    spec.cabinWidth * 0.9,
    spec.cabinHeight * 0.85,
    spec.cabinLength * 0.34,
    spec.slope * 0.8,
    0,
    cabinY,
    spec.cabinOffset - spec.cabinLength / 2 + spec.cabinLength * 0.16,
  );

  const bodyGeo = mergeGeometries(parts, false);
  if (bodyGeo) {
    const bodyMesh = new THREE.Mesh(bodyGeo, paint);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);
  }
  for (const p of parts) p.dispose();

  const glassParts = [ws, rw];
  const glassGeo = mergeGeometries(glassParts, false);
  if (glassGeo) {
    const glassMesh = new THREE.Mesh(glassGeo, glass);
    group.add(glassMesh);
  }
  for (const p of glassParts) p.dispose();

  // --- bumpers ---
  const bumperFront = box(w * 1.01, spec.lowerHeight * 0.4, 0.18, 0, bodyY - spec.lowerHeight * 0.22, l / 2 - 0.06);
  const bumperRear = box(w * 1.01, spec.lowerHeight * 0.4, 0.18, 0, bodyY - spec.lowerHeight * 0.22, -l / 2 + 0.06);
  const bumperGeo = mergeGeometries([bumperFront, bumperRear], false);
  if (bumperGeo) {
    group.add(new THREE.Mesh(bumperGeo, trim));
  }
  bumperFront.dispose();
  bumperRear.dispose();

  // --- spoiler ---
  if (spec.spoiler) {
    const spoiler = box(w * 0.82, 0.07, 0.34, 0, bodyY + spec.lowerHeight / 2 + 0.12, -l / 2 + 0.28);
    const spoilerMesh = new THREE.Mesh(spoiler, trim);
    group.add(spoilerMesh);
  }

  // --- lights ---
  const lights: THREE.Mesh[] = [];
  const headGeo = new THREE.BoxGeometry(w * 0.2, spec.lowerHeight * 0.26, 0.1);
  const headL = new THREE.Mesh(headGeo, lampMat);
  headL.position.set(w * 0.3, bodyY + spec.lowerHeight * 0.08, l / 2 - 0.02);
  const headR = new THREE.Mesh(headGeo, lampMat);
  headR.position.set(-w * 0.3, bodyY + spec.lowerHeight * 0.08, l / 2 - 0.02);
  group.add(headL, headR);
  lights.push(headL, headR);

  const tailGeo = new THREE.BoxGeometry(w * 0.22, spec.lowerHeight * 0.24, 0.08);
  const tailL = new THREE.Mesh(tailGeo, tailMat);
  tailL.position.set(w * 0.28, bodyY + spec.lowerHeight * 0.1, -l / 2 + 0.02);
  const tailR = new THREE.Mesh(tailGeo, tailMat);
  tailR.position.set(-w * 0.28, bodyY + spec.lowerHeight * 0.1, -l / 2 + 0.02);
  group.add(tailL, tailR);

  // --- wheels ---
  // The wheel centre has to sit at the same height the physics uses, so the
  // car looks exactly like it drives.
  const wheelWidth = config.wheelRadius * 0.62;
  const wheelCentreY = config.wheelRadius - (config.groundClearance + h / 2);
  const wheels: THREE.Object3D[] = [];
  const names = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
  const offsets: [number, number, number][] = [
    [config.trackWidth, wheelCentreY, config.frontAxleOffset],
    [-config.trackWidth, wheelCentreY, config.frontAxleOffset],
    [config.trackWidth, wheelCentreY, config.rearAxleOffset],
    [-config.trackWidth, wheelCentreY, config.rearAxleOffset],
  ];
  for (let i = 0; i < 4; i++) {
    const wheel = makeWheel(config.wheelRadius, wheelWidth);
    wheel.name = names[i];
    wheel.position.set(offsets[i][0], offsets[i][1], offsets[i][2]);
    group.add(wheel);
    wheels.push(wheel);
  }

  return { group, wheels, lights };
}

/**
 * Cache of loaded GLB models so several cars of the same model share the
 * geometry (and therefore the GPU buffers).
 */
const glbCache = new Map<string, { scene: THREE.Object3D; wheels: THREE.Object3D[] }>();

export async function loadCarModel(
  path: string,
): Promise<{ scene: THREE.Object3D; wheels: THREE.Object3D[] } | null> {
  const cached = glbCache.get(path);
  if (cached) return cached;
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(path);
    const scene = gltf.scene;
    const wheels: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.name.startsWith('wheel')) wheels.push(child);
    });
    const result = { scene, wheels };
    glbCache.set(path, result);
    return result;
  } catch {
    return null;
  }
}

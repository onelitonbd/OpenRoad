import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { VehicleConfig } from './VehicleConfig';

/**
 * Builds the visual car.
 *
 * Two ways are supported:
 *
 * 1. A real 3D model (GLB) that is loaded from `/public/models`. The model is
 *    scaled so that it fills the collision box of the car exactly and its
 *    wheels are re-used as the animated wheels of the vehicle.
 * 2. A procedural car that is generated from code. It is the fallback and is
 *    used whenever the model cannot be loaded, so the game always works.
 *
 * The GLB models of the Kenney Car Kit are used (CC0, public domain). Their
 * wheels are named `wheel-front-left`, `wheel-front-right`, `wheel-back-left`
 * and `wheel-back-right`; any other naming is accepted as well as long as the
 * four wheels can be told apart.
 */

export interface CarMesh {
  group: THREE.Group;
  /** Wheel meshes in the order front-left, front-right, rear-left, rear-right. */
  wheels: THREE.Object3D[];
  /** Meshes whose emissive colour is switched on at night (head lights). */
  lights: THREE.Mesh[];
  /** Switches the head lights on and off. */
  setHeadlights?: (on: boolean) => void;
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

  return {
    group,
    wheels,
    lights,
    setHeadlights: (on: boolean) => {
      lampMat.emissive.setHex(on ? 0xffe9a8 : 0x000000);
      tailMat.emissive.setHex(on ? 0x8a1f1f : 0x000000);
    },
  };
}

/**
 * A car model that was loaded from a GLB file and prepared for the game.
 *
 * The geometry is already scaled and moved into the local space of the car
 * (the same space the physics uses: +Z is forward, +Y is up and the origin
 * sits in the middle of the collision box).
 */
export interface CarModelAsset {
  /** The body of the car - one entry per material. */
  body: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** The four wheels, centred on their axle, in FL, FR, RL, RR order. */
  wheels: THREE.BufferGeometry[];
  /** Where the head lights are (local space of the car). */
  headlights: { position: THREE.Vector3; size: THREE.Vector2 }[];
  /** The material of the body (used for the head light glow). */
  material: THREE.Material;
}

/** The order the wheels have to be in: front-left, front-right, rear-left, rear-right. */
const WHEEL_ORDER = ['front-left', 'front-right', 'back-left', 'back-right'] as const;

/**
 * Finds the four wheels of a model and puts them into a fixed order.
 *
 * The names of the Kenney models are `wheel-front-left` and friends, other
 * kits use `wheel_fl`. When the names are useless the position of the wheels
 * is used instead.
 */
function orderWheels(wheels: THREE.Object3D[]): THREE.Object3D[] | null {
  if (wheels.length !== 4) return null;

  const byName = (front: boolean, left: boolean): THREE.Object3D | null => {
    const found = wheels.find((wheel) => {
      const name = wheel.name.toLowerCase();
      const isFront = name.includes('front') || name.includes('fwd');
      const isRear =
        name.includes('back') || name.includes('rear') || name.includes('rwd');
      const isLeft = name.includes('left');
      const isRight = name.includes('right');
      if (front ? !isFront : !isRear) return false;
      return left ? isLeft : isRight;
    });
    return found ?? null;
  };

  const result: THREE.Object3D[] = [];
  for (const wanted of WHEEL_ORDER) {
    const front = wanted.startsWith('front');
    const left = wanted.endsWith('left');
    let wheel = byName(front, left);
    if (!wheel || result.includes(wheel)) {
      // The names are useless: sort the wheels by their position. The front
      // wheels are the ones with the largest z, the left ones the ones with
      // the largest x (the car faces +Z, so its left side is +X).
      const sorted = wheels
        .filter((w) => !result.includes(w))
        .sort((a, b) => {
          const dz = b.position.z - a.position.z;
          if (Math.abs(dz) > 0.05) return dz;
          return b.position.x - a.position.x;
        });
      wheel = front ? sorted[0] : sorted[1];
      if (!wheel) return null;
    }
    result.push(wheel);
  }
  return result;
}

/**
 * A smooth, monotone interpolation through a few points.
 *
 * It is used to bend the body of the model along its length so that the
 * wheel arches end up exactly where the physics puts the wheels.
 */
function monotoneSpline(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const dx: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    ms.push((ys[i + 1] - ys[i]) / dx[i]);
  }
  const c1 = new Array<number>(n);
  c1[0] = ms[0];
  c1[n - 1] = ms[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (ms[i - 1] * ms[i] <= 0) {
      c1[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      c1[i] = (w1 + w2) / (w1 / ms[i - 1] + w2 / ms[i]);
    }
  }
  return (x: number): number => {
    if (x <= xs[0]) return ys[0] + c1[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + c1[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i += 1;
    const h = dx[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * c1[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * c1[i + 1]
    );
  };
}

/** The first material of a mesh (a mesh can carry a list of materials). */
function firstMaterial(mesh: THREE.Mesh): THREE.Material {
  const material = mesh.material;
  return Array.isArray(material) ? material[0] : material;
}

/** The cache of prepared models, so every car of a kind shares the geometry. */
const modelCache = new Map<string, Promise<CarModelAsset | null>>();
/** The models that are already loaded, for a quick synchronous lookup. */
const loadedModels = new Map<string, CarModelAsset | null>();

/** The key that identifies a model of a car. */
function modelKey(path: string, config: VehicleConfig): string {
  return `${path}|${config.id}`;
}

/**
 * Recomputes the tangents of a geometry.
 *
 * The Kenney models ship tangents for their original shape. After the body
 * was bent they are wrong, and a normal map would show it.
 */
function recomputeTangents(geometry: THREE.BufferGeometry): void {
  if (!geometry.index || !geometry.attributes.uv || !geometry.attributes.normal) {
    geometry.deleteAttribute('tangent');
    return;
  }
  try {
    geometry.computeTangents();
  } catch {
    geometry.deleteAttribute('tangent');
  }
}

/**
 * Loads a car model and prepares it for the given car configuration.
 *
 * The model is scaled so that it fills the collision box of the car, the
 * wheel arches are moved onto the axles of the physics and the wheels are
 * centred on their axle so the vehicle can spin them.
 */
export function loadCarModel(
  path: string,
  config: VehicleConfig,
): Promise<CarModelAsset | null> {
  const key = modelKey(path, config);
  const cached = modelCache.get(key);
  if (cached) return cached;

  const promise = prepareCarModel(path, config).catch(() => null);
  modelCache.set(key, promise);
  promise.then((asset) => loadedModels.set(key, asset));
  return promise;
}

/**
 * The model of a car that was loaded before.
 *
 * The traffic creates its cars while the game is running, so it needs a
 * quick way to get a model that is already in memory. When there is none the
 * procedural car is used.
 */
export function getCarModel(
  path: string,
  config: VehicleConfig,
): CarModelAsset | null {
  if (!path || path === 'procedural') return null;
  return loadedModels.get(modelKey(path, config)) ?? null;
}

async function prepareCarModel(
  path: string,
  config: VehicleConfig,
): Promise<CarModelAsset | null> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(path);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // --- find the wheels and the body ---------------------------------------
  const wheelCandidates: THREE.Object3D[] = [];
  const bodyMeshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    if (child.name.toLowerCase().includes('wheel')) wheelCandidates.push(child);
    else bodyMeshes.push(child as THREE.Mesh);
  });
  const wheels = orderWheels(wheelCandidates);
  if (!wheels || bodyMeshes.length === 0) {
    console.warn(`[car] the model ${path} has no usable wheels`);
    return null;
  }

  // The transform of every mesh relative to the root of the model.
  const rootInverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const relative = (mesh: THREE.Object3D): THREE.Matrix4 =>
    new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);

  // --- the size of the model ----------------------------------------------
  const bodyBox = new THREE.Box3();
  const wheelBox = new THREE.Box3();
  const tmpBox = new THREE.Box3();
  const boxOf = (mesh: THREE.Object3D): THREE.Box3 => {
    const geometry = (mesh as THREE.Mesh).geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    tmpBox.copy(geometry.boundingBox!);
    tmpBox.applyMatrix4(relative(mesh));
    return tmpBox;
  };
  for (const mesh of bodyMeshes) bodyBox.union(boxOf(mesh));
  for (const wheel of wheels) wheelBox.union(boxOf(wheel));

  const [width, height, length] = config.dimensions;
  const modelWidth = bodyBox.max.x - bodyBox.min.x;
  const modelLength = bodyBox.max.z - bodyBox.min.z;
  // The ground of the model is the bottom of the tyres.
  const modelGround = wheelBox.min.y;
  const modelTop = bodyBox.max.y;
  if (modelWidth < 0.01 || modelLength < 0.01) return null;

  const scaleX = width / modelWidth;
  const scaleY = height / Math.max(0.01, modelTop - modelGround);
  // The bottom of the car sits `groundClearance` above the road.
  const groundY = -(config.groundClearance + height / 2);

  // --- bend the body so the wheel arches sit on the axles ------------------
  // The models are a little shorter in the wheel base than the physics wants,
  // so the body is stretched between the arches and shortened at the front
  // and at the back. The spline keeps the shape smooth.
  const wheelZ = wheels.map((wheel) => relative(wheel).elements[14]);
  let frontZ = Math.max(...wheelZ);
  let rearZ = Math.min(...wheelZ);
  // The arches have to lie inside the body, otherwise the spline would fold.
  rearZ = Math.min(Math.max(rearZ, bodyBox.min.z + 0.05), frontZ - 0.05);
  frontZ = Math.max(Math.min(frontZ, bodyBox.max.z - 0.05), rearZ + 0.05);
  const spline = monotoneSpline(
    [bodyBox.min.z, rearZ, frontZ, bodyBox.max.z],
    [-length / 2, config.rearAxleOffset, config.frontAxleOffset, length / 2],
  );

  // --- bake the transformation into the body geometry ----------------------
  const body: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  for (const mesh of bodyMeshes) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(relative(mesh));
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      position.setXYZ(
        i,
        (x - (bodyBox.min.x + bodyBox.max.x) / 2) * scaleX,
        (y - modelGround) * scaleY + groundY,
        spline(z),
      );
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    recomputeTangents(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    body.push({ geometry, material: firstMaterial(mesh) });
  }

  // --- the wheels ----------------------------------------------------------
  const preparedWheels: THREE.BufferGeometry[] = [];
  for (const wheel of wheels) {
    const mesh = wheel as THREE.Mesh;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(relative(mesh));
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    // The wheel is a cylinder around the x axis, so its radius is the
    // distance of the y/z values from the centre.
    const modelRadius = Math.max(
      (box.max.y - box.min.y) / 2,
      (box.max.z - box.min.z) / 2,
    );
    const radiusScale = config.wheelRadius / Math.max(0.01, modelRadius);
    // Move the centre of the wheel onto the origin so that the vehicle can
    // spin it around its axle.
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    geometry.translate(-centre.x, -centre.y, -centre.z);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const width = Math.max(0.01, box.max.x - box.min.x);
    const widthScale = (config.wheelRadius * 0.62) / width;
    for (let i = 0; i < position.count; i++) {
      position.setXYZ(
        i,
        position.getX(i) * widthScale,
        position.getY(i) * radiusScale,
        position.getZ(i) * radiusScale,
      );
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    recomputeTangents(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    preparedWheels.push(geometry);
  }

  const material = firstMaterial(bodyMeshes[0]);
  const headlights = findHeadlights(bodyMeshes, relative, material, scaleX, scaleY, spline, modelGround, groundY);

  return { body, wheels: preparedWheels, headlights, material };
}

/**
 * Looks for the head lights of the model.
 *
 * The Kenney models paint the head lights into the colour atlas. The bright
 * yellow swatch of the atlas is used to find the vertices that belong to
 * the head lights.
 */
function findHeadlights(
  bodyMeshes: THREE.Mesh[],
  relative: (mesh: THREE.Object3D) => THREE.Matrix4,
  material: THREE.Material,
  scaleX: number,
  scaleY: number,
  spline: (z: number) => number,
  modelGround: number,
  groundY: number,
): { position: THREE.Vector3; size: THREE.Vector2 }[] {
  const texture = (material as THREE.MeshStandardMaterial).map;
  if (!texture || !texture.image) return [];

  // --- find the yellow swatch in the atlas --------------------------------
  const image = texture.image as TexImageSource;
  const width = (image as HTMLImageElement).width ?? 0;
  const height = (image as HTMLImageElement).height ?? 0;
  if (!width || !height) return [];

  let swatch: { u0: number; u1: number; v0: number; v1: number } | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    context.drawImage(image as CanvasImageSource, 0, 0);
    const data = context.getImageData(0, 0, width, height).data;
    let u0 = 1;
    let u1 = 0;
    let v0 = 1;
    let v1 = 0;
    let found = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // a saturated yellow - that is the head light of the Kenney models
        if (r > 200 && g > 150 && b < 90 && r - b > 120) {
          found += 1;
          const u = (x + 0.5) / width;
          const v = (y + 0.5) / height;
          u0 = Math.min(u0, u);
          u1 = Math.max(u1, u);
          v0 = Math.min(v0, v);
          v1 = Math.max(v1, v);
        }
      }
    }
    if (found < 8) return [];
    swatch = { u0: u0 - 0.01, u1: u1 + 0.01, v0: v0 - 0.01, v1: v1 + 0.01 };
  } catch {
    return [];
  }

  // --- collect the vertices that use the swatch ----------------------------
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  for (const mesh of bodyMeshes) {
    const uv = mesh.geometry.attributes.uv;
    if (!uv) continue;
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const matrix = relative(mesh);
    const v = new THREE.Vector3();
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const w = uv.getY(i);
      if (u < swatch.u0 || u > swatch.u1 || w < swatch.v0 || w > swatch.v1) continue;
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      (v.x >= 0 ? left : right).push(v.clone());
    }
  }
  if (left.length === 0 || right.length === 0) return [];

  const describe = (points: THREE.Vector3[]): { position: THREE.Vector3; size: THREE.Vector2 } => {
    const sum = new THREE.Vector3();
    const box = new THREE.Box3();
    for (const point of points) {
      sum.add(point);
      box.expandByPoint(point);
    }
    const centre = sum.divideScalar(points.length);
    const size = box.getSize(new THREE.Vector3());
    return {
      position: new THREE.Vector3(
        centre.x * scaleX,
        (centre.y - modelGround) * scaleY + groundY,
        spline(centre.z),
      ),
      size: new THREE.Vector2(size.x * scaleX, size.y * scaleY),
    };
  };
  return [describe(left), describe(right)];
}

/**
 * Builds the visual car from a loaded model.
 *
 * The body is added as it is and the four wheels become separate objects
 * that the vehicle can move, spin and steer.
 */
export function buildCarMeshFromModel(
  config: VehicleConfig,
  model: CarModelAsset,
): CarMesh {
  const group = new THREE.Group();
  group.name = `car-${config.id}`;

  for (const part of model.body) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The wheels are separate objects: the vehicle moves them to the axles,
  // spins them and steers the front ones.
  const wheels: THREE.Object3D[] = [];
  for (let i = 0; i < model.wheels.length; i++) {
    const pivot = new THREE.Group();
    pivot.name = `wheel_${['fl', 'fr', 'rl', 'rr'][i] ?? i}`;
    const mesh = new THREE.Mesh(model.wheels[i], model.material);
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    wheels.push(pivot);
  }

  // --- head lights ---------------------------------------------------------
  const lights: THREE.Mesh[] = [];
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2c0,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  for (const light of model.headlights) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(
        Math.max(0.12, light.size.x * 1.15),
        Math.max(0.06, light.size.y * 1.15),
      ),
      glowMaterial,
    );
    glow.position.copy(light.position);
    glow.visible = false;
    group.add(glow);
    lights.push(glow);
  }

  return {
    group,
    wheels,
    lights,
    setHeadlights: (on: boolean) => {
      for (const light of lights) light.visible = on;
    },
  };
}

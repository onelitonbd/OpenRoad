// RoadNetwork.ts — seeded, deterministic road graph
import * as THREE from 'three';
import { seededRng, randomRange, randomInt } from '../utils/random';
import type { Terrain } from './Terrain';

export interface RoadNode {
  id: string;
  pos: THREE.Vector3; // y = terrain height
  edges: string[];
  isIntersection: boolean;
}
export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  points: THREE.Vector3[]; // sampled polyline along spline (world xz+y)
  laneCount: number;
  speedLimit: number; // km/h
  width: number; // total meters
  type: 'downtown' | 'suburb' | 'highway' | 'rural' | 'mountain' | 'coast';
  oneWay?: boolean;
}

export class RoadNetwork {
  nodes = new Map<string, RoadNode>();
  edges = new Map<string, RoadEdge>();
  private rng: () => number;
  private terrain: Terrain;
  private seed: string;

  // Spatial index: grid hash 512m cells for fast query
  private spatial = new Map<string, string[]>(); // cellKey -> edgeIds

  constructor(seed: string, terrain: Terrain) {
    this.seed = seed;
    this.rng = seededRng(seed + ':roads');
    this.terrain = terrain;
    this.generate();
    this.buildSpatialIndex();
  }

  private generate() {
    this.generateDowntownGrid();
    this.generateSuburbClusters();
    this.generateHighways();
    this.generateRuralRoads();
    this.generateMountainSwitchbacks();
    this.generateCoastalRoad();
  }

  private addNode(id: string, x: number, z: number): RoadNode {
    const y = this.terrain.rawHeight(x, z);
    const n: RoadNode = { id, pos: new THREE.Vector3(x, y, z), edges: [], isIntersection: false };
    this.nodes.set(id, n);
    return n;
  }

  private addEdge(id: string, from: string, to: string, points: THREE.Vector3[], laneCount: number, speedLimit: number, type: RoadEdge['type']) {
    const width = laneCount * 3.6 + (type==='downtown'? 3 : 0.6); // include sidewalk extra for downtown
    const edge: RoadEdge = { id, from, to, points, laneCount, speedLimit, width, type };
    this.edges.set(id, edge);
    this.nodes.get(from)?.edges.push(id);
    this.nodes.get(to)?.edges.push(id);
    // Mark intersection if node has >=3 edges
    const fn = this.nodes.get(from); if (fn && fn.edges.length>2) fn.isIntersection=true;
    const tn = this.nodes.get(to); if (tn && tn.edges.length>2) tn.isIntersection=true;
    return edge;
  }

  private generateDowntownGrid() {
    // 5x5 grid centered at 0, spacing 180, with jitter
    const size = 5;
    const spacing = 180;
    const half = (size-1)*spacing/2;
    const nodeGrid: string[][] = [];
    for (let iz=0; iz<size; iz++) {
      const row: string[] = [];
      for (let ix=0; ix<size; ix++) {
        const x = -half + ix*spacing + randomRange(this.rng, -6, 6);
        const z = -half + iz*spacing + randomRange(this.rng, -6, 6);
        // Only within downtown radius ~900? Our grid is 720 span, so within 510 radius — OK inside downtown
        const id = `dt-${ix}-${iz}`;
        this.addNode(id, x, z);
        row.push(id);
      }
      nodeGrid.push(row);
    }
    // Horizontal edges
    for (let iz=0; iz<size; iz++) {
      for (let ix=0; ix<size-1; ix++) {
        const from = nodeGrid[iz][ix];
        const to = nodeGrid[iz][ix+1];
        const a = this.nodes.get(from)!.pos;
        const b = this.nodes.get(to)!.pos;
        const pts = this.straightPoints(a,b,4);
        this.addEdge(`de-h-${ix}-${iz}`, from, to, pts, 2, 50, 'downtown');
      }
    }
    // Vertical edges
    for (let iz=0; iz<size-1; iz++) {
      for (let ix=0; ix<size; ix++) {
        const from = nodeGrid[iz][ix];
        const to = nodeGrid[iz+1][ix];
        const a = this.nodes.get(from)!.pos;
        const b = this.nodes.get(to)!.pos;
        const pts = this.straightPoints(a,b,4);
        this.addEdge(`de-v-${ix}-${iz}`, from, to, pts, 2, 50, 'downtown');
      }
    }
  }

  private generateSuburbClusters() {
    // Create 4 suburb clusters off grid edges
    const clusters = [
      { cx: 1100, cz: 200, count: 12 },
      { cx: -1050, cz: 600, count: 10 },
      { cx: 300, cz: 1300, count: 11 },
      { cx: -400, cz: -900, count: 9 },
    ];
    clusters.forEach((cl, ci) => {
      // Create nodes in cul-de-sac pattern: central spine + branches
      const centerId = `sub-${ci}-c`;
      this.addNode(centerId, cl.cx, cl.cz);
      // Connect to nearest downtown edge node
      const nearestDt = this.findNearestNode(cl.cx, cl.cz, (n)=>n.id.startsWith('dt-'));
      if (nearestDt) {
        const pts = this.smoothSpline(this.nodes.get(nearestDt)!.pos, this.nodes.get(centerId)!.pos, 12);
        this.addEdge(`sub-conn-${ci}`, nearestDt, centerId, pts, 2, 60, 'suburb');
      }
      // Branches
      for (let i=0;i<cl.count;i++) {
        const angle = randomRange(this.rng, 0, Math.PI*2);
        const len = randomRange(this.rng, 120, 320);
        const x = cl.cx + Math.cos(angle)*len;
        const z = cl.cz + Math.sin(angle)*len;
        const nid = `sub-${ci}-n${i}`;
        this.addNode(nid, x, z);
        const pts = this.smoothSpline(this.nodes.get(centerId)!.pos, this.nodes.get(nid)!.pos, 8);
        // Add slight curvature by offsetting middle point
        const midIdx = Math.floor(pts.length/2);
        pts[midIdx].x += randomRange(this.rng, -14,14);
        pts[midIdx].z += randomRange(this.rng, -14,14);
        // re-elevate y after perturb
        pts.forEach(p=> p.y = this.terrain.rawHeight(p.x, p.z));
        this.addEdge(`sub-e-${ci}-${i}`, centerId, nid, pts, 1, 40, 'suburb');
        // occasional cross street between branches
        if (i>0 && this.rng() < 0.28) {
          const prevId = `sub-${ci}-n${i-1}`;
          const a = this.nodes.get(prevId)!.pos;
          const b = this.nodes.get(nid)!.pos;
          if (a.distanceTo(b) < 380) {
            const pts2 = this.smoothSpline(a,b,6);
            this.addEdge(`sub-cross-${ci}-${i}`, prevId, nid, pts2, 1, 30, 'suburb');
          }
        }
      }
    });
  }

  private generateHighways() {
    // Connect region centers: downtown (0,0), mountains (2800,2800), desert (-2000,1600), coast (0,-3200), east farmland (1800,-800)
    const centers: Array<{id:string,x:number,z:number}> = [
      { id:'hw-downtown', x:0, z:0 },
      { id:'hw-mount', x:2800, z:2800 },
      { id:'hw-desert', x:-2200, z:1400 },
      { id:'hw-coast', x:400, z:-3200 },
      { id:'hw-east', x:1900, z:-600 },
      { id:'hw-west', x:-1400, z:-1200 },
    ];
    // Ensure nodes exist at centers (some may coincide with existing)
    centers.forEach(c=> {
      if (!this.nodes.has(c.id)) this.addNode(c.id, c.x, c.z);
    });
    // Pairwise connections with smooth splines avoiding steep slopes (sample terrain and penalize)
    const connections: Array<[string,string]> = [
      ['hw-downtown','hw-mount'],
      ['hw-downtown','hw-coast'],
      ['hw-downtown','hw-east'],
      ['hw-downtown','hw-west'],
      ['hw-downtown','hw-desert'],
      ['hw-mount','hw-east'],
      ['hw-coast','hw-west'],
      ['hw-desert','hw-west'],
    ];
    connections.forEach(([aId,bId], idx) => {
      const a = this.nodes.get(aId)!.pos;
      const b = this.nodes.get(bId)!.pos;
      const pts = this.highwaySpline(a,b, 28);
      this.addEdge(`hw-${idx}`, aId, bId, pts, 3, 110, 'highway');
    });
  }

  private generateRuralRoads() {
    // Branch from highways into countryside: for each highway edge, spawn 2-3 rural offshoots
    const hwEdges = [...this.edges.values()].filter(e=>e.type==='highway');
    hwEdges.forEach((e, ei) => {
      const offshoots = randomInt(this.rng, 1, 3);
      for (let i=0;i<offshoots;i++) {
        const t = randomRange(this.rng, 0.25, 0.75);
        const baseIdx = Math.floor(t * (e.points.length-1));
        const basePos = e.points[baseIdx];
        const angle = randomRange(this.rng, -Math.PI/2, Math.PI/2) + Math.atan2(e.points[Math.min(e.points.length-1, baseIdx+2)].z - basePos.z, e.points[Math.min(e.points.length-1, baseIdx+2)].x - basePos.x) + Math.PI/2;
        const len = randomRange(this.rng, 280, 650);
        const ex = basePos.x + Math.cos(angle)*len;
        const ez = basePos.z + Math.sin(angle)*len;
        // Keep within world bounds
        if (Math.abs(ex)>3800 || Math.abs(ez)>3800) continue;
        const branchId = `rural-${ei}-${i}`;
        const midId = `rural-mid-${ei}-${i}`;
        this.addNode(midId, basePos.x, basePos.z); // temporary helper node for spline start (reuse basePos)
        // But we need a real node at start; instead create a node at basePos offset slightly
        const startNodeId = `rural-start-${ei}-${i}`;
        this.addNode(startNodeId, basePos.x + randomRange(this.rng,-4,4), basePos.z + randomRange(this.rng,-4,4));
        // create small helper edge from highway to start? Actually we connect start node to highway via short straight
        // Simplify: create branch node and edge from startNode to end
        const endId = `rural-end-${ei}-${i}`;
        this.addNode(endId, ex, ez);
        const pts = this.smoothSpline(this.nodes.get(startNodeId)!.pos, this.nodes.get(endId)!.pos, 14);
        this.addEdge(branchId, startNodeId, endId, pts, 1, 70, 'rural');
        // Connect startNode to highway edge via a zero-length connector edge (to keep graph connected)
        // Find closest highway node to connect — use startNodeId to highway edge midpoint projection
        // Create a connector edge to highway's nearest endpoint
        const connId = `rural-conn-${ei}-${i}`;
        // connect to edge's from node for simplicity
        const pts2 = this.smoothSpline(this.nodes.get(e.from)!.pos, this.nodes.get(startNodeId)!.pos, 8);
        // Avoid duplicate; just create a short edge if distance > 30
        if (this.nodes.get(e.from)!.pos.distanceTo(this.nodes.get(startNodeId)!.pos) > 60) {
          this.addEdge(connId, e.from, startNodeId, pts2, 1, 70, 'rural');
        }
      }
    });
  }

  private generateMountainSwitchbacks() {
    // Switchback road up mountain peak near (3000,3000)
    const base = this.nodes.get('hw-mount')?.pos ?? new THREE.Vector3(2800,0,2800);
    let prevId = 'hw-mount';
    let prevPos = base.clone();
    for (let i=0;i<6;i++) {
      const switchAngle = (i%2===0 ? 1 : -1) * (Math.PI/2 + randomRange(this.rng,-0.25,0.25));
      const len = 180 + i*18;
      const nx = prevPos.x + Math.cos(switchAngle)*len;
      const nz = prevPos.z + Math.sin(switchAngle)*len*0.7;
      if (Math.abs(nx)>4000 || Math.abs(nz)>4000) break;
      const nid = `mtn-sw-${i}`;
      this.addNode(nid, nx, nz);
      const pts = this.smoothSpline(prevPos, this.nodes.get(nid)!.pos, 10);
      this.addEdge(`mtn-e-${i}`, prevId, nid, pts, 1, 40, 'mountain');
      prevId = nid;
      prevPos = this.nodes.get(nid)!.pos;
    }
  }

  private generateCoastalRoad() {
    // Coastal road along y ~ -3100 to -3400, x -3000 to 3000
    const yBase = -3200;
    const nodes: string[] = [];
    for (let ix=-4; ix<=4; ix++) {
      const x = ix * 750 + randomRange(this.rng, -40,40);
      const z = yBase + randomRange(this.rng, -80, 80);
      const nid = `coast-${ix+4}`;
      this.addNode(nid, x, z);
      nodes.push(nid);
    }
    for (let i=0;i<nodes.length-1;i++) {
      const a = this.nodes.get(nodes[i])!.pos;
      const b = this.nodes.get(nodes[i+1])!.pos;
      const pts = this.smoothSpline(a,b,12);
      this.addEdge(`coast-e-${i}`, nodes[i], nodes[i+1], pts, 2, 60, 'coast');
    }
    // Connect coastal center to highway coast node
    const coastHw = this.nodes.get('hw-coast');
    if (coastHw) {
      const midCoast = this.nodes.get('coast-4')!;
      const pts = this.smoothSpline(coastHw.pos, midCoast.pos, 14);
      this.addEdge('coast-conn', 'hw-coast', 'coast-4', pts, 2, 70, 'coast');
    }
  }

  // Helpers
  private straightPoints(a:THREE.Vector3, b:THREE.Vector3, steps:number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i=0;i<=steps;i++) {
      const t=i/steps;
      const x = a.x + (b.x-a.x)*t;
      const z = a.z + (b.z-a.z)*t;
      const y = this.terrain.rawHeight(x,z);
      pts.push(new THREE.Vector3(x,y,z));
    }
    return pts;
  }

  private smoothSpline(a:THREE.Vector3, b:THREE.Vector3, samples:number): THREE.Vector3[] {
    // Create a CatmullRom curve with control points, perturb middle for natural
    const midX = (a.x + b.x)/2 + randomRange(this.rng,-40,40);
    const midZ = (a.z + b.z)/2 + randomRange(this.rng,-40,40);
    const midY = this.terrain.rawHeight(midX, midZ);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(a.x, a.y, a.z),
      new THREE.Vector3(midX, midY, midZ),
      new THREE.Vector3(b.x, b.y, b.z),
    ]);
    curve.curveType = 'catmullrom';
    curve.tension = 0.45;
    const pts: THREE.Vector3[] = [];
    const divisions = samples;
    for (let i=0;i<=divisions;i++) {
      const t=i/divisions;
      const p = curve.getPoint(t);
      p.y = this.terrain.rawHeight(p.x, p.z);
      pts.push(p);
    }
    return pts;
  }

  private highwaySpline(a:THREE.Vector3, b:THREE.Vector3, samples:number): THREE.Vector3[] {
    // Highway should avoid steep slopes: we sample terrain roughness and add intermediate waypoints around hills
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = 4;
    const waypoints: THREE.Vector3[] = [a.clone()];
    for (let i=1;i<steps;i++) {
      const t=i/steps;
      const wx = a.x + dx*t + randomRange(this.rng,-120,120);
      const wz = a.z + dz*t + randomRange(this.rng,-120,120);
      const wy = this.terrain.rawHeight(wx,wz);
      // If steep (check slope via neighbor), nudge away
      waypoints.push(new THREE.Vector3(wx, wy, wz));
    }
    waypoints.push(b.clone());
    const curve = new THREE.CatmullRomCurve3(waypoints);
    curve.curveType = 'catmullrom';
    curve.tension = 0.35;
    const pts: THREE.Vector3[] = [];
    for (let i=0;i<=samples;i++) {
      const t=i/samples;
      const p = curve.getPoint(t);
      p.y = this.terrain.rawHeight(p.x, p.z);
      // Highway should be slightly flattened — smooth Y via averaging neighbors
      pts.push(p);
    }
    // Smooth heights for driveability: moving average 3
    for (let i=1;i<pts.length-1;i++) pts[i].y = (pts[i-1].y + pts[i].y + pts[i+1].y)/3;
    return pts;
  }

  private findNearestNode(x:number, z:number, filter?: (n:RoadNode)=>boolean): string | null {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const [id, n] of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < bestDist) { bestDist=d; best=id; }
    }
    return best;
  }

  private buildSpatialIndex() {
    const cellSize = 512;
    for (const edge of this.edges.values()) {
      // Determine cells edge touches via its bounding box
      let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
      for (const p of edge.points) { minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minZ=Math.min(minZ,p.z); maxZ=Math.max(maxZ,p.z); }
      const cMinX = Math.floor(minX / cellSize);
      const cMaxX = Math.floor(maxX / cellSize);
      const cMinZ = Math.floor(minZ / cellSize);
      const cMaxZ = Math.floor(maxZ / cellSize);
      for (let cx=cMinX; cx<=cMaxX; cx++) for (let cz=cMinZ; cz<=cMaxZ; cz++) {
        const k = `${cx},${cz}`;
        let arr = this.spatial.get(k);
        if (!arr) { arr=[]; this.spatial.set(k,arr); }
        arr.push(edge.id);
      }
    }
  }

  // Query APIs
  getEdgesInChunk(minX:number, minZ:number, size:number): RoadEdge[] {
    // Use spatial index for broad phase
    const cellSize = 512;
    const cMinX = Math.floor(minX / cellSize);
    const cMaxX = Math.floor((minX+size) / cellSize);
    const cMinZ = Math.floor(minZ / cellSize);
    const cMaxZ = Math.floor((minZ+size) / cellSize);
    const seen = new Set<string>();
    const result: RoadEdge[] = [];
    for (let cx=cMinX; cx<=cMaxX; cx++) for (let cz=cMinZ; cz<=cMaxZ; cz++) {
      const k = `${cx},${cz}`;
      const ids = this.spatial.get(k);
      if (!ids) continue;
      for (const id of ids) if (!seen.has(id)) {
        seen.add(id);
        const edge = this.edges.get(id)!;
        // Broad BB check against chunk
        let hit=false;
        for (const p of edge.points) if (p.x>=minX-40 && p.x<=minX+size+40 && p.z>=minZ-40 && p.z<=minZ+size+40) { hit=true; break; }
        if (hit) result.push(edge);
      }
    }
    return result;
  }

  getNearestRoad(pos: THREE.Vector3): { edge: RoadEdge, closest: THREE.Vector3, dist:number, t:number } | null {
    let best: { edge: RoadEdge, closest: THREE.Vector3, dist:number, t:number } | null = null;
    let bestDist = Infinity;
    for (const edge of this.edges.values()) {
      for (let i=0;i<edge.points.length-1;i++) {
        const a=edge.points[i], b=edge.points[i+1];
        const closest = closestPointOnSegment(pos, a, b);
        const d = pos.distanceTo(closest);
        if (d < bestDist) {
          bestDist=d;
          best={ edge, closest, dist:d, t: i/(edge.points.length-1) };
        }
      }
    }
    return best;
  }

  getRoadsInRadius(pos: THREE.Vector3, r:number): RoadEdge[] {
    const result: RoadEdge[] = [];
    for (const edge of this.edges.values()) {
      for (const p of edge.points) if (Math.hypot(p.x-pos.x, p.z-pos.z) < r+60) { result.push(edge); break; }
    }
    return result;
  }

  getLanePath(edgeId:string, laneIndex:number): THREE.Vector3[] {
    // Return lane center line offset from edge center by lane offset
    const edge = this.edges.get(edgeId);
    if (!edge) return [];
    const laneWidth = 3.6;
    const totalWidth = edge.width;
    // Compute offset for each lane: lanes centered
    // For 2 lanes, offsets -1.8 +1.8, for 3 lanes -3.6 0 +3.6, etc.
    const offset = (laneIndex - (edge.laneCount-1)/2) * laneWidth;
    // Offset each point sideways (perpendicular to direction)
    const path: THREE.Vector3[] = [];
    for (let i=0;i<edge.points.length;i++) {
      const p = edge.points[i];
      // direction
      const prev = edge.points[Math.max(0,i-1)];
      const next = edge.points[Math.min(edge.points.length-1,i+1)];
      const dir = new THREE.Vector3(next.x-prev.x, 0, next.z-prev.z).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x); // left
      const off = perp.multiplyScalar(offset);
      path.push(new THREE.Vector3(p.x+off.x, p.y+0.05, p.z+off.z));
    }
    return path;
  }

  // For terrain flattening: returns road height if near road, else null
  roadHeightAt(x:number, z:number): number | null {
    const tmp = new THREE.Vector3(x,0,z);
    const nearest = this.getNearestRoad(tmp);
    if (!nearest) return null;
    const blendDist = nearest.edge.width*0.5 + 7; // 7m blend beyond edge
    if (nearest.dist > blendDist) return null;
    const roadY = nearest.closest.y;
    const baseY = this.terrain.rawHeight(x,z);
    // Blend: within road width, full flatten to roadY; beyond, lerp
    const t = Math.min(1, nearest.dist / blendDist);
    // smoothstep
    const blend = 1 - (t*t*(3-2*t));
    // But we want near road strong flatten: at dist 0 => roadY, at blendDist => baseY
    // So weight = 1-blend? Let's compute: dist small => t small => blend small => 1-blend ~1 => more road
    const w = 1 - t; // linear for simplicity
    // Use cubic
    const w2 = w*w*(3-2*w);
    return baseY * (1 - w2) + roadY * w2;
  }
}

function closestPointOnSegment(p:THREE.Vector3, a:THREE.Vector3, b:THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3(b.x-a.x, 0, b.z-a.z);
  const ap = new THREE.Vector3(p.x-a.x, 0, p.z-a.z);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / (ab.lengthSq() || 1)));
  return new THREE.Vector3(a.x + ab.x*t, a.y + (b.y-a.y)*t, a.z + ab.z*t);
}

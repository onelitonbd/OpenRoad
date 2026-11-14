// RoadMesh.ts — builds road geometry along splines
import * as THREE from 'three';
import type { RoadEdge } from './RoadNetwork';

// Build a single road ribbon mesh for an edge clipped to chunk bounds
export class RoadMesh {
  // Create one mesh per edge portion inside chunk
  static buildEdgeMeshesForChunk(edge: RoadEdge, minX:number, minZ:number, size:number, originOffset: THREE.Vector3): THREE.Mesh[] {
    // Clip edge points to chunk with margin
    const margin = 30;
    const clipped = clipPolylineToChunk(edge.points, minX-margin, minZ-margin, size+margin*2);
    if (clipped.length < 2) return [];

    // Create ribbon geometry extruded along polyline
    const width = edge.width - (edge.type==='downtown'? 0 : 0); // full width
    const meshes: THREE.Mesh[] = [];

    // Road surface ribbon
    const { geo, uvs } = buildRibbon(clipped, width, originOffset);
    const mat = roadMaterial(edge.type);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // Offset slightly above terrain to avoid z-fighting
    mesh.position.y = 0.05;
    meshes.push(mesh);

    // Add lane markings as thin planes slightly above road
    if (edge.laneCount > 1) {
      const markings = buildLaneMarkings(clipped, edge, originOffset);
      if (markings) meshes.push(markings);
    }

    // Downtown adds sidewalks/curb: two thin boxes along edges
    if (edge.type==='downtown') {
      const curbs = buildCurbs(clipped, width, originOffset);
      meshes.push(...curbs);
    }

    return meshes;
  }
}

function roadMaterial(type: string): THREE.Material {
  const colors: Record<string,string> = {
    downtown: '#2e3440',
    suburb: '#3b4252',
    highway: '#2e3440',
    rural: '#3c3b3a',
    mountain: '#4a4e52',
    coast: '#334155',
  };
  const c = colors[type] ?? '#323232';
  return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.02 });
}

function buildRibbon(points: THREE.Vector3[], width:number, originOffset: THREE.Vector3): { geo: THREE.BufferGeometry, uvs: Float32Array } {
  const half = width/2;
  const vertCount = points.length * 2;
  const positions = new Float32Array(vertCount*3);
  const normals = new Float32Array(vertCount*3);
  const uvs = new Float32Array(vertCount*2);
  const indices: number[] = [];

  // Compute directions and perps
  for (let i=0;i<points.length;i++) {
    const p = points[i];
    const prev = points[Math.max(0,i-1)];
    const next = points[Math.min(points.length-1,i+1)];
    const dir = new THREE.Vector3(next.x-prev.x, 0, next.z-prev.z).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    // Left and right vertices
    const left = new THREE.Vector3(p.x + perp.x*half, p.y+0.02, p.z + perp.z*half);
    const right = new THREE.Vector3(p.x - perp.x*half, p.y+0.02, p.z - perp.z*half);
    // Apply origin offset
    left.sub(originOffset);
    right.sub(originOffset);
    const base = i*2;
    positions[base*3+0]=left.x; positions[base*3+1]=left.y; positions[base*3+2]=left.z;
    positions[base*3+3]=right.x; positions[base*3+4]=right.y; positions[base*3+5]=right.z;
    normals[base*3+1]=1; normals[base*3+4]=1; // up
    const u = i / (points.length-1);
    uvs[base*2+0]=0; uvs[base*2+1]=u* (points.length*0.15); // stretch along road
    uvs[base*2+2]=1; uvs[base*2+3]=uvs[base*2+1];
  }
  for (let i=0;i<points.length-1;i++) {
    const base = i*2;
    // two tris
    indices.push(base, base+2, base+1);
    indices.push(base+1, base+2, base+3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals,3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs,2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geo, uvs };
}

function buildLaneMarkings(points: THREE.Vector3[], edge: RoadEdge, originOffset: THREE.Vector3): THREE.Mesh | null {
  // Dashed center lines: subdivide line into segments
  if (edge.laneCount < 2) return null;
  // For each lane divider, create a dashed plane
  const dividers = edge.laneCount - 1;
  const group = new THREE.Group();
  // Simplify: build one central dashed line as small boxes
  // We'll create a line mesh using Ribbon of narrow width with dashed via alpha cut? Instead create instanced small planes per dash.
  const dashLen = 6, gap = 6;
  let dist = 0;
  let prev = points[0];
  const positions: THREE.Vector3[] = [];
  const rotations: number[] = [];
  for (let i=1;i<points.length;i++) {
    const cur = points[i];
    const segLen = Math.hypot(cur.x-prev.x, cur.z-prev.z);
    const dir = new THREE.Vector3(cur.x-prev.x,0,cur.z-prev.z).normalize();
    const heading = Math.atan2(dir.z, dir.x);
    let segPos = 0;
    while (segPos < segLen) {
      const t = segPos / segLen;
      const x = prev.x + dir.x * segPos;
      const z = prev.z + dir.z * segPos;
      const y = prev.y + (cur.y-prev.y)*(segPos/segLen) + 0.06;
      // dash only on full dash intervals
      if (Math.floor((dist+segPos)/(dashLen+gap)) %2===0) {
        positions.push(new THREE.Vector3(x,y,z));
        rotations.push(heading);
      }
      segPos += dashLen+gap;
    }
    dist += segLen;
    prev = cur;
  }
  if (positions.length===0) return null;
  // Create instanced mesh for dashes
  const dashW = 0.22;
  const dashGeo = new THREE.PlaneGeometry(dashLen*0.9, dashW);
  dashGeo.rotateX(-Math.PI/2);
  // rotate to face road direction per instance via InstancedMesh
  const mat = new THREE.MeshStandardMaterial({ color: '#fef08a', emissive: '#facc15', emissiveIntensity: 0.15, roughness: 0.9 });
  const inst = new THREE.InstancedMesh(dashGeo, mat, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((pos,i)=>{
    dummy.position.copy(pos).sub(originOffset);
    dummy.rotation.y = -rotations[i];
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  });
  inst.instanceMatrix.needsUpdate = true;
  // For simplicity return instancedMesh as Mesh-like — we wrap in a Group mesh conversion
  // Three can render InstancedMesh directly
  // We return it as Mesh via type hack — caller expects Mesh[] but InstancedMesh is subclass of Mesh
  return inst as unknown as THREE.Mesh;
}

function buildCurbs(points: THREE.Vector3[], roadWidth:number, originOffset: THREE.Vector3): THREE.Mesh[] {
  const curbH = 0.14;
  const curbW = 0.45;
  const halfRoad = roadWidth/2;
  // Two curbs at road edges
  const meshes: THREE.Mesh[] = [];
  // Build sidewalks as thin strips slightly wider than curb
  for (const side of [-1,1] as const) {
    const curbPoints: THREE.Vector3[] = [];
    const sidewalkPoints: THREE.Vector3[] = [];
    // collect positions offset outward
    for (let i=0;i<points.length;i++) {
      const p = points[i];
      const prev = points[Math.max(0,i-1)];
      const next = points[Math.min(points.length-1,i+1)];
      const dir = new THREE.Vector3(next.x-prev.x,0,next.z-prev.z).normalize();
      const perp = new THREE.Vector3(-dir.z,0,dir.x);
      const curbOuter = new THREE.Vector3(p.x + perp.x*halfRoad*side, p.y+curbH*0.5, p.z+perp.z*halfRoad*side);
      const sidewalkOuter = new THREE.Vector3(p.x + perp.x*(halfRoad+1.2)*side, p.y+0.11, p.z+perp.z*(halfRoad+1.2)*side);
      // combine into line strip: curb as wall — instead we create a ribbon that is vertical?
      // Simplify: sidewalk plane
      curbPoints.push(curbOuter);
      sidewalkPoints.push(sidewalkOuter);
    }
    // Sidewalk ribbon
    const sidewalkWidth = 1.2;
    const { geo } = buildRibbon(points.map((p,i)=>{
      // offset sidewalk center
      const prev = points[Math.max(0,i-1)];
      const next = points[Math.min(points.length-1,i+1)];
      const dir = new THREE.Vector3(next.x-prev.x,0,next.z-prev.z).normalize();
      const perp = new THREE.Vector3(-dir.z,0,dir.x);
      return new THREE.Vector3(p.x + perp.x*(halfRoad+sidewalkWidth*0.5)*side, p.y+0.11, p.z+perp.z*(halfRoad+sidewalkWidth*0.5)*side);
    }), sidewalkWidth, originOffset);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9 });
    const sidewalkMesh = new THREE.Mesh(geo, sidewalkMat);
    sidewalkMesh.receiveShadow = true;
    meshes.push(sidewalkMesh);
  }
  return meshes;
}

function clipPolylineToChunk(points: THREE.Vector3[], minX:number, minZ:number, size:number): THREE.Vector3[] {
  // Simple clip: keep points where at least one endpoint near chunk (with margin already)
  const out: THREE.Vector3[] = [];
  const maxX = minX+size, maxZ = minZ+size;
  for (let i=0;i<points.length;i++) {
    const p = points[i];
    // Keep points that are within or adjacent to chunk BB expanded
    // For smooth continuity across chunks, keep all points that lie near chunk envelope
    if (p.x >= minX-50 && p.x <= maxX+50 && p.z >= minZ-50 && p.z <= maxZ+50) {
      out.push(p);
    } else {
      // If we have started collecting and now out-of-bounds, keep one extra to avoid gaps, then break segment
      if (out.length>1) {
        // include this out-of-bounds as closing point to avoid gap at chunk border
        // but limit to only if next point might re-enter (check)
        const next = points[i+1];
        if (next && next.x >= minX-50 && next.x <= maxX+50 && next.z >= minZ-50 && next.z <= maxZ+50) {
          out.push(p);
        } else if (out.length>0) {
          // end current segment — but we return as single polyline; gaps at chunk edges are okay if road spans multiple chunks
          // keep as is, will be joined via next chunk's overlapping margin
        }
      }
    }
  }
  return out;
}

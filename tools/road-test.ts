/**
 * Checks the generated road network: statistics, connectivity and whether the
 * terrain is really flattened under the roads.
 *
 * Run with: npm run test:roads
 */
import { Terrain } from '../src/world/Terrain';
import { RoadNetwork } from '../src/world/RoadNetwork';
import { RoadFlattener } from '../src/world/RoadFlattener';
import { WORLD_HALF } from '../src/world/Terrain';

function main(): void {
  const terrain = new Terrain(1337);
  const roads = new RoadNetwork();
  const start = Date.now();
  roads.build(1337, terrain);
  const buildTime = Date.now() - start;

  console.log(`Road network built in ${buildTime} ms`);
  console.log(`  nodes          : ${roads.nodes.length}`);
  console.log(`  edges          : ${roads.edges.length}`);
  console.log(`  segments       : ${roads.segmentCount}`);
  console.log(`  total length   : ${(roads.totalLength / 1000).toFixed(2)} km`);

  const byType: Record<string, number> = {};
  for (const edge of roads.edges) {
    byType[edge.type] = (byType[edge.type] ?? 0) + 1;
  }
  console.log('  by type        :', byType);

  // --- connectivity: how many nodes are reachable from node 0? ---
  const adjacency = new Map<number, number[]>();
  for (const edge of roads.edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
    adjacency.get(edge.a)!.push(edge.b);
    adjacency.get(edge.b)!.push(edge.a);
  }
  const visited = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  console.log(
    `  connected      : ${visited.size} / ${roads.nodes.length} nodes reachable from node 0`,
  );

  // --- the terrain must be flat under the roads ---
  const flattener = new RoadFlattener(
    roads.edges.map((edge) => ({
      points: edge.points,
      heights: edge.heights,
      width: edge.width,
    })),
  );
  terrain.flattener = flattener;

  let worstOffset = 0;
  let worstAt = '';
  let samples = 0;
  for (const edge of roads.edges) {
    for (let i = 0; i < edge.points.length / 2; i += 3) {
      const x = edge.points[i * 2];
      const z = edge.points[i * 2 + 1];
      const ground = terrain.groundHeight(x, z);
      const offset = Math.abs(ground - edge.heights[i]);
      samples++;
      if (offset > worstOffset) {
        worstOffset = offset;
        worstAt = `${edge.type} (${x.toFixed(0)}, ${z.toFixed(0)})`;
      }
    }
  }
  console.log(
    `  road surface   : ${samples} samples, biggest deviation ${worstOffset.toFixed(3)} m (${worstAt})`,
  );

  // --- the road must not be covered by terrain next to it ---
  let covered = 0;
  for (const edge of roads.edges) {
    for (let i = 0; i < edge.points.length / 2; i += 5) {
      const x = edge.points[i * 2];
      const z = edge.points[i * 2 + 1];
      const hit = roads.nearestRoad(x, z, 40);
      if (hit && hit.distance < 1) covered++;
    }
  }
  console.log(`  road lookup    : ${covered} points resolved to their own road`);

  // --- no road of zero length: they are the sign of a broken junction ---
  let empty = 0;
  for (const edge of roads.edges) {
    if (edge.length < 1) empty += 1;
  }
  console.log(`  empty roads    : ${empty}`);

  // --- the map has a fixed border: no road may leave the world ---
  let outside = 0;
  let furthest = 0;
  for (const edge of roads.edges) {
    for (let i = 0; i < edge.points.length; i += 2) {
      const radius = Math.max(Math.abs(edge.points[i]), Math.abs(edge.points[i + 1]));
      if (radius > furthest) furthest = radius;
      if (radius > WORLD_HALF) outside += 1;
    }
  }
  console.log(
    `  map border     : ${outside} points outside the ${WORLD_HALF} m border, the furthest is ${furthest.toFixed(0)} m from the centre`,
  );

  // --- the map never grows: building it again gives the same map ---
  const fingerprint = (network: RoadNetwork): string =>
    network.edges
      .map((edge) => `${edge.a}-${edge.b}:${edge.type}:${edge.points.length}`)
      .join('|');
  const second = new RoadNetwork();
  second.build(1337, terrain);
  const sameMap = fingerprint(second) === fingerprint(roads);
  console.log(`  map is fixed   : ${sameMap ? 'yes' : 'NO'} (two builds are identical)`);

  // --- every country road starts at a real junction on the highway ---
  const highwayNodes = new Set<number>();
  for (const edge of roads.edges) {
    if (edge.type !== 'highway' && edge.type !== 'avenue') continue;
    highwayNodes.add(edge.a);
    highwayNodes.add(edge.b);
  }
  let dangling = 0;
  let rural = 0;
  for (const edge of roads.edges) {
    if (edge.type !== 'rural') continue;
    rural += 1;
    // The country road has to hang on the highway at one end. The other
    // end is a dead end out in the fields.
    if (!highwayNodes.has(edge.a) && !highwayNodes.has(edge.b)) {
      dangling += 1;
      console.log(
        `    hanging: rural #${edge.id} from (${roads.nodes[edge.a].x.toFixed(0)}, ${roads.nodes[edge.a].z.toFixed(0)}) to (${roads.nodes[edge.b].x.toFixed(0)}, ${roads.nodes[edge.b].z.toFixed(0)})`,
      );
    }
  }
  console.log(
    `  country roads  : ${rural} roads, ${dangling} of them hang in the air`,
  );

  // --- ASCII map of the roads ---
  const size = 76;
  const step = 8000 / size;
  const map: string[] = [];
  for (let r = 0; r < size; r++) {
    let line = '';
    for (let c = 0; c < size; c++) {
      const x = -4000 + (c + 0.5) * step;
      const z = -4000 + (r + 0.5) * step;
      const hit = roads.nearestRoad(x, z, step * 0.6);
      if (!hit) {
        line += '.';
        continue;
      }
      switch (hit.edge.type) {
        case 'highway':
          line += '=';
          break;
        case 'avenue':
          line += '#';
          break;
        case 'street':
          line += '-';
          break;
        case 'coastal':
          line += '~';
          break;
        case 'switchback':
          line += '^';
          break;
        default:
          line += '+';
          break;
      }
    }
    map.push(line);
  }
  console.log('\nRoad map (= highway, # avenue, - street, ~ coastal, ^ switchback):');
  for (const line of map) console.log('  ' + line);

  for (const edge of roads.edges) {
    let edgeOut = 0;
    for (let i = 0; i < edge.points.length; i += 2) {
      if (Math.max(Math.abs(edge.points[i]), Math.abs(edge.points[i + 1])) > WORLD_HALF) edgeOut += 1;
    }
    if (edgeOut > 0) {
      console.log(
        `    outside: ${edge.type} #${edge.id} from (${edge.points[0].toFixed(0)}, ${edge.points[1].toFixed(0)}) to (${edge.points[edge.points.length - 2].toFixed(0)}, ${edge.points[edge.points.length - 1].toFixed(0)}) - ${edgeOut} points`,
      );
    }
  }

  // --- the roads near the car must not change while the car moves ---
  // If a road drops out of the list and comes back later, it appears in
  // front of the player while they are driving.
  let unstable = 0;
  for (let i = 0; i < 120; i++) {
    const x = (i * 97) % 2600 - 1300;
    const z = (i * 53) % 2600 - 1300;
    const near = new Set(roads.roadsInRadius(x, z, 150).map((edge) => edge.id));
    const wide = new Set(roads.roadsInRadius(x, z, 2025).map((edge) => edge.id));
    for (const id of near) {
      if (!wide.has(id)) unstable += 1;
    }
  }
  console.log(`  roads near the car: ${unstable} roads change while the car drives`);
  if (unstable > 0) {
    problems.push(`${unstable} roads appear while the player drives`);
  }

  // --- the result ---
  const problems: string[] = [];
  if (outside > 0) problems.push(`${outside} road points lie outside the map`);
  if (!sameMap) problems.push('the map changes between two builds');
  if (dangling > 0) problems.push(`${dangling} country roads hang in the air`);
  if (empty > 0) problems.push(`${empty} roads have zero length`);
  if (problems.length > 0) {
    console.log('\nFAILED: ' + problems.join(', '));
    process.exit(1);
  }
  console.log('\nOK: the map is fixed and stays inside its border.');
}

main();

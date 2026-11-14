/**
 * Checks the generated road network: statistics, connectivity and whether the
 * terrain is really flattened under the roads.
 *
 * Run with: npm run test:roads
 */
import { Terrain } from '../src/world/Terrain';
import { RoadNetwork } from '../src/world/RoadNetwork';
import { RoadFlattener } from '../src/world/RoadFlattener';

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
}

main();

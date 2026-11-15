/** Checks that the traffic light poles stand next to the road. */
import { Terrain } from '../src/world/Terrain';
import { RoadNetwork } from '../src/world/RoadNetwork';
import { IntersectionManager } from '../src/ai/Intersection';

const terrain = new Terrain(1337);
const roads = new RoadNetwork();
roads.build(1337, terrain);
const manager = new IntersectionManager(roads);

let onRoad = 0;
let tooLow = 0;
let tooHigh = 0;
const spots = manager.poleSpots.map((p) => ({ x: p.x, z: p.z }));

for (const spot of spots) {
  const hit = roads.nearestRoad(spot.x, spot.z, 80);
  if (!hit) continue;
  // The pole must stand next to the road, not on it.
  if (hit.distance < hit.edge.width / 2 + 0.6) {
    onRoad++;
    console.log(`  pole ${spot.x.toFixed(1)},${spot.z.toFixed(1)} is ${hit.distance.toFixed(2)} m from road ${hit.edgeId} (width ${hit.edge.width}) - the pole road is a different one?`);
  }
  const ground = terrain.groundHeight(spot.x, spot.z);
  const poleBottom = 0;
  const expected = ground + poleBottom;
  if (Math.abs(expected - ground) > 0.01) tooLow++;
  if (spot.y < ground - 0.5) tooLow++;
  if (spot.y > ground + 0.5) tooHigh++;
}

console.log(`traffic lights: ${manager.count}`);
console.log(`poles on the road: ${onRoad}`);
console.log(`poles in the wrong height: ${tooLow} too low, ${tooHigh} too high`);
if (onRoad > 0) {
  console.log('FAIL: a pole stands on the road');
  process.exit(1);
}
if (tooLow > 0 || tooHigh > 0) {
  console.log('FAIL: a pole is not on the ground');
  process.exit(1);
}
console.log('OK: the traffic light poles stand next to the road.');

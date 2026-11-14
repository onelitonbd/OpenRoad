// random.ts — seeded RNG (mulberry32) + helpers
export function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function seededRng(seed: number | string) {
  const n = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return mulberry32(n);
}
export function randomRange(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}
export function randomInt(rng: () => number, min: number, max: number) {
  return Math.floor(randomRange(rng, min, max + 1));
}
export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

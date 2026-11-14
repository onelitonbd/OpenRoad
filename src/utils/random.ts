/**
 * Deterministic pseudo random numbers.
 *
 * The whole world is generated from a single numeric seed, so every random
 * decision must be reproducible. We therefore never use `Math.random()` for
 * world content - only a seeded generator is used.
 *
 * `mulberry32` is used because it is tiny, fast and has good enough
 * distribution for procedural generation.
 */

export type RandomSource = () => number;

/** Create a seeded random generator (returns numbers in [0, 1)). */
export function makeRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32 bit integer seed (FNV-1a). */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Combine two integers into a new well mixed seed. */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ Math.imul(b >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** A tiny helper object wrapping a seeded generator with useful methods. */
export class Rng {
  private next: RandomSource;

  constructor(seed: number) {
    this.next = makeRandom(seed);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  /** Random element of an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  /** True with the given probability (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Random sign, -1 or 1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }
}

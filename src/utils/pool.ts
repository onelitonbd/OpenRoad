/**
 * A very small object pool.
 *
 * The performance rules say "no per frame allocations in hot paths". Traffic
 * cars, particles and UI rows are created and destroyed constantly, so they
 * are recycled through this pool instead of relying on the garbage collector.
 */
export class Pool<T> {
  private free: T[] = [];
  private live = 0;

  constructor(
    private factory: () => T,
    private reset: (item: T) => void,
    prefill = 0,
  ) {
    for (let i = 0; i < prefill; i++) {
      this.free.push(factory());
    }
  }

  /** Take an object out of the pool (creates one if the pool is empty). */
  acquire(): T {
    this.live++;
    const item = this.free.pop();
    if (item !== undefined) return item;
    return this.factory();
  }

  /** Give an object back to the pool. */
  release(item: T): void {
    this.live--;
    this.reset(item);
    this.free.push(item);
  }

  /** Number of objects currently handed out. */
  get activeCount(): number {
    return this.live;
  }

  /** Number of objects sitting idle in the pool. */
  get freeCount(): number {
    return this.free.length;
  }
}

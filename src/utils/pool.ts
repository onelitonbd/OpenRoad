// pool.ts — generic object pool to avoid GC spikes
export class Pool<T> {
  private pool: T[] = [];
  constructor(private create: () => T, private reset?: (o: T) => void, initial = 0) {
    for (let i = 0; i < initial; i++) this.pool.push(create());
  }
  acquire(): T {
    return this.pool.pop() ?? this.create();
  }
  release(o: T) {
    this.reset?.(o);
    this.pool.push(o);
  }
  size() { return this.pool.length; }
}

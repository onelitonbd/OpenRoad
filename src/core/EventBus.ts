// EventBus.ts — tiny pub/sub
type Handler<T = unknown> = (payload: T) => void;

export class EventBus {
  private map = new Map<string, Set<Handler>>();

  on<T>(event: string, handler: Handler<T>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(handler as Handler);
    return () => set!.delete(handler as Handler);
  }

  off<T>(event: string, handler: Handler<T>) {
    this.map.get(event)?.delete(handler as Handler);
  }

  emit<T>(event: string, payload?: T) {
    const set = this.map.get(event);
    if (!set) return;
    for (const h of set) (h as Handler<T>)(payload as T);
  }

  clear() {
    this.map.clear();
  }
}

export const globalBus = new EventBus();

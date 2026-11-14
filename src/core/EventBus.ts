/**
 * A tiny typed publish/subscribe bus.
 *
 * Used to let systems (audio, HUD, save manager) react to game events without
 * knowing about each other.
 */

export type EventMap = Record<string, unknown>;

type Handler<T> = (payload: T) => void;

export class EventBus<M extends EventMap = EventMap> {
  private handlers = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof M>(event: K, handler: Handler<M[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy so handlers can unsubscribe while we iterate.
    for (const handler of Array.from(set)) {
      (handler as Handler<M[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Events used across the whole game. */
export interface GameEvents extends EventMap {
  'state:changed': { from: string; to: string };
  'car:selected': { id: string; color: string };
  'race:started': { raceId: string };
  'race:finished': { raceId: string; position: number; time: number };
  'settings:changed': { quality: string };
  'toast': { message: string; duration?: number };
}

export const bus = new EventBus<GameEvents>();

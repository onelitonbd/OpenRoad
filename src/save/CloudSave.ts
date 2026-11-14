// CloudSave.ts — Supabase stub, same interface, local fallback for now
import type { SaveData, ISaveManager } from './SaveManager';
import { LocalSave } from './LocalSave';

export class CloudSave implements ISaveManager {
  private fallback = new LocalSave();
  // TODO: implement Supabase auth + RLS when VITE_SUPABASE_URL and ANON_KEY present
  // For now, delegate to LocalSave so saves work offline
  async save(data: Partial<SaveData>): Promise<void> { return this.fallback.save(data); }
  async load(): Promise<SaveData | null> { return this.fallback.load(); }
  async clear(): Promise<void> { return this.fallback.clear(); }
}

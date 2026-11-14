// LocalSave.ts — localStorage
import type { SaveData, ISaveManager } from './SaveManager';
const KEY='openroad:save'; const VERSION=1;
export class LocalSave implements ISaveManager {
  async save(data: Partial<SaveData>): Promise<void> {
    try{
      const existing=await this.load();
      const base: SaveData = existing ?? {
        version: VERSION,
        selectedCarId: 'comet-gt',
        carColors: {},
        bestTimes: {},
        settings: {},
        lastPosition: [0,0.6,0],
        lastHeading: 0,
        timeOfDay: 10.5,
        seed: localStorage.getItem('openroad:seed') || 'open-road-seed',
        updatedAt: Date.now(),
      };
      const merged: SaveData = {
        ...base,
        ...data,
        version: VERSION,
        updatedAt: Date.now(),
      } as SaveData;
      localStorage.setItem(KEY, JSON.stringify(merged));
    } catch{}
  }
  async load(): Promise<SaveData|null>{
    try{ const raw=localStorage.getItem(KEY); if(!raw) return null; const data=JSON.parse(raw) as SaveData; if(data.version!==VERSION) data.version=VERSION; return data; } catch{ return null; }
  }
  async clear(): Promise<void>{ try{ localStorage.removeItem(KEY);} catch{} }
}

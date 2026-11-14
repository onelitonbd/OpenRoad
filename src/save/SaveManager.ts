// SaveManager.ts — interface
export interface SaveData {
  version: number;
  selectedCarId: string;
  carColors: Record<string,string>;
  bestTimes: Record<string, number>; // raceId -> ms
  settings: Record<string, unknown>;
  lastPosition: [number, number, number];
  lastHeading: number;
  timeOfDay: number;
  seed: string;
  updatedAt: number;
}
export interface ISaveManager {
  save(data: Partial<SaveData>): Promise<void>;
  load(): Promise<SaveData | null>;
  clear(): Promise<void>;
}

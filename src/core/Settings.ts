// Settings.ts — quality presets + persistence

export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  label: string;
  chunkRadius: number; // Chebyshev
  terrainVerts: number; // per chunk side (32, 48, 64)
  trafficCap: number;
  shadows: false | 1024 | 2048;
  rainParticles: number;
  pixelRatioCap: number;
  buildingWindowDetail: 'simple' | 'emissive';
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: {
    label: 'Low',
    chunkRadius: 3,
    terrainVerts: 32,
    trafficCap: 15,
    shadows: false,
    rainParticles: 1500,
    pixelRatioCap: 1,
    buildingWindowDetail: 'simple',
  },
  medium: {
    label: 'Medium',
    chunkRadius: 4,
    terrainVerts: 48,
    trafficCap: 30,
    shadows: 1024,
    rainParticles: 4000,
    pixelRatioCap: 1.5,
    buildingWindowDetail: 'simple',
  },
  high: {
    label: 'High',
    chunkRadius: 6,
    terrainVerts: 64,
    trafficCap: 50,
    shadows: 2048,
    rainParticles: 8000,
    pixelRatioCap: 2,
    buildingWindowDetail: 'emissive',
  },
};

export interface SettingsData {
  quality: Quality;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  showTouchControls: 'auto' | 'on' | 'off';
  dayTimeScale: number; // 0 = paused
  invertSteer: boolean;
}

const STORAGE_KEY = 'openroad:settings';
const DEFAULTS: SettingsData = {
  quality: 'low', // dev default as per PROJECT.md
  masterVolume: 0.8,
  sfxVolume: 0.9,
  musicVolume: 0.5,
  muted: false,
  showTouchControls: 'auto',
  dayTimeScale: 1,
  invertSteer: false,
};

export class Settings {
  data: SettingsData;

  constructor() {
    this.data = { ...DEFAULTS, ...this.load() };
    // In production default could be medium; keep low for dev unless user changed
    // Persist immediately to ensure key exists
    this.save();
  }

  get quality(): Quality { return this.data.quality; }
  get preset(): QualityPreset { return QUALITY_PRESETS[this.data.quality]; }

  setQuality(q: Quality) {
    this.data.quality = q;
    this.save();
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]) {
    this.data[key] = value;
    this.save();
  }

  private load(): Partial<SettingsData> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch { return {}; }
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch {}
  }
}

export const settings = new Settings();

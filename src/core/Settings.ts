/**
 * Global settings and quality presets.
 *
 * Everything the player can tweak lives here. The object is a plain singleton
 * with a `save()`/`load()` pair backed by localStorage so the choice survives
 * a page reload. Every expensive feature in the game reads from here.
 */

export type QualityPreset = 'low' | 'medium' | 'high';

export interface QualitySettings {
  /** How many chunks around the player stay loaded (Chebyshev radius). */
  chunkRadius: number;
  /** Terrain vertices per chunk edge (32 -> 1024 verts per chunk). */
  terrainResolution: number;
  /** Maximum number of AI traffic cars alive at once. */
  trafficCap: number;
  /** Shadow map size in pixels, 0 disables shadows. */
  shadowMapSize: number;
  /** Number of rain particles. */
  rainParticles: number;
  /** Upper bound for `devicePixelRatio`. */
  pixelRatioCap: number;
  /** Enable building window emissive detail. */
  buildingWindowEmissive: boolean;
  /** Draw distance of the far clip plane in metres. */
  farPlane: number;
  /** Distance of the fog in metres (roughly where chunks pop in). */
  fogDistance: number;
  /** Maximum number of AI cars that use full rigid body physics. */
  physicsTrafficCount: number;
}

export const QUALITY_PRESETS: Record<QualityPreset, QualitySettings> = {
  low: {
    chunkRadius: 3,
    terrainResolution: 32,
    trafficCap: 15,
    shadowMapSize: 0,
    rainParticles: 1500,
    pixelRatioCap: 1,
    buildingWindowEmissive: false,
    farPlane: 900,
    fogDistance: 620,
    physicsTrafficCount: 4,
  },
  medium: {
    chunkRadius: 4,
    terrainResolution: 48,
    trafficCap: 30,
    shadowMapSize: 1024,
    rainParticles: 4000,
    pixelRatioCap: 1.5,
    buildingWindowEmissive: false,
    farPlane: 1400,
    fogDistance: 1000,
    physicsTrafficCount: 8,
  },
  high: {
    chunkRadius: 6,
    terrainResolution: 64,
    trafficCap: 50,
    shadowMapSize: 2048,
    rainParticles: 8000,
    pixelRatioCap: 2,
    buildingWindowEmissive: true,
    farPlane: 2000,
    fogDistance: 1500,
    physicsTrafficCount: 12,
  },
};

/**
 * How far the road meshes have to reach.
 *
 * The roads have to be built *before* they come out of the fog, otherwise
 * a road appears right in front of the car while it is driving. The
 * distance is therefore always larger than the fog - and a bit more than
 * the terrain chunks, so the road is there before the ground under it.
 */
export function roadStreamRadius(preset: QualitySettings): number {
  const chunkRadius = preset.chunkRadius * 256 + 400;
  return Math.max(chunkRadius, Math.round(preset.fogDistance * 1.35));
}

export interface GameSettings {
  quality: QualityPreset;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
  /** Seconds of real time for one full in-game day. */
  dayLengthSeconds: number;
  /** 0 = north up minimap, 1 = rotating minimap. */
  minimapRotates: boolean;
  /** Automatic quality reduction when the frame rate drops. */
  adaptiveQuality: boolean;
  invertLook: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  quality: 'low',
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.6,
  muted: false,
  dayLengthSeconds: 20 * 60,
  minimapRotates: true,
  adaptiveQuality: false,
  invertLook: false,
};

const STORAGE_KEY = 'openroad.settings.v1';

export class SettingsStore {
  readonly data: GameSettings;

  constructor() {
    this.data = { ...DEFAULT_SETTINGS };
    this.load();
  }

  get quality(): QualityPreset {
    return this.data.quality;
  }

  get preset(): QualitySettings {
    return QUALITY_PRESETS[this.data.quality];
  }

  /** Persist the current settings to localStorage (never throws). */
  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Private browsing modes can block storage - the game still works.
    }
  }

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      if (parsed.quality && parsed.quality in QUALITY_PRESETS) {
        this.data.quality = parsed.quality;
      }
      // Only copy numeric / boolean fields we know about.
      const numericKeys: (keyof GameSettings)[] = [
        'masterVolume',
        'sfxVolume',
        'musicVolume',
        'dayLengthSeconds',
      ];
      for (const key of numericKeys) {
        const value = parsed[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          (this.data as unknown as Record<string, number>)[key] = value;
        }
      }
      const boolKeys: (keyof GameSettings)[] = ['muted', 'minimapRotates', 'adaptiveQuality', 'invertLook'];
      for (const key of boolKeys) {
        const value = parsed[key];
        if (typeof value === 'boolean') {
          (this.data as unknown as Record<string, boolean>)[key] = value;
        }
      }
    } catch {
      // Corrupted settings - fall back to defaults.
    }
  }

  setQuality(quality: QualityPreset): void {
    this.data.quality = quality;
    this.save();
  }

  reset(): void {
    Object.assign(this.data, DEFAULT_SETTINGS);
    this.save();
  }
}

export const settings = new SettingsStore();

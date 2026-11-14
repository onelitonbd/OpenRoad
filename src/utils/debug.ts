import * as THREE from 'three';

/**
 * Debug overlay (toggle with F3).
 *
 * Shows the numbers we need while optimising: frame rate, draw calls,
 * triangle count, chunk statistics and AI counts.
 */
export interface DebugExtra {
  chunksLoaded?: number;
  chunkQueue?: number;
  aiActive?: number;
  aiPhysics?: number;
  position?: string;
  fps?: number;
}

export class DebugOverlay {
  private el: HTMLDivElement | null = null;
  private visible = false;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private frameTime = 0;

  /** Extra live values pushed by the game each frame. */
  readonly extra: DebugExtra = {};

  toggle(): void {
    this.visible = !this.visible;
    if (this.visible) {
      this.ensureElement();
      if (this.el) this.el.style.display = 'block';
    } else if (this.el) {
      this.el.style.display = 'none';
    }
  }

  get isVisible(): boolean {
    return this.visible;
  }

  private ensureElement(): void {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  /** Called once per frame with the renderer info. */
  update(dt: number, renderer: THREE.WebGLRenderer): void {
    this.frames++;
    this.fpsTimer += dt;
    this.frameTime += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = this.frames / this.fpsTimer;
      this.frames = 0;
      this.fpsTimer = 0;
    }
    if (!this.visible || !this.el) return;

    const info = renderer.info;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const memMb = memory ? (memory.usedJSHeapSize / 1048576).toFixed(1) : 'n/a';

    const lines: string[] = [
      `FPS ${this.fps.toFixed(0)}  (${(this.frameTime * 1000).toFixed(1)} ms)`,
      `draw calls ${info.render.calls}`,
      `triangles ${info.render.triangles.toLocaleString()}`,
      `geometries ${info.memory.geometries}  textures ${info.memory.textures}`,
      `heap ${memMb} MB`,
    ];
    if (this.extra.chunksLoaded !== undefined) {
      lines.push(`chunks ${this.extra.chunksLoaded} loaded / ${this.extra.chunkQueue ?? 0} queued`);
    }
    if (this.extra.aiActive !== undefined) {
      lines.push(`ai ${this.extra.aiActive} active / ${this.extra.aiPhysics ?? 0} physics`);
    }
    if (this.extra.position) {
      lines.push(`pos ${this.extra.position}`);
    }
    this.el.textContent = lines.join('\n');
  }
}

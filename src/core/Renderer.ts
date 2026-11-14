import * as THREE from 'three';
import { settings } from './Settings';

/**
 * Owns the WebGL renderer and the canvas.
 *
 * Antialiasing is off by default because it costs a lot on low end GPUs and
 * the Low preset targets 30+ fps. The pixel ratio is capped by the quality
 * preset to avoid rendering 4x more pixels than needed on retina displays.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;

  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    this.renderer.setClearColor(0x87ceeb, 1);
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, settings.preset.farPlane);
    this.camera.position.set(0, 5, 10);

    this.applyQuality();
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
  }

  /** Re-apply quality dependent renderer settings (called on preset change). */
  applyQuality(): void {
    const preset = settings.preset;
    this.renderer.shadowMap.enabled = preset.shadowMapSize > 0;
    this.camera.far = preset.farPlane;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize = (): void => {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.preset.pixelRatioCap));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  get aspect(): number {
    return this.width / this.height;
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('orientationchange', this.resize);
    this.renderer.dispose();
  }
}

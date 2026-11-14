// Renderer.ts — WebGLRenderer setup
import * as THREE from 'three';
import { settings } from './Settings';

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // off by default per spec, enable on High if needed
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = false; // enabled per quality later
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#87CEEB'); // sky blue

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
    this.camera.position.set(0, 5, 12);

    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality() {
    const preset = settings.preset;
    // shadows
    if (preset.shadows) {
      this.renderer.shadowMap.enabled = true;
      // shadow map size will be set on lights
    } else {
      this.renderer.shadowMap.enabled = false;
    }
    // antialias only on high
    // Note: can't toggle antialias after creation without recreate; we keep off for perf
    this.resize(); // reapply pixel ratio
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, settings.preset.pixelRatioCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  get info() {
    return this.renderer.info;
  }

  dispose() {
    window.removeEventListener('resize', () => this.resize());
    this.renderer.dispose();
  }
}

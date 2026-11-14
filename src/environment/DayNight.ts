// DayNight.ts — 24h cycle 20min real, controls sun/moon, lights, fog, emissives
import * as THREE from 'three';
import { SkySystem } from './SkySystem';
import { settings } from '../core/Settings';

export class DayNight {
  timeOfDay = 10.5; // 0-24 hours, start at 10:30am
  timeScale = 1; // 1 = 20 min per day (72x speed); 0 = paused
  private dayDurationSec = 20*60; // 1200 sec

  sunPos = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private skySystem: SkySystem, private dirLight: THREE.DirectionalLight, private hemiLight: THREE.HemisphereLight) {
    // Listen for time scale change from Settings
    this.timeScale = settings.data.dayTimeScale;
  }

  update(dt:number) {
    const ts = settings.data.dayTimeScale;
    this.timeScale = ts;
    if (ts === 0) return;
    this.timeOfDay += (dt / this.dayDurationSec) * 24 * ts;
    if (this.timeOfDay >= 24) this.timeOfDay -= 24;

    // Sun position on arc
    const t = this.timeOfDay / 24; // 0..1
    const azimuth = t * Math.PI*2 - Math.PI/2; // noon at south
    const elevation = Math.sin((t - 0.25)*Math.PI*2) * 0.9 + 0.2; // -0.7 to 1.1
    const phi = Math.acos(Math.max(-1, Math.min(1, elevation))); // inclination
    const theta = azimuth;
    const radius = 4000;
    // Three Sky uses phi = inclination from zenith, theta = azimuth
    // Convert to vector: y = cos(phi), x = sin(phi)*cos(theta), z = sin(phi)*sin(theta)
    this.sunPos.setFromSphericalCoords(radius, phi, theta);
    this.skySystem.updateFromSun(this.sunPos, this.timeOfDay);

    // Light color/intensity
    const isDay = this.timeOfDay > 6 && this.timeOfDay < 19;
    const sunrise = this.timeOfDay > 5 && this.timeOfDay < 7.5;
    const sunset = this.timeOfDay > 18 && this.timeOfDay < 20;
    if (isDay && !sunrise && !sunset) {
      this.dirLight.intensity = 1.15;
      this.dirLight.color.setHex(0xfff4e6);
      this.hemiLight.intensity = 0.94;
      (this.scene.fog as THREE.Fog).color.setHex(0xdbeeff);
    } else if (sunrise || sunset) {
      const warm = new THREE.Color('#ff7043');
      this.dirLight.intensity = 0.75;
      this.dirLight.color.lerp(warm, 0.55);
      this.hemiLight.color.setHex(0xff8a65);
      (this.scene.fog as THREE.Fog).color.setHex(0xffcc99);
    } else {
      // Night
      this.dirLight.intensity = 0.08;
      this.dirLight.color.setHex(0x546e7a);
      this.hemiLight.intensity = 0.28;
      this.hemiLight.color.setHex(0x455a64);
      (this.scene.fog as THREE.Fog).color.setHex(0x0f172a);
    }
    this.dirLight.position.copy(this.sunPos);
  }

  get isNight(): boolean { return this.timeOfDay < 6 || this.timeOfDay > 19.2; }
  get timeString(): string {
    const h = Math.floor(this.timeOfDay);
    const m = Math.floor((this.timeOfDay - h)*60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  setTime(hours:number) { this.timeOfDay = ((hours%24)+24)%24; }
}

// Weather.ts — Clear/Cloudy/Rain/Fog with transitions
import * as THREE from 'three';
import { settings } from '../core/Settings';
import { seededRng } from '../utils/random';

export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'fog';

export class Weather {
  state: WeatherState = 'clear';
  private target: WeatherState = 'clear';
  private transition = 1; // 0..1 progress
  private timer = 0;
  private rng: () => number;
  private rainParticles: THREE.Points | null = null;
  private rainGeo: THREE.BufferGeometry | null = null;
  private rainMat: THREE.PointsMaterial | null = null;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private skyOpacityRef: { setCloudOpacity: (o:number)=>void } | null = null;
  private onGripChange: (m:number)=>void = () => {};

  constructor(scene: THREE.Scene, camera: THREE.Camera, seed:string) {
    this.scene = scene;
    this.camera = camera;
    this.rng = seededRng(seed + ':weather');
    this.timer = 18 + this.rng()*22; // next change in 18-40s
  }

  setSkyRef(ref: { setCloudOpacity: (o:number)=>void }) { this.skyOpacityRef = ref; }

  // Allow vehicle to receive grip multiplier
  setGripCallback(cb:(m:number)=>void) { this.onGripChange = cb; }

  // Manual override
  setWeather(s: WeatherState) { this.target = s; this.transition = 0; }

  update(dt:number, playerPos: THREE.Vector3) {
    // Random auto changes
    this.timer -= dt;
    if (this.timer <= 0) {
      this.pickNextWeather();
      this.timer = 35 + this.rng()*65;
    }
    // Transition smoothing
    if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + dt * 0.035); // 28s full transition
      if (this.transition >= 1) { this.state = this.target; }
    }

    const t = this.transition;
    const curState = this.state;
    const nextState = this.target;
    const isRain = (curState==='rain' && t<1) || (nextState==='rain' && t>0) ? (nextState==='rain'? t : 1-t) : (this.state==='rain'?1:0);
    const isFog = (curState==='fog' || nextState==='fog') ? (nextState==='fog'? t : 1-t) : 0;

    // Cloud opacity 0.05 clear to 0.42 cloudy/rain
    const cloudOp = 0.05 + (isRain>0?0.38:0) + (this.state==='cloudy'?0.22:0) * (1 - isRain);
    this.skyOpacityRef?.setCloudOpacity(cloudOp);

    // Fog density: base fog far from DayNight, we modulate near/far locally
    // For weather fog, we lerp scene.fog near/far tighter
    // Keep reference fog from DayNight as base; weather just adds extra
    if (isFog > 0) {
      const fog = this.scene.fog as THREE.Fog;
      if (fog) {
        const baseFar = settings.preset.chunkRadius*256*0.95;
        fog.far = baseFar * (1 - isFog*0.62);
        fog.near = fog.far * 0.25;
      }
    }

    // Rain particles near camera
    if (isRain > 0.05) {
      this.ensureRain();
      if (this.rainParticles) {
        const mat = this.rainMat!;
        mat.opacity = isRain * 0.92;
        // Move particles to follow camera
        this.rainParticles.position.copy(this.camera.position);
        // Animate falling
        const posAttr = this.rainGeo!.getAttribute('position') as THREE.BufferAttribute;
        for (let i=0;i<posAttr.count;i++) {
          let y = posAttr.getY(i);
          y -= dt * 42 * (0.8 + Math.random()*0.4);
          if (y < -18) y = 18 + Math.random()*12;
          posAttr.setY(i, y);
          // slight wind drift
          let x = posAttr.getX(i);
          x += dt * 2.5;
          if (x > 42) x = -42;
          posAttr.setX(i, x);
        }
        posAttr.needsUpdate = true;
      }
    } else if (this.rainParticles) {
      this.scene.remove(this.rainParticles);
      this.rainParticles.geometry.dispose();
      (this.rainParticles.material as THREE.Material).dispose();
      this.rainParticles = null; this.rainGeo = null; this.rainMat = null;
    }

    // Grip multiplier for vehicle
    const grip = isRain > 0.3 ? 0.75 : 1.0;
    this.onGripChange(grip * (1 - isFog*0.08));

    // Wet road: modulate material roughness via traversing roads? For perf we skip full PBR update, just hint via fog darker
  }

  private ensureRain() {
    if (this.rainParticles) return;
    const count = settings.preset.rainParticles;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count*3);
    for (let i=0;i<count;i++) {
      pos[i*3+0] = (Math.random()-0.5)*85;
      pos[i*3+1] = Math.random()*38;
      pos[i*3+2] = (Math.random()-0.5)*85;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const mat = new THREE.PointsMaterial({ color:0xa8c0ff, size:0.14, transparent:true, opacity:0.9, sizeAttenuation:true });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.rainParticles = pts; this.rainGeo = geo; this.rainMat = mat;
  }

  private pickNextWeather() {
    // Weighted: clear 40, cloudy 28, rain 18, fog 14
    const r = this.rng();
    let next: WeatherState = 'clear';
    if (r < 0.40) next='clear';
    else if (r < 0.68) next='cloudy';
    else if (r < 0.86) next='rain';
    else next='fog';
    if (next===this.state) return;
    this.target = next;
    this.transition = 0;
    console.log(`[Weather] ${this.state} → ${this.target}`);
  }

  getIcon(): string {
    const s = this.transition>0.5? this.target : this.state;
    return s==='clear' ? '☀️' : s==='cloudy' ? '☁️' : s==='rain' ? '🌧️' : '🌫️';
  }

  dispose() {
    if (this.rainParticles) { this.scene.remove(this.rainParticles); this.rainParticles.geometry.dispose(); (this.rainParticles.material as THREE.Material).dispose(); }
  }
}

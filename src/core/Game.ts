// Game.ts — Phase5 Traffic integration
import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Time } from './Time';
import { Input } from './Input';
import { settings } from './Settings';
import { Vehicle } from '../vehicles/Vehicle';
import { getDefaultCar } from '../vehicles/cars';
import { PlayerController } from '../vehicles/PlayerController';
import { CameraRig } from '../vehicles/CameraRig';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from '../world/World';
import { TrafficManager } from '../ai/TrafficManager';
import { HUD } from '../ui/HUD';
import { TuningPanel } from '../ui/TuningPanel';
import { Minimap } from '../ui/Minimap';

export class Game {
  renderer: Renderer;
  time = new Time();
  input = new Input();
  physics = new PhysicsWorld();
  cameraRig = new CameraRig();
  world: World | null = null;
  traffic: TrafficManager | null = null;
  vehicle: Vehicle;
  controller: PlayerController;
  hud: HUD;
  tuning: TuningPanel;
  minimap: Minimap;
  private running=false; private rafId=0; private lastTime=0;
  private debugEl: HTMLElement | null = null; private showDebug=false; private fpsSamples:number[]=[]; private lastFpsUpdate=0;
  private physicsReady=false; private worldInitialized=false;

  constructor(private canvas: HTMLCanvasElement){
    this.renderer=new Renderer(canvas);
    this.vehicle=new Vehicle(getDefaultCar());
    this.controller=new PlayerController(this.input,this.vehicle);
    this.hud=new HUD(); this.tuning=new TuningPanel(this.vehicle); this.minimap=new Minimap();
    this.setupScene(); this.setupDebug();
    this.vehicle.addToScene(this.renderer.scene);
    this.cameraRig.attach(this.vehicle.group);
    this.hud.setQuality(settings.quality); this.hud.show();
    window.addEventListener('floating-origin-shift',(e:Event)=>{
      const detail=(e as CustomEvent).detail as {shift:THREE.Vector3};
      this.vehicle.shiftOrigin(detail.shift);
    });
  }

  private setupScene(){
    const scene=this.renderer.scene;
    const hemi=new THREE.HemisphereLight(0xfffaf0,0x444466,0.94); scene.add(hemi);
    const dir=new THREE.DirectionalLight(0xfff4e6,1.2); dir.position.set(90,120,60);
    dir.castShadow=!!settings.preset.shadows;
    if(dir.castShadow){ dir.shadow.mapSize.set(1024,1024); dir.shadow.camera.near=2; dir.shadow.camera.far=400; dir.shadow.camera.left=-140; dir.shadow.camera.right=140; dir.shadow.camera.top=140; dir.shadow.camera.bottom=-140; dir.shadow.bias=-0.0005; }
    scene.add(dir);
    const preset=settings.preset; const fogFar=preset.chunkRadius*256*0.95;
    scene.fog=new THREE.Fog('#dbeeff',fogFar*0.36,fogFar);
    const grid=new THREE.GridHelper(8000,32,'#fff','#e5e7eb'); (grid.material as THREE.Material).transparent=true; (grid.material as THREE.Material).opacity=0.035; grid.position.y=0.02; scene.add(grid);
  }

  async start(){
    if(this.running) return; this.running=true;
    this.physics.init().then(()=>{ this.physicsReady=true; this.vehicle.enablePhysics(this.physics); this.hud.showMessage('Physics ready',1200); this.initWorld(); }).catch(e=>console.error(e));
    setTimeout(()=>{ if(!this.worldInitialized) this.initWorld(); },1500);
    this.lastTime=performance.now(); this.loop(this.lastTime); this.hideLoading();
  }

  private initWorld(){
    if(this.worldInitialized) return; this.worldInitialized=true;
    const seed=this.getSeed();
    this.world=new World(seed, this.renderer.scene, this.physics as unknown as never);
    this.minimap.setRoads(this.world.roads);
    this.traffic=new TrafficManager(this.renderer.scene, this.world.roads, seed);
    const spawn=this.world.getSpawnPosition(); this.vehicle.reset(spawn,0);
    console.log(`[World] Seed ${seed} spawn ${spawn.x.toFixed(0)},${spawn.z.toFixed(0)}`);
  }

  private getSeed(): string {
    try{ const s=localStorage.getItem('openroad:seed'); if(s) return s; } catch{}
    const seed=`open-road-${Math.floor(Math.random()*1e6)}`; try{ localStorage.setItem('openroad:seed',seed); } catch{} return seed;
  }

  private hideLoading(){
    const el=document.getElementById('loading-screen');
    if(el){ el.style.opacity='0'; setTimeout(()=>el.remove(),500); }
    setTimeout(()=>{ const h=document.getElementById('controls-hint'); if(h) h.classList.add('fade-out'); },7000);
  }

  private loop=(now:number)=>{
    this.rafId=requestAnimationFrame(this.loop);
    const dt=(now-this.lastTime)/1000; this.lastTime=now;
    const steps=this.time.step(dt);
    for(let i=0;i<steps;i++) this.fixedUpdate(Time.FIXED_DT);
    this.update(dt); this.renderer.render(); this.updateDebug(dt);
  };

  private fixedUpdate(dt:number){
    this.controller.update(dt);
    if(this.physicsReady && (this.vehicle as unknown as {controller:unknown}).controller){
      const ctrl=(this.vehicle as unknown as {controller:{updateVehicle:(dt:number)=>void}}).controller;
      if(ctrl) ctrl.updateVehicle(dt);
    }
    this.physics.step(dt);
    this.vehicle.postPhysicsUpdate();
    if(this.world) this.world.update(this.vehicle.group.position, dt);
    if(this.traffic) this.traffic.update(this.vehicle.group.position, dt, this.physics as unknown);
    const p=this.vehicle.group.position; const limit=3900;
    if(Math.abs(p.x)>limit||Math.abs(p.z)>limit){ this.hud.showMessage('Turn back',2000); const dir=new THREE.Vector3(-p.x,0,-p.z).normalize(); p.addScaledVector(dir,3); }
    if(this.input.consumeCameraCycle()){ this.cameraRig.cycle(); this.hud.showMessage(`Camera: ${this.cameraRig.mode}`,1200); }
    if(this.input.consumeReset()){ const spawn=this.world?.getSpawnPosition()??new THREE.Vector3(0,0.6,0); this.vehicle.reset(spawn,0); this.hud.showMessage('Car reset',1000); }
  }

  private update(dt:number){
    this.cameraRig.update(this.renderer.camera, dt, this.vehicle.state.speedKmh);
    this.hud.update(this.vehicle.state, dt);
    this.tuning.update();
    const pos=this.vehicle.group.position;
    this.minimap.update({x: pos.x + (this.world?.chunkManager.getOriginOffset().x ??0), z: pos.z + (this.world?.chunkManager.getOriginOffset().z ??0)}, this.vehicle.state.heading);
    const curFog=this.renderer.scene.fog as THREE.Fog | null;
    if(curFog){ const far=settings.preset.chunkRadius*256*0.95; if(Math.abs(curFog.far-far)>10){ curFog.far=far; curFog.near=far*0.36; } }
  }

  private updateDebug(dt:number){
    if(!this.showDebug||!this.debugEl) return;
    this.fpsSamples.push(1/dt); if(this.fpsSamples.length>30) this.fpsSamples.shift();
    const now=performance.now(); if(now-this.lastFpsUpdate<250) return; this.lastFpsUpdate=now;
    const avgFps=this.fpsSamples.reduce((a,b)=>a+b,0)/this.fpsSamples.length;
    const info=this.renderer.info;
    const mem=(performance as unknown as {memory?:{usedJSHeapSize:number}}).memory;
    const phys=this.physicsReady?'Rapier':'Kinematic';
    const chunks=this.world?.chunkManager.getChunkCount()??0;
    const traffic=this.traffic?.getCount()??0;
    this.debugEl.innerHTML=`
      <div><b>DEBUG</b> (F3) • Chunks ${chunks} • Traffic ${traffic}/${settings.preset.trafficCap}</div>
      <div>FPS ${avgFps.toFixed(1)} | ${phys} | ${settings.quality}r${settings.preset.chunkRadius} | Tris ${info.render.triangles.toLocaleString()}</div>
      <div>Pos ${this.vehicle.group.position.x.toFixed(0)},${this.vehicle.group.position.z.toFixed(0)} Y${this.vehicle.group.position.y.toFixed(1)} Spd ${this.vehicle.state.speedKmh.toFixed(0)} km/h</div>
      <div>Draw ${info.render.calls} | Heap ${mem?(mem.usedJSHeapSize/1048576).toFixed(1)+' MB':'n/a'} | Seed ${this.world?.seed??'…'}</div>
    `;
  }

  private setupDebug(){
    this.debugEl=document.getElementById('debug-overlay');
    if(!this.debugEl){ const el=document.createElement('div'); el.id='debug-overlay'; el.className='debug-overlay hidden'; document.body.appendChild(el); this.debugEl=el; }
    window.addEventListener('keydown',(e)=>{ if(e.key==='F3'){ e.preventDefault(); this.showDebug=!this.showDebug; this.debugEl?.classList.toggle('hidden',!this.showDebug); } });
  }

  stop(){ this.running=false; cancelAnimationFrame(this.rafId); this.input.dispose(); this.world?.dispose(); this.traffic?.dispose(); }
}

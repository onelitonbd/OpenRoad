// Game.ts — full Phase 6-10 integration: menus, garage, saves, audio, traffic, racing, photo, touch
import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Time } from './Time';
import { Input } from './Input';
import { settings } from './Settings';
import { Vehicle } from '../vehicles/Vehicle';
import { CARS, getCarById } from '../vehicles/cars';
import { PlayerController } from '../vehicles/PlayerController';
import { CameraRig } from '../vehicles/CameraRig';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { World } from '../world/World';
import { TrafficManager } from '../ai/TrafficManager';
import { RaceManager } from '../ai/RaceManager';
import { SkySystem } from '../environment/SkySystem';
import { DayNight } from '../environment/DayNight';
import { Weather } from '../environment/Weather';
import { HUD } from '../ui/HUD';
import { TuningPanel } from '../ui/TuningPanel';
import { Minimap } from '../ui/Minimap';
import { MainMenu } from '../ui/MainMenu';
import { Garage } from '../ui/Garage';
import { PauseMenu } from '../ui/PauseMenu';
import { TouchControls } from '../ui/TouchControls';
import { PhotoMode } from '../ui/PhotoMode';
import { LocalSave } from '../save/LocalSave';
import { audioManager } from '../audio/AudioManager';
import { EngineSound } from '../audio/EngineSound';
import { Ambient } from '../audio/Ambient';

type GamePhase = 'menu' | 'play' | 'pause' | 'garage' | 'photo';

export class Game {
  renderer: Renderer; time=new Time(); input=new Input(); physics=new PhysicsWorld(); cameraRig=new CameraRig();
  world: World | null=null; traffic: TrafficManager | null=null; races: RaceManager | null=null;
  sky: SkySystem | null=null; dayNight: DayNight | null=null; weather: Weather | null=null;
  vehicle: Vehicle; controller: PlayerController; hud: HUD; tuning: TuningPanel; minimap: Minimap;
  mainMenu: MainMenu | null=null; garage: Garage | null=null; pauseMenu: PauseMenu | null=null; touch: TouchControls | null=null; photo: PhotoMode | null=null;
  save = new LocalSave(); audio = audioManager; engineSound=new EngineSound(); ambient=new Ambient();
  private phase: GamePhase='menu';
  private running=false; private rafId=0; private lastTime=0;
  private debugEl: HTMLElement|null=null; private showDebug=false; private fpsSamples:number[]=[]; private lastFpsUpdate=0;
  private physicsReady=false; private worldInitialized=false;
  private autoSaveTimer=0;
  private raceHUD: HTMLElement | null=null;

  constructor(private canvas: HTMLCanvasElement){
    this.renderer=new Renderer(canvas);
    // Load saved car
    this.loadSaveSync();
    const cfg = getCarById(localStorage.getItem('openroad:lastCar') || 'comet-gt') || CARS[0];
    this.vehicle=new Vehicle(cfg);
    this.controller=new PlayerController(this.input,this.vehicle);
    this.hud=new HUD(); this.tuning=new TuningPanel(this.vehicle); this.minimap=new Minimap();
    this.setupScene(); this.setupDebug(); this.setupMenus();
    this.vehicle.addToScene(this.renderer.scene);
    this.cameraRig.attach(this.vehicle.group);
    this.hud.setQuality(settings.quality);
    this.hud.show();
    this.touch=new TouchControls();
    this.photo=new PhotoMode(this.renderer.renderer, this.renderer.scene, this.renderer.camera);
    this.raceHUD=document.createElement('div'); this.raceHUD.className='hud-race hidden'; document.getElementById('ui-root')!.appendChild(this.raceHUD);
    audioManager.init();
    window.addEventListener('floating-origin-shift',(e:Event)=>{
      const detail=(e as CustomEvent).detail as {shift:THREE.Vector3};
      this.vehicle.shiftOrigin(detail.shift);
    });
    window.addEventListener('photo-time-change',(e:Event)=>{
      const detail=(e as CustomEvent).detail as {time:number};
      this.dayNight?.setTime(detail.time);
    });
  }

  private loadSaveSync(){
    try{
      const raw=localStorage.getItem('openroad:save');
      if(raw){
        const data=JSON.parse(raw);
        if(data.settings) Object.assign(settings.data, data.settings);
      }
    } catch{}
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
    this.sky=new SkySystem(scene);
    this.dayNight=new DayNight(scene, this.sky, dir, hemi);
    this.weather=new Weather(scene, this.renderer.camera, 'open-road-seed');
    this.weather.setSkyRef(this.sky);
    this.weather.setGripCallback((m)=>{ (this.vehicle as unknown as {tuning:{gripScale:number}}).tuning.gripScale=m; });
    const grid=new THREE.GridHelper(8000,32,'#fff','#e5e7eb'); (grid.material as THREE.Material).transparent=true; (grid.material as THREE.Material).opacity=0.035; grid.position.y=0.02; scene.add(grid);
    window.addEventListener('keydown',(e)=>{
      if(e.key==='F5'){ e.preventDefault(); const states=['clear','cloudy','rain','fog'] as const; const cur=this.weather!.state; const idx=states.indexOf(cur); this.weather!.setWeather(states[(idx+1)%states.length]); this.hud.showMessage(`Weather: ${states[(idx+1)%states.length]}`,1200); }
      if(e.key==='F6'){ e.preventDefault(); this.dayNight!.timeScale = this.dayNight!.timeScale===0?1:0; this.hud.showMessage(this.dayNight!.timeScale===0?'Time paused':'Time resumed',1000); }
    });
  }

  private setupMenus(){
    this.mainMenu=new MainMenu(
      ()=> this.startPlay(),
      ()=> this.openGarage(),
      ()=> this.pauseMenu?.show()
    );
    this.garage=new Garage((cfg,color)=>{
      this.vehicle.dispose(); this.renderer.scene.remove(this.vehicle.group);
      this.vehicle=new Vehicle({...cfg, color}); this.vehicle.addToScene(this.renderer.scene);
      if(this.physicsReady) this.vehicle.enablePhysics(this.physics);
      this.cameraRig.attach(this.vehicle.group);
      localStorage.setItem('openroad:lastCar', cfg.id);
      // save
      this.save.save({ selectedCarId: cfg.id, carColors:{ [cfg.id]: color }} as never);
      this.hud.showMessage(`Selected ${cfg.name}`,1500);
      if(this.phase==='menu') this.mainMenu?.show();
    });
    this.pauseMenu=new PauseMenu(
      ()=> this.resume(),
      ()=> { const spawn=this.world?.getSpawnPosition()??new THREE.Vector3(0,0.6,0); this.vehicle.reset(spawn,0); this.resume(); },
      ()=> { this.phase='menu'; this.pauseMenu?.hide(); this.mainMenu?.show(); this.hud.showMessage('Quit to menu',1200); },
      (v)=> { this.dayNight!.timeScale=v; },
      (s)=> { this.weather!.setWeather(s as never); }
    );
  }

  private startPlay(){
    this.phase='play';
    this.mainMenu?.hide();
    this.hud.show();
    this.engineSound.start(); this.ambient.start();
    this.hud.showMessage('Drive! R start race near markers', 2200);
  }

  private openGarage(){ this.garage?.show(); }
  private pause(){
    if(this.phase!=='play') return;
    this.phase='pause'; this.pauseMenu?.show();
  }
  private resume(){
    if(this.phase!=='pause') return;
    this.phase='play'; this.pauseMenu?.hide();
  }

  async start(){
    if(this.running) return; this.running=true;
    // Physics
    this.physics.init().then(()=>{
      this.physicsReady=true; this.vehicle.enablePhysics(this.physics);
      this.initWorld();
    }).catch(e=>console.error(e));
    setTimeout(()=>{ if(!this.worldInitialized) this.initWorld(); },1500);
    this.lastTime=performance.now(); this.loop(this.lastTime); this.hideLoading();
    // autosave on hide
    document.addEventListener('visibilitychange',()=>{ if(document.hidden) this.doSave(); });
    window.addEventListener('beforeunload',()=> this.doSave());
    window.addEventListener('keydown',(e)=>{
      if(e.key==='Escape'){
        if(this.photo?.isActive()){ this.photo.exit(); this.phase='play'; return; }
        if(this.garage?.isVisible()){ this.garage.hide(); if(this.phase==='menu') this.mainMenu?.show(); return; }
        if(this.phase==='play'){ this.pause(); }
        else if(this.phase==='pause'){ this.resume(); }
      }
      if(e.key.toLowerCase()==='p' && this.phase==='play'){ this.photo?.enter(); this.phase='photo'; }
      else if(e.key.toLowerCase()==='p' && this.phase==='photo'){ this.photo?.exit(); this.phase='play'; }
      if(e.key.toLowerCase()==='r' && this.phase==='play'){
        // try race start near marker
        if(this.races && !this.races.tryStartNearest(this.vehicle.group.position, 'normal')){
          const spawn=this.world?.getSpawnPosition()??new THREE.Vector3(0,0.6,0); this.vehicle.reset(spawn,0);
        } else {
          this.hud.showMessage('Race started! Hit checkpoints', 1800);
        }
      }
    });
  }

  private initWorld(){
    if(this.worldInitialized) return; this.worldInitialized=true;
    const seed=this.getSeed();
    this.world=new World(seed, this.renderer.scene, this.physics as unknown as never);
    this.minimap.setRoads(this.world.roads);
    this.traffic=new TrafficManager(this.renderer.scene, this.world.roads, seed);
    this.races=new RaceManager(this.renderer.scene, this.world.roads, seed);
    this.races.setFinishCallback((res)=>{
      this.showRaceResult(res);
      // save best times
      this.save.save({ bestTimes: { [res.position]: res.time } as never });
    });
    const spawn=this.world.getSpawnPosition(); this.vehicle.reset(spawn,0);
    // Restore save position if exists
    this.save.load().then(data=>{
      if(data?.lastPosition){
        const p=new THREE.Vector3().fromArray(data.lastPosition);
        this.vehicle.reset(p, data.lastHeading ?? 0);
        if(data.timeOfDay) this.dayNight!.setTime(data.timeOfDay);
      }
    });
    console.log(`[World] Seed ${seed}`);
  }

  private showRaceResult(res:{position:number,time:number,best:number}){
    const el=document.createElement('div'); el.className='race-result';
    el.innerHTML=`
      <div class="menu-card">
        <h2 class="menu-title">Race Finished!</h2>
        <p class="menu-subtitle">Position ${res.position} • Time ${(res.time/1000).toFixed(1)}s</p>
        <p class="menu-subtitle">Best ${(res.best/1000).toFixed(1)}s ${res.time<=res.best?' — New Best!':''}</p>
        <div class="menu-buttons">
          <button id="race-continue" class="menu-btn primary">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    el.querySelector('#race-continue')!.addEventListener('click',()=> el.remove());
    setTimeout(()=>{ if(el.parentElement) el.remove(); }, 5000);
  }

  private getSeed(): string { try{ const s=localStorage.getItem('openroad:seed'); if(s) return s; }catch{} const seed=`open-road-${Math.floor(Math.random()*1e6)}`; try{ localStorage.setItem('openroad:seed',seed);}catch{} return seed; }
  private hideLoading(){ const el=document.getElementById('loading-screen'); if(el){ el.style.opacity='0'; setTimeout(()=>el.remove(),500);} setTimeout(()=>{ const h=document.getElementById('controls-hint'); if(h) h.classList.add('fade-out'); },7000); }

  private doSave(){
    const p=this.vehicle.group.position;
    this.save.save({
      lastPosition:[p.x,p.y,p.z] as never,
      lastHeading: this.vehicle.state.heading as never,
      timeOfDay: this.dayNight?.timeOfDay as never,
      seed: this.world?.seed as never,
      settings: settings.data as never,
    } as never);
  }

  private loop=(now:number)=>{
    this.rafId=requestAnimationFrame(this.loop);
    const dt=(now-this.lastTime)/1000; this.lastTime=now;
    const steps=this.time.step(dt);
    for(let i=0;i<steps;i++) this.fixedUpdate(Time.FIXED_DT);
    this.update(dt); this.render(); this.updateDebug(dt);
  };

  private fixedUpdate(dt:number){
    // If menu or pause, don't step physics
    if(this.phase==='menu' || this.phase==='pause'){ return; }
    if(this.phase==='photo'){ // freeze sim but allow camera
      return;
    }
    // Merge touch input into keyboard Input state
    if(this.touch?.isActive()){
      const ts=this.touch.state;
      if(ts.throttle) this.input.state.throttle=1;
      if(ts.brake) this.input.state.brake=1;
      if(ts.steer) this.input.state.steer=ts.steer;
      if(ts.handbrake) this.input.state.handbrake=true;
    }
    this.controller.update(dt);
    if(this.physicsReady && (this.vehicle as unknown as {controller:unknown}).controller){
      const ctrl=(this.vehicle as unknown as {controller:{updateVehicle:(dt:number)=>void}}).controller;
      if(ctrl) ctrl.updateVehicle(dt);
    }
    this.physics.step(dt); this.vehicle.postPhysicsUpdate();
    if(this.world) this.world.update(this.vehicle.group.position, dt);
    if(this.traffic) this.traffic.update(this.vehicle.group.position, dt, this.physics as unknown);
    if(this.races) this.races.update(dt, this.vehicle.group.position, this.vehicle.state.speedKmh);
    // Edge
    const p=this.vehicle.group.position; const limit=3900;
    if(Math.abs(p.x)>limit||Math.abs(p.z)>limit){ this.hud.showMessage('Turn back',2000); const dir=new THREE.Vector3(-p.x,0,-p.z).normalize(); p.addScaledVector(dir,3); }
    if(this.input.consumeCameraCycle()){ this.cameraRig.cycle(); this.hud.showMessage(`Camera: ${this.cameraRig.mode}`,1200); }
    if(this.input.consumeReset()){ const spawn=this.world?.getSpawnPosition()??new THREE.Vector3(0,0.6,0); this.vehicle.reset(spawn,0); this.hud.showMessage('Car reset',1000); }
    // Autosave every 30s
    this.autoSaveTimer += dt;
    if(this.autoSaveTimer > 30){ this.autoSaveTimer=0; this.doSave(); }
  }

  private update(dt:number){
    // Even in menu, rotate preview car? update dayNight/weather only in play
    if(this.phase==='play' || this.phase==='photo'){
      this.dayNight?.update(dt);
      this.weather?.update(dt, this.vehicle.group.position);
    }
    // Engine sound update
    if(this.phase==='play'){
      this.engineSound.update(this.vehicle.state.rpm, this.input.state.throttle, this.vehicle.state.speedKmh);
      this.ambient.update(this.vehicle.state.speedKmh, this.world ? this.world.regions.regionAt(this.vehicle.group.position.x, this.vehicle.group.position.z).id : 'downtown', this.weather?.state==='rain');
    }
    // Camera
    if(this.photo?.isActive()){
      const free=this.photo.getCamera();
      if(free) this.renderer.camera = free; // override for render
      // HUD hidden in photo mode already
    } else {
      this.cameraRig.update(this.renderer.camera, dt, this.vehicle.state.speedKmh);
      if(this.phase==='play'){
        this.hud.updateEnv(this.dayNight?.timeString ?? '12:00', this.weather?.getIcon() ?? '☀️');
        this.hud.update(this.vehicle.state, dt);
        // Race HUD
        const raceInfo=this.races?.getActiveRaceInfo();
        if(raceInfo){
          this.raceHUD!.textContent=`Race ${raceInfo.position} • CP ${raceInfo.checkpoint}/${raceInfo.total} • ${(raceInfo.time/1000).toFixed(1)}s`;
          this.raceHUD!.classList.remove('hidden');
        } else {
          this.raceHUD!.classList.add('hidden');
        }
      }
    }
    this.tuning.update();
    const pos=this.vehicle.group.position;
    this.minimap.update({x: pos.x + (this.world?.chunkManager.getOriginOffset().x ??0), z: pos.z + (this.world?.chunkManager.getOriginOffset().z ??0)}, this.vehicle.state.heading);
    // Adaptive quality: if FPS low for 5s, drop to low
    // Simple check via fpsSamples average < 28 for 5s triggers
  }

  private render(){
    if(this.photo?.isActive()){
      const cam=this.photo.getCamera();
      if(cam){ this.renderer.renderer.render(this.renderer.scene, cam); return; }
    }
    this.renderer.render();
  }

  private updateDebug(dt:number){
    if(!this.showDebug||!this.debugEl) return;
    this.fpsSamples.push(1/dt); if(this.fpsSamples.length>30) this.fpsSamples.shift();
    const now=performance.now(); if(now-this.lastFpsUpdate<250) return; this.lastFpsUpdate=now;
    const avgFps=this.fpsSamples.reduce((a,b)=>a+b,0)/this.fpsSamples.length;
    const info=this.renderer.info; const mem=(performance as unknown as {memory?:{usedJSHeapSize:number}}).memory;
    const chunks=this.world?.chunkManager.getChunkCount()??0; const traffic=this.traffic?.getCount()??0;
    const raceInfo=this.races?.getActiveRaceInfo();
    this.debugEl.innerHTML=`
      <div><b>DEBUG</b> F3 • Chunks ${chunks} • Traffic ${traffic}/${settings.preset.trafficCap} ${raceInfo?`• Race P${raceInfo.position}`:''}</div>
      <div>FPS ${avgFps.toFixed(1)} | ${settings.quality}r${settings.preset.chunkRadius} | Tris ${info.render.triangles.toLocaleString()} | Draw ${info.render.calls}</div>
      <div>Pos ${this.vehicle.group.position.x.toFixed(0)},${this.vehicle.group.position.z.toFixed(0)} Y${this.vehicle.group.position.y.toFixed(1)} Spd ${this.vehicle.state.speedKmh.toFixed(0)} G${this.vehicle.state.gear}</div>
      <div>Time ${this.dayNight?.timeString} ${this.weather?.getIcon()} | F5 weather F6 pause | C cam R reset | P photo</div>
      <div>Heap ${mem?(mem.usedJSHeapSize/1048576).toFixed(1)+' MB':'n/a'} | Phase ${this.phase}</div>
    `;
    // Adaptive quality trigger
    if(avgFps < 28 && settings.quality!=='low'){
      // count low fps duration
      (this as unknown as { lowFpsTime:number }).lowFpsTime = ((this as unknown as {lowFpsTime:number}).lowFpsTime||0) + 0.25;
      if((this as unknown as {lowFpsTime:number}).lowFpsTime > 5){
        settings.setQuality('low');
        this.hud.showMessage('Auto-switched to Low for performance',2000);
        (this as unknown as {lowFpsTime:number}).lowFpsTime=0;
      }
    } else {
      (this as unknown as {lowFpsTime:number}).lowFpsTime=0;
    }
  }

  private setupDebug(){
    this.debugEl=document.getElementById('debug-overlay');
    if(!this.debugEl){ const el=document.createElement('div'); el.id='debug-overlay'; el.className='debug-overlay hidden'; document.body.appendChild(el); this.debugEl=el; }
    window.addEventListener('keydown',(e)=>{ if(e.key==='F3'){ e.preventDefault(); this.showDebug=!this.showDebug; this.debugEl?.classList.toggle('hidden',!this.showDebug); } });
  }

  stop(){ this.running=false; cancelAnimationFrame(this.rafId); this.input.dispose(); this.world?.dispose(); this.traffic?.dispose(); this.races?.dispose(); this.sky?.dispose(); this.weather?.dispose(); }
}

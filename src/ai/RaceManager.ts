// RaceManager.ts — race markers, checkpoint chain, results
import * as THREE from 'three';
import { RoadNetwork } from '../world/RoadNetwork';
import { RivalRacer } from './RivalRacer';
import { seededRng } from '../utils/random';

export interface RaceDefinition { id:string; name:string; start: THREE.Vector3; checkpoints: THREE.Vector3[]; }

export class RaceManager {
  private scene: THREE.Scene;
  private roads: RoadNetwork;
  private rng: () => number;
  private races: RaceDefinition[] = [];
  private active: { race:RaceDefinition, rivals:RivalRacer[], playerIdx:number, playerLap:number, startTime:number, difficulty:'easy'|'normal'|'hard' } | null = null;
  private markers: THREE.Mesh[] = [];
  private checkpointIdx = 0;
  private onFinish: (result:{position:number, time:number, best:number})=>void = ()=>{};

  constructor(scene: THREE.Scene, roads: RoadNetwork, seed:string){
    this.scene=scene; this.roads=roads; this.rng=seededRng(seed+':races');
    this.generateRaces();
    this.createMarkers();
  }

  private generateRaces(){
    // Create 4 race courses from road network: pick random downtown/highway start and build checkpoint chain along roads
    const starts = [...this.roads.edges.values()].filter(e=>e.type==='downtown' || e.type==='highway').slice(0,4);
    starts.forEach((edge, idx)=>{
      const checkpoints: THREE.Vector3[] = [];
      let curEdge=edge;
      let points: THREE.Vector3[] = [...curEdge.points];
      for(let c=0;c<6;c++){
        const mid=points[Math.floor(points.length/2)];
        checkpoints.push(mid.clone());
        // pick next connected edge randomly
        const nextEdges=[...this.roads.edges.values()].filter(e=> e.from===curEdge.to || e.to===curEdge.from );
        if(!nextEdges.length) break;
        curEdge=nextEdges[Math.floor(this.rng()*nextEdges.length)];
        points=[...curEdge.points];
      }
      this.races.push({ id:`race-${idx}`, name:`City Sprint ${idx+1}`, start: edge.points[Math.floor(edge.points.length/2)].clone(), checkpoints });
    });
  }

  private createMarkers(){
    this.races.forEach(race=>{
      const geo=new THREE.CylinderGeometry(3,3,22,16);
      const mat=new THREE.MeshStandardMaterial({ color:'#facc15', emissive:'#eab308', emissiveIntensity:0.5, transparent:true, opacity:0.92 });
      const marker=new THREE.Mesh(geo, mat);
      marker.position.copy(race.start).add(new THREE.Vector3(0,11,0));
      marker.userData.raceId=race.id;
      this.scene.add(marker);
      this.markers.push(marker);
      // floating animation handled in update
    });
  }

  update(dt:number, playerPos: THREE.Vector3, playerSpeed:number){
    // Animate markers
    this.markers.forEach((m,i)=>{ m.rotation.y+=dt*0.9; m.position.y = this.races[i].start.y + 11 + Math.sin(performance.now()*0.002 + i)*1.2; });
    // If racing, update rivals and check checkpoints
    if(this.active){
      const race=this.active;
      // Update rivals
      race.rivals.forEach(r=> r.update(dt, playerPos, playerSpeed));
      // Check player checkpoint
      const nextCp=race.race.checkpoints[this.checkpointIdx];
      if(nextCp && playerPos.distanceTo(nextCp) < 14){
        this.checkpointIdx++;
        if(this.checkpointIdx >= race.race.checkpoints.length){
          // Finished
          this.finishRace();
        } else {
          // show next checkpoint indicator? HUD will handle
        }
      }
      // Rivals recover if stuck: if distance to path > 30, reset to nearest checkpoint
      race.rivals.forEach(r=>{
        const nearest = race.race.checkpoints[this.checkpointIdx] ?? race.race.checkpoints[0];
        if(r.group.position.distanceTo(nearest) > 90){
          r.group.position.copy(nearest).add(new THREE.Vector3(0,0.5,0));
        }
      });
    } else {
      // Check for race start proximity
      for(const race of this.races){
        if(playerPos.distanceTo(race.start) < 10){
          // Auto-prompt: we expose prompt via HUD
          // For now, auto-start on key R when near? Instead check for key press in Game
        }
      }
    }
  }

  tryStartNearest(playerPos: THREE.Vector3, difficulty:'easy'|'normal'|'hard'='normal'){
    let best: RaceDefinition | null=null; let bestDist=Infinity;
    for(const r of this.races){ const d=playerPos.distanceTo(r.start); if(d<12 && d<bestDist){ bestDist=d; best=r; } }
    if(!best) return false;
    this.startRace(best, difficulty);
    return true;
  }

  private startRace(race:RaceDefinition, difficulty:'easy'|'normal'|'hard'){
    const rivalCount = 3;
    const colors=['#ef4444','#0ea5e9','#22c55e','#a78bfa'];
    const rivals: RivalRacer[]=[];
    for(let i=0;i<rivalCount;i++){
      const path = this.buildRacePath(race);
      rivals.push(new RivalRacer(path, difficulty, colors[i%colors.length], this.scene));
      // Offset start positions
      rivals[i].group.position.add(new THREE.Vector3((i-1)*4,0,(i%2?2:-2)));
    }
    this.active={ race, rivals, playerIdx:0, playerLap:0, startTime: performance.now(), difficulty };
    this.checkpointIdx=0;
    console.log(`[Race] Started ${race.name} ${difficulty}`);
  }

  private buildRacePath(race:RaceDefinition): THREE.Vector3[] {
    // Flatten checkpoints into continuous path (interpolate)
    const path: THREE.Vector3[]=[];
    for(let i=0;i<race.checkpoints.length-1;i++){
      const a=race.checkpoints[i], b=race.checkpoints[i+1];
      const segs=10;
      for(let s=0;s<segs;s++){ const t=s/segs; path.push(new THREE.Vector3(a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t, a.z+(b.z-a.z)*t)); }
    }
    return path;
  }

  private finishRace(){
    if(!this.active) return;
    const elapsed=performance.now()-this.active.startTime;
    // Compute position: count how many rivals have more progress than player
    const playerProgress=this.checkpointIdx + this.active.playerLap * 100; // simplified
    const rivalProgress=this.active.rivals.map(r=>r.getProgress());
    const ahead=rivalProgress.filter(p=>p>playerProgress).length;
    const position=ahead+1;
    // Save best time
    const key=`best-${this.active.race.id}`;
    const prev=parseFloat(localStorage.getItem(key)||'Infinity');
    const isBest=elapsed < prev;
    if(isBest) localStorage.setItem(key, String(elapsed));
    this.onFinish({ position, time: elapsed, best: parseFloat(localStorage.getItem(key)||'0') });
    // cleanup rivals after delay
    setTimeout(()=>{
      this.active?.rivals.forEach(r=> r.dispose(this.scene));
      this.active=null; this.checkpointIdx=0;
    }, 4000);
  }

  setFinishCallback(cb:(r:{position:number,time:number,best:number})=>void){ this.onFinish=cb; }

  getActiveRaceInfo(): { checkpoint:number, total:number, position:number, time:number } | null {
    if(!this.active) return null;
    const elapsed=performance.now()-this.active.startTime;
    const playerProgress=this.checkpointIdx;
    const rivalProgress=this.active.rivals.map(r=>r.getProgress());
    const ahead=rivalProgress.filter(p=>p>playerProgress).length;
    return { checkpoint: this.checkpointIdx, total: this.active.race.checkpoints.length, position: ahead+1, time: elapsed };
  }

  getRaces(): RaceDefinition[] { return this.races; }

  dispose(){
    this.markers.forEach(m=> this.scene.remove(m));
    this.active?.rivals.forEach(r=> r.dispose(this.scene));
  }
}

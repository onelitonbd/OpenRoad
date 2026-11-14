// RivalRacer.ts — racing AI with rubber-banding
import * as THREE from 'three';
import { clamp, lerp } from '../utils/math';
import type { RoadNetwork } from '../world/RoadNetwork';

export interface RaceConfig { difficulty: 'easy'|'normal'|'hard'; laps: number; }

export class RivalRacer {
  group: THREE.Group;
  heading=0;
  private path: THREE.Vector3[];
  private idx=0;
  private speed=0;
  private maxSpeed: number;
  private difficulty: string;
  private lap=0;
  private rubberBand=0;

  constructor(path: THREE.Vector3[], difficulty: 'easy'|'normal'|'hard', color:string, scene: THREE.Scene){
    this.path=path;
    this.difficulty=difficulty;
    this.maxSpeed = (difficulty==='hard'? 88 : difficulty==='normal'? 78 : 66) / 3.6;
    // Simple car mesh
    const geo = new THREE.BoxGeometry(4.2,1.2,1.85);
    const mat = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow=true;
    const g = new THREE.Group(); g.add(mesh);
    // wheels as small boxes
    for(let i=0;i<4;i++){
      const w=new THREE.Mesh(new THREE.CylinderGeometry(0.33,0.33,0.25,10), new THREE.MeshStandardMaterial({color:'#111827'}));
      w.rotation.z=Math.PI/2;
      w.position.set((i<2?1.2:-1.2),0.33,(i%2?0.85:-0.85));
      g.add(w);
    }
    this.group=g;
    if(path.length) this.group.position.copy(path[0]).add(new THREE.Vector3(0,0.35,0));
    scene.add(this.group);
  }

  update(dt:number, playerPos: THREE.Vector3, playerSpeed:number){
    if(this.idx >= this.path.length-1){ this.idx=0; this.lap++; }
    const target=this.path[this.idx];
    const toTarget=new THREE.Vector3(target.x-this.group.position.x,0,target.z-this.group.position.z);
    const dist=toTarget.length();
    if(dist < 6) { this.idx++; return; }
    const dir=toTarget.normalize();
    const desired=Math.atan2(dir.z,dir.x);
    let dHeading=desired-this.heading;
    while(dHeading>Math.PI) dHeading-=Math.PI*2;
    while(dHeading<-Math.PI) dHeading+=Math.PI*2;
    this.heading += dHeading*dt*2.2;
    // Curvature lookahead brake
    const look=this.path[Math.min(this.path.length-1, this.idx+8)];
    const curDir=new THREE.Vector3(look.x - target.x,0,look.z-target.z).normalize();
    const angle=Math.acos(clamp(dir.dot(curDir),-1,1));
    const targetSpeed = this.maxSpeed * (1 - clamp(angle/1.0,0,0.45));
    // Rubber band: if far behind player, go faster; if far ahead, slow
    const distToPlayer=this.group.position.distanceTo(playerPos);
    const isBehind = new THREE.Vector3(playerPos.x-this.group.position.x,0,playerPos.z-this.group.position.z).dot(new THREE.Vector3(Math.cos(this.heading),0,Math.sin(this.heading))) > 0;
    let rubber=0;
    if(distToPlayer>55 && isBehind) rubber=0.22; // catch up
    if(distToPlayer>55 && !isBehind) rubber=-0.15; // slow down to keep close
    if(this.difficulty==='hard') rubber*=1.2;
    if(this.difficulty==='easy') rubber*=0.6;
    const finalSpeed = clamp(targetSpeed*(1+rubber), 6/3.6, this.maxSpeed*1.08);
    this.speed = lerp(this.speed, finalSpeed, dt*1.8);
    const fwd=new THREE.Vector3(Math.cos(this.heading),0,Math.sin(this.heading));
    this.group.position.addScaledVector(fwd, this.speed*dt);
    this.group.position.y = target.y+0.35;
    this.group.rotation.y=this.heading;
    this.group.rotation.z=clamp(-dHeading*0.35,-0.18,0.18);
  }

  getProgress(): number { return this.idx + this.lap*this.path.length; }
  getLap(): number { return this.lap; }

  dispose(scene: THREE.Scene){ scene.remove(this.group); }

  resetTo(path: THREE.Vector3[]){
    this.path=path; this.idx=0; this.group.position.copy(path[0]).add(new THREE.Vector3(0,0.35,0));
  }
}

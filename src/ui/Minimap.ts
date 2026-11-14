// Minimap.ts — 2D canvas drawn from road graph
import type { RoadNetwork } from '../world/RoadNetwork';

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private roads: RoadNetwork | null = null;
  private rotating = true;

  constructor() {
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'minimap-canvas';
      this.canvas.width = 160; this.canvas.height = 160;
    }
    this.ctx = this.canvas.getContext('2d')!;
    // Click to toggle north-up/rotating
    this.canvas.addEventListener('click', ()=> this.rotating = !this.rotating);
    this.canvas.style.cursor = 'pointer';
    this.canvas.title = 'Click to toggle rotate / north-up';
  }

  setRoads(roads: RoadNetwork) { this.roads = roads; }

  update(playerPos: {x:number,z:number}, heading:number) {
    if (!this.roads) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0,0,W,H);
    // Background
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0,0,W,H);
    // Draw roads around player in 400m radius
    const range = 400;
    ctx.save();
    ctx.translate(W/2, H/2);
    if (this.rotating) ctx.rotate(-heading + Math.PI); // player up? Actually we want player arrow up: rotate map opposite heading
    const scale = 0.18; // pixels per meter
    ctx.scale(scale, scale);
    ctx.translate(-playerPos.x, -playerPos.z);

    // Roads
    const edges = this.roads.getRoadsInRadius({ x: playerPos.x, y:0, z: playerPos.z } as THREE.Vector3, range+100);
    edges.forEach(edge=>{
      ctx.beginPath();
      const col = edge.type==='highway' ? '#1e293b' : edge.type==='downtown' ? '#334155' : '#475569';
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, edge.width*0.4);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      edge.points.forEach((p,i)=>{
        if (i===0) ctx.moveTo(p.x, p.z);
        else ctx.lineTo(p.x, p.z);
      });
      ctx.stroke();
      // Center line for highways
      if (edge.type==='highway') {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([8,8]);
        ctx.beginPath();
        edge.points.forEach((p,i)=> i===0?ctx.moveTo(p.x,p.z):ctx.lineTo(p.x,p.z));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Player arrow
    ctx.restore();
    // Draw player in center regardless of rotation
    ctx.save();
    ctx.translate(W/2, H/2);
    // Arrow points up when rotating, else north
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0,-8); ctx.lineTo(-5,6); ctx.lineTo(5,6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Border and mode label
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, H-14, W, 14);
    ctx.fillStyle = '#475569';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.rotating ? 'ROTATE • CLICK' : 'NORTH-UP • CLICK', W/2, H-4);
  }
}

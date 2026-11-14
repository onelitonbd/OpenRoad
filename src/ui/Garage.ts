// Garage.ts — carousel, stat bars, color picker
import { CARS } from '../vehicles/cars';
import type { VehicleConfig } from '../vehicles/VehicleConfig';

export class Garage {
  private el: HTMLElement;
  private idx = 0;
  private visible = false;
  private onSelect: (cfg:VehicleConfig, color:string)=>void;
  private color = '#e11d48';

  constructor(onSelect:(cfg:VehicleConfig, color:string)=>void){
    this.onSelect = onSelect;
    this.el = document.createElement('div');
    this.el.id='garage';
    this.el.className='menu-overlay hidden';
    this.el.innerHTML=`
      <div class="menu-card garage-card">
        <h2 class="menu-title">Garage</h2>
        <div class="garage-carousel">
          <button id="garage-prev" class="garage-nav">‹</button>
          <div class="garage-view">
            <div id="garage-name" class="garage-name">Comet GT</div>
            <div id="garage-class" class="garage-class">sports</div>
            <div id="garage-preview" class="garage-preview"></div>
            <div class="garage-stats">
              <div class="stat"><span>Speed</span><div class="stat-bar"><div id="stat-speed" class="stat-fill"></div></div></div>
              <div class="stat"><span>Accel</span><div class="stat-bar"><div id="stat-accel" class="stat-fill"></div></div></div>
              <div class="stat"><span>Handling</span><div class="stat-bar"><div id="stat-handle" class="stat-fill"></div></div></div>
            </div>
            <div class="garage-colors">
              <label>Color <input type="color" id="garage-color" value="#e11d48"></label>
              <div id="garage-color-presets" class="color-presets"></div>
            </div>
          </div>
          <button id="garage-next" class="garage-nav">›</button>
        </div>
        <div class="menu-buttons">
          <button id="garage-select" class="menu-btn primary">Select & Play</button>
          <button id="garage-back" class="menu-btn">Back</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.el);
    const presets=['#e11d48','#0ea5e9','#22c55e','#facc15','#ef4444','#a78bfa','#111827','#f97316','#06b6d4','#84cc16','#78350f','#e5e7eb'];
    const cont=this.el.querySelector('#garage-color-presets')!;
    presets.forEach(c=>{
      const b=document.createElement('button'); b.className='color-dot'; b.style.background=c;
      b.addEventListener('click',()=>{ this.color=c; (this.el.querySelector('#garage-color') as HTMLInputElement).value=c; this.render(); });
      cont.appendChild(b);
    });
    this.el.querySelector('#garage-prev')!.addEventListener('click',()=>{ this.idx=(this.idx-1+CARS.length)%CARS.length; this.render(); });
    this.el.querySelector('#garage-next')!.addEventListener('click',()=>{ this.idx=(this.idx+1)%CARS.length; this.render(); });
    (this.el.querySelector('#garage-color') as HTMLInputElement).addEventListener('input',(e)=>{ this.color=(e.target as HTMLInputElement).value; this.render(); });
    this.el.querySelector('#garage-select')!.addEventListener('click',()=>{ this.onSelect(CARS[this.idx], this.color); this.hide(); });
    this.el.querySelector('#garage-back')!.addEventListener('click',()=> this.hide());
    this.render();
  }

  private render(){
    const cfg=CARS[this.idx];
    (this.el.querySelector('#garage-name') as HTMLElement).textContent=cfg.name;
    (this.el.querySelector('#garage-class') as HTMLElement).textContent=cfg.class.toUpperCase();
    const preview=this.el.querySelector('#garage-preview') as HTMLElement;
    preview.innerHTML=`<div class="mini-car" style="background:${this.color}; width:110px; height:42px; border-radius:12px; margin:10px auto; position:relative; box-shadow:0 8px 20px rgba(0,0,0,0.3)"></div>`;
    // stats normalized 0..100
    const speed = Math.round((cfg.maxSpeedKmh-150)/(330-150)*100);
    const accel = Math.round((cfg.engineForce-2200)/(4000-2200)*100);
    const handle = Math.round((cfg.friction.front*10 + (0.7-cfg.steerSpeedFalloff)*10)/2);
    (this.el.querySelector('#stat-speed') as HTMLElement).style.width=Math.max(8,speed)+'%';
    (this.el.querySelector('#stat-accel') as HTMLElement).style.width=Math.max(8,accel)+'%';
    (this.el.querySelector('#stat-handle') as HTMLElement).style.width=Math.max(8,handle)+'%';
  }

  show(){ this.el.classList.remove('hidden'); this.el.style.display='grid'; this.visible=true; this.render(); }
  hide(){ this.el.classList.add('hidden'); this.el.style.display='none'; this.visible=false; }
  isVisible(){ return this.visible; }
  setIndexById(id:string){ const i=CARS.findIndex(c=>c.id===id); if(i>=0) this.idx=i; }
}

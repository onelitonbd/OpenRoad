// PhotoMode.ts — pause sim, free camera, FOV/time sliders, screenshot
import * as THREE from 'three';

export class PhotoMode {
  private el: HTMLElement;
  private active=false;
  private freeCam: THREE.PerspectiveCamera | null=null;
  private controls: { enabled:boolean } = { enabled:false };
  private origCamera: THREE.PerspectiveCamera | null=null;
  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private mainCamera: THREE.PerspectiveCamera){
    this.el=document.createElement('div');
    this.el.id='photo-mode';
    this.el.className='menu-overlay hidden';
    this.el.innerHTML=`
      <div class="menu-card photo-card">
        <h3 class="menu-title">Photo Mode</h3>
        <label>FOV <input type="range" id="photo-fov" min="30" max="95" value="70"></label>
        <label>Time <input type="range" id="photo-time" min="0" max="24" step="0.1" value="12"></label>
        <div class="menu-buttons">
          <button id="photo-shot" class="menu-btn primary">📸 Save Screenshot</button>
          <button id="photo-exit" class="menu-btn">Exit (P)</button>
        </div>
        <div class="photo-hint">Drag to orbit (hold right mouse) • Scroll zoom • P exit</div>
      </div>
    `;
    document.body.appendChild(this.el);
    this.el.querySelector('#photo-exit')!.addEventListener('click',()=>this.exit());
    this.el.querySelector('#photo-shot')!.addEventListener('click',()=>this.screenshot());
    const fovEl=this.el.querySelector('#photo-fov') as HTMLInputElement;
    fovEl.addEventListener('input',()=>{ if(this.freeCam) { this.freeCam.fov=parseFloat(fovEl.value); this.freeCam.updateProjectionMatrix(); }});
    const timeEl=this.el.querySelector('#photo-time') as HTMLInputElement;
    timeEl.addEventListener('input',()=>{ window.dispatchEvent(new CustomEvent('photo-time-change',{detail:{ time: parseFloat(timeEl.value)}})); });
    // Free cam mouse orbit
    let isDragging=false, lastX=0, lastY=0, yaw=0, pitch=-0.15;
    window.addEventListener('mousedown',(e)=>{ if(!this.active) return; if(e.button===2 || e.button===0){ isDragging=true; lastX=e.clientX; lastY=e.clientY; } });
    window.addEventListener('mouseup',()=> isDragging=false);
    window.addEventListener('mousemove',(e)=>{
      if(!this.active || !isDragging || !this.freeCam) return;
      const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY;
      yaw -= dx*0.004; pitch = Math.max(-1.3, Math.min(1.0, pitch - dy*0.004));
      const dist=22;
      const target = this.freeCam.userData.target as THREE.Vector3 ?? new THREE.Vector3();
      this.freeCam.position.set(
        target.x + Math.cos(yaw)*Math.cos(pitch)*dist,
        target.y + Math.sin(pitch)*dist + 4,
        target.z + Math.sin(yaw)*Math.cos(pitch)*dist
      );
      this.freeCam.lookAt(target);
    });
    window.addEventListener('wheel',(e)=>{
      if(!this.active || !this.freeCam) return;
      this.freeCam.fov = Math.max(20, Math.min(100, this.freeCam.fov + e.deltaY*0.02));
      this.freeCam.updateProjectionMatrix();
      (this.el.querySelector('#photo-fov') as HTMLInputElement).value = String(Math.round(this.freeCam.fov));
    });
    window.addEventListener('contextmenu',(e)=>{ if(this.active) e.preventDefault(); });
  }

  enter(){
    if(this.active) return;
    this.active=true;
    this.el.classList.remove('hidden'); this.el.style.display='grid';
    // Create free cam copy
    this.origCamera = this.mainCamera;
    this.freeCam = this.mainCamera.clone();
    this.freeCam.position.copy(this.mainCamera.position);
    this.freeCam.quaternion.copy(this.mainCamera.quaternion);
    const target = new THREE.Vector3(); this.mainCamera.getWorldDirection(target); // not exact but use lookAt target approximation
    // Set target as vehicle position if available via window
    const worldPos = (window as unknown as { __game?: { vehicle:{ group:{ position:THREE.Vector3 }}}}).__game?.vehicle.group.position ?? new THREE.Vector3();
    this.freeCam.userData.target = worldPos.clone();
    this.freeCam.lookAt(worldPos);
    // HUD hide
    const hud=document.getElementById('hud'); if(hud) hud.style.display='none';
    const touch=document.getElementById('touch-controls'); if(touch) touch.style.display='none';
  }

  exit(){
    if(!this.active) return;
    this.active=false;
    this.el.classList.add('hidden'); this.el.style.display='none';
    const hud=document.getElementById('hud'); if(hud) hud.style.display='block';
    const touch=document.getElementById('touch-controls'); if(touch && ('ontouchstart' in window)) touch.style.display='flex';
    this.freeCam=null;
  }

  isActive(){ return this.active; }
  getCamera(): THREE.PerspectiveCamera | null { return this.freeCam; }

  screenshot(){
    // renderer.domElement toBlob
    this.renderer.domElement.toBlob(blob=>{
      if(!blob) return;
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=`open-road-${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }
}

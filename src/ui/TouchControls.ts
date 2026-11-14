// TouchControls.ts — auto-show on touch devices, large pedals
export class TouchControls {
  private el: HTMLElement;
  private active=false;
  state={ throttle:0, brake:0, steer:0, handbrake:false };
  constructor(){
    this.el=document.createElement('div');
    this.el.id='touch-controls';
    this.el.className='touch-controls hidden';
    this.el.innerHTML=`
      <div class="touch-left">
        <button class="touch-btn steer" data-steer="-1">◀</button>
        <button class="touch-btn steer" data-steer="1">▶</button>
      </div>
      <div class="touch-right">
        <button class="touch-btn gas" data-gas="1">▲<br>Gas</button>
        <button class="touch-btn brake" data-brake="1">▼<br>Brake</button>
        <button class="touch-btn hand" data-hand="1">HB</button>
        <button class="touch-btn cam" data-cam="1">C</button>
        <button class="touch-btn rst" data-rst="1">⟲</button>
      </div>
    `;
    document.body.appendChild(this.el);
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints>0;
    if(isTouch) this.show();
    // Pointer events
    this.el.querySelectorAll('.touch-btn').forEach(btn=>{
      const el=btn as HTMLElement;
      const onDown=(e:Event)=>{ e.preventDefault(); this.handleDown(el); };
      const onUp=(e:Event)=>{ e.preventDefault(); this.handleUp(el); };
      el.addEventListener('touchstart', onDown, {passive:false});
      el.addEventListener('touchend', onUp, {passive:false});
      el.addEventListener('mousedown', onDown);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('mouseleave', onUp);
    });
    // Auto-show toggle via settings later
  }
  private handleDown(el:HTMLElement){
    if(el.dataset.steer) this.state.steer=parseFloat(el.dataset.steer!);
    if(el.dataset.gas) this.state.throttle=1;
    if(el.dataset.brake) this.state.brake=1;
    if(el.dataset.hand) this.state.handbrake=true;
    if(el.dataset.cam) document.dispatchEvent(new KeyboardEvent('keydown',{key:'c'}));
    if(el.dataset.rst) document.dispatchEvent(new KeyboardEvent('keydown',{key:'r'}));
  }
  private handleUp(el:HTMLElement){
    if(el.dataset.steer) this.state.steer=0;
    if(el.dataset.gas) this.state.throttle=0;
    if(el.dataset.brake) this.state.brake=0;
    if(el.dataset.hand) this.state.handbrake=false;
  }
  show(){ this.el.classList.remove('hidden'); this.active=true; }
  hide(){ this.el.classList.add('hidden'); this.active=false; }
  isActive(){ return this.active; }
}

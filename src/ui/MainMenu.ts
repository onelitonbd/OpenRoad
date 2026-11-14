// MainMenu.ts — overlay with Play / Garage / Settings
export class MainMenu {
  private el: HTMLElement;
  private visible = true;
  constructor(private onPlay: ()=>void, private onGarage: ()=>void, private onSettings: ()=>void) {
    this.el = document.createElement('div');
    this.el.id = 'main-menu';
    this.el.className = 'menu-overlay';
    this.el.innerHTML = `
      <div class="menu-card">
        <h1 class="menu-title">OPEN ROAD</h1>
        <p class="menu-subtitle">Drive the Horizon — Arcade-Sim Open World</p>
        <div class="menu-car-preview" id="menu-car-preview"><div class="menu-car-orbit"></div></div>
        <div class="menu-buttons">
          <button id="btn-play" class="menu-btn primary">▶ Play</button>
          <button id="btn-garage" class="menu-btn">Garage</button>
          <button id="btn-settings" class="menu-btn">Settings</button>
        </div>
        <div class="menu-hint">WASD drive • C camera • F3 debug</div>
      </div>
    `;
    document.body.appendChild(this.el);
    this.el.querySelector('#btn-play')!.addEventListener('click', ()=>{ this.hide(); this.onPlay(); });
    this.el.querySelector('#btn-garage')!.addEventListener('click', ()=> this.onGarage());
    this.el.querySelector('#btn-settings')!.addEventListener('click', ()=> this.onSettings());
  }
  show(){ this.el.style.display='grid'; this.visible=true; }
  hide(){ this.el.style.display='none'; this.visible=false; }
  isVisible(){ return this.visible; }
}

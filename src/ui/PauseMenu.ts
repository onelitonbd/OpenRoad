// PauseMenu.ts — resume, settings, respawn, time/weather, quit to menu
import { settings } from '../core/Settings';

export class PauseMenu {
  private el: HTMLElement;
  private visible=false;
  constructor(private onResume:()=>void, private onRespawn:()=>void, private onQuit:()=>void, private onTimeChange:(v:number)=>void, private onWeather:(s:string)=>void){
    this.el=document.createElement('div');
    this.el.id='pause-menu'; this.el.className='menu-overlay hidden';
    this.el.innerHTML=`
      <div class="menu-card">
        <h2 class="menu-title">Paused</h2>
        <div class="menu-buttons">
          <button id="pause-resume" class="menu-btn primary">Resume (Esc)</button>
          <button id="pause-respawn" class="menu-btn">Respawn (R)</button>
          <button id="pause-quit" class="menu-btn">Quit to Menu</button>
        </div>
        <div class="pause-settings">
          <label>Quality
            <select id="pause-quality">
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label>Day Time Scale
            <select id="pause-timescale">
              <option value="0">Paused</option><option value="0.5">0.5x</option><option value="1">1x</option><option value="2">2x</option>
            </select>
          </label>
          <label>Weather
            <select id="pause-weather">
              <option value="clear">Clear</option><option value="cloudy">Cloudy</option><option value="rain">Rain</option><option value="fog">Fog</option>
            </select>
          </label>
          <label>Volume <input type="range" id="pause-vol" min="0" max="1" step="0.05" value="0.8"></label>
        </div>
        <div class="pause-hint">Esc resume • F5 weather • F6 time • T tuning</div>
      </div>
    `;
    document.body.appendChild(this.el);
    this.el.querySelector('#pause-resume')!.addEventListener('click',()=>this.onResume());
    this.el.querySelector('#pause-respawn')!.addEventListener('click',()=>this.onRespawn());
    this.el.querySelector('#pause-quit')!.addEventListener('click',()=>this.onQuit());
    const qsel=this.el.querySelector('#pause-quality') as HTMLSelectElement;
    qsel.value=settings.quality;
    qsel.addEventListener('change',()=>{ settings.setQuality(qsel.value as never); location.reload(); }); // reload to apply chunk radius
    const tsel=this.el.querySelector('#pause-timescale') as HTMLSelectElement;
    tsel.value=String(settings.data.dayTimeScale);
    tsel.addEventListener('change',()=>{ const v=parseFloat(tsel.value); settings.set('dayTimeScale', v as never); this.onTimeChange(v); });
    const wsel=this.el.querySelector('#pause-weather') as HTMLSelectElement;
    wsel.addEventListener('change',()=> this.onWeather(wsel.value));
    const vsel=this.el.querySelector('#pause-vol') as HTMLInputElement;
    vsel.value=String(settings.data.masterVolume);
    vsel.addEventListener('input',()=> settings.set('masterVolume', parseFloat(vsel.value) as never));
  }
  show(){ this.el.classList.remove('hidden'); this.el.style.display='grid'; this.visible=true; }
  hide(){ this.el.classList.add('hidden'); this.el.style.display='none'; this.visible=false; }
  isVisible(){ return this.visible; }
}

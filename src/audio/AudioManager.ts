// AudioManager.ts — unlock on gesture, master volume
export class AudioManager {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  private unlocked = false;

  init() {
    window.addEventListener('click', this.unlock, { once: true });
    window.addEventListener('keydown', this.unlock, { once: true });
    window.addEventListener('touchstart', this.unlock, { once: true });
  }

  private unlock = () => {
    if (this.unlocked) return;
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
      this.unlocked = true;
      console.log('[Audio] unlocked', this.ctx.sampleRate);
    } catch (e) { console.warn('Audio unlock failed', e); }
  };

  setMaster(v:number){ if(this.masterGain) this.masterGain.gain.value=v; }
  isUnlocked(){ return this.unlocked; }
  getContext(){ return this.ctx; }
}
export const audioManager = new AudioManager();

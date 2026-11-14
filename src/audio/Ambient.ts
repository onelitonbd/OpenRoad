// Ambient.ts — city hum / wind / birds / waves / rain layers
import { audioManager } from './AudioManager';

export class Ambient {
  private windGain: GainNode | null = null;
  private windOsc: OscillatorNode | null = null;

  start() {
    const ctx = audioManager.getContext();
    if (!ctx) return;
    if (this.windOsc) return;
    // Simple wind via filtered noise-ish oscillator
    this.windOsc = ctx.createOscillator(); this.windOsc.type='triangle'; this.windOsc.frequency.value=42;
    this.windGain = ctx.createGain(); this.windGain.gain.value=0;
    const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=550;
    this.windOsc.connect(filter).connect(this.windGain).connect(audioManager.masterGain!);
    this.windOsc.start();
  }

  update(speedKmh:number, region:string, isRain:boolean) {
    if (!this.windGain || !audioManager.getContext()) return;
    const ctx = audioManager.getContext()!;
    const wind = Math.min(0.18, speedKmh/300 *0.16);
    this.windGain.gain.linearRampToValueAtTime(wind + (isRain?0.05:0), ctx.currentTime+0.2);
    // Could add region-specific ambient layers here
    void region;
  }

  stop() {
    if (this.windOsc){ try{ this.windOsc.stop(); } catch{} this.windOsc.disconnect(); this.windOsc=null; this.windGain=null; }
  }
}

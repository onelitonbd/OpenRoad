// EngineSound.ts — RPM → pitch/volume with oscillator fallback
import { audioManager } from './AudioManager';

export class EngineSound {
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private baseFreq = 55; // A1 ~55Hz

  start() {
    const ctx = audioManager.getContext();
    if (!ctx) return;
    if (this.osc) return;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = this.baseFreq;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.osc.connect(this.filter).connect(this.gain).connect(audioManager.masterGain!);
    this.osc.start();
  }

  stop() {
    if (this.osc) { try{ this.osc.stop(); } catch{} this.osc.disconnect(); this.osc=null; }
  }

  update(rpm:number, throttle:number, speedKmh:number) {
    if (!this.osc || !audioManager.getContext()) return;
    const ctx = audioManager.getContext()!;
    const norm = (rpm - 900) / (8000 - 900);
    const freq = this.baseFreq * (0.9 + norm*2.2 + throttle*0.3);
    this.osc.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 0.08);
    const vol = 0.08 + norm*0.18 + throttle*0.12 + Math.min(speedKmh/240,1)*0.07;
    this.gain!.gain.linearRampToValueAtTime(Math.min(0.45, vol), ctx.currentTime + 0.06);
    this.filter!.frequency.linearRampToValueAtTime(600 + norm*1200 + speedKmh*2, ctx.currentTime + 0.1);
  }

  // skid/crash one-shots via short buffers
  playSkid(intensity:number) {
    const ctx = audioManager.getContext();
    if (!ctx || !audioManager.isUnlocked()) return;
    const osc = ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 320 + intensity*180;
    const g = ctx.createGain(); g.gain.value = Math.min(0.22, intensity*0.35);
    const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1400;
    osc.connect(f).connect(g).connect(audioManager.masterGain!);
    osc.start(); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.22); osc.stop(ctx.currentTime+0.23);
  }
}

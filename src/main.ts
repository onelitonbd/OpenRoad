// main.ts — entry: boots Game
import { Game } from './core/Game';

function boot() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('Canvas not found');
    return;
  }
  const game = new Game(canvas);
  game.start();

  // Expose for debug
  (window as unknown as Record<string, unknown>).__game = game;

  // Handle visibility change — pause physics when hidden to avoid accumulator spiral
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Could pause music etc. later
    }
  });

  // Log version
  console.log('%c OPEN ROAD %c Phase 0 — low preset, chunk streaming coming in Phase 2 ',
    'background:#0ea5e9;color:#fff;padding:4px 8px;border-radius:8px 0 0 8px;font-weight:900',
    'background:#facc15;color:#0f172a;padding:4px 8px;border-radius:0 8px 8px 0;font-weight:700');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

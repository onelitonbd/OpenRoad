import './ui/styles.css';
import { Game } from './core/Game';

/**
 * Entry point.
 *
 * Shows a simple loading screen while Rapier's WASM module is downloaded and
 * the first chunks are generated, then hands over to the game.
 */

function showLoading(message: string): void {
  const el = document.getElementById('loading');
  if (el) {
    const label = el.querySelector('.loading-label');
    if (label) label.textContent = message;
  }
}

function setProgress(value: number): void {
  const el = document.getElementById('loading');
  if (!el) return;
  const bar = el.querySelector<HTMLElement>('.bar i');
  if (bar) bar.style.width = `${Math.round(value * 100)}%`;
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) {
    throw new Error('Open Road: missing #game-canvas or #ui-root in the page.');
  }

  setProgress(0.15);
  showLoading('Starting the engine...');

  const game = new Game(canvas, uiRoot);
  await game.init();

  setProgress(0.9);
  showLoading('Ready!');

  // Give the browser one frame to paint the loading screen before the heavy
  // work starts, otherwise the progress bar never appears.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

  setProgress(1);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('hidden');
  }

  game.start();

  // Expose the game for debugging in the browser console.
  (window as unknown as { openRoad?: Game }).openRoad = game;

  // A small hook used by the head-less smoke test.
  (window as unknown as { __openroad?: unknown }).__openroad = {
    ready: true,
    stats: () => {
      const info = game.renderer.renderer.info;
      const position = game.vehicle.body.translation();
      return {
        fps: Math.round(game.debug.fps),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        chunksLoaded: game.world.loadedCount,
        chunkQueue: game.world.queueCount,
        position: [position.x, position.y, position.z],
        speedKmh: Math.round(game.vehicle.speedKmh),
      };
    },
  };
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  showLoading('Something went wrong. Check the browser console for details.');
});

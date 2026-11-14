import type { RoadNetwork } from '../world/RoadNetwork';

/**
 * The minimap in the corner of the screen.
 *
 * The road network is drawn once into an offscreen canvas (the whole world
 * at a fixed scale). Every frame the canvas is only cropped and moved, so
 * the minimap costs almost nothing.
 */
export class Minimap {
  readonly root: HTMLDivElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly map: HTMLCanvasElement;
  private readonly mapContext: CanvasRenderingContext2D;

  /** The size of the world that is drawn on the map. */
  private readonly worldSize = 8000;
  private readonly mapSize = 512;

  constructor(parent: HTMLElement, private readonly network: RoadNetwork) {
    this.root = document.createElement('div');
    this.root.className = 'hud-minimap';

    this.map = document.createElement('canvas');
    this.map.width = this.mapSize;
    this.map.height = this.mapSize;
    const mapContext = this.map.getContext('2d');
    if (!mapContext) throw new Error('Minimap: no 2d context');
    this.mapContext = mapContext;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 180;
    this.canvas.height = 180;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Minimap: no 2d context');
    this.context = context;
    this.root.appendChild(this.canvas);

    parent.appendChild(this.root);

    this.drawMap();
  }

  /** Draw the whole road network into the offscreen canvas. */
  private drawMap(): void {
    const ctx = this.mapContext;
    ctx.fillStyle = '#10151b';
    ctx.fillRect(0, 0, this.mapSize, this.mapSize);

    // A soft glow for the city centre.
    const gradient = ctx.createRadialGradient(
      this.mapSize / 2, this.mapSize / 2, 0,
      this.mapSize / 2, this.mapSize / 2, this.mapSize / 2,
    );
    gradient.addColorStop(0, 'rgba(90,110,140,0.55)');
    gradient.addColorStop(1, 'rgba(10,14,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.mapSize, this.mapSize);

    const scale = this.mapSize / this.worldSize;
    const toMap = (x: number, z: number): [number, number] => [
      (x + this.worldSize / 2) * scale,
      (z + this.worldSize / 2) * scale,
    ];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw the minor roads first, then the highways on top.
    const order = ['street', 'rural', 'switchback', 'coastal', 'avenue', 'highway'];
    for (const type of order) {
      ctx.beginPath();
      let started = false;
      for (const edge of this.network.edges) {
        if (edge.type !== type) continue;
        const count = edge.points.length / 2;
        for (let i = 0; i < count; i++) {
          const [px, py] = toMap(edge.points[i * 2], edge.points[i * 2 + 1]);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
      }
      if (type === 'highway') {
        ctx.strokeStyle = '#f0c76a';
        ctx.lineWidth = 3;
      } else if (type === 'avenue') {
        ctx.strokeStyle = '#8fb4e0';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(160,170,185,0.55)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }

    // The starting point of the game.
    const start = this.network.nodes[0];
    if (start) {
      const [px, py] = toMap(start.x, start.z);
      ctx.fillStyle = '#6fe08a';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Move the minimap to the player. */
  update(playerX: number, playerZ: number, heading: number): void {
    const ctx = this.context;
    const size = this.canvas.width;
    ctx.clearRect(0, 0, size, size);

    // The visible part of the world is 1200 m wide.
    const viewSize = 1200;
    const scale = size / viewSize;

    ctx.save();
    // Clip to a circle.
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#10151b';
    ctx.fillRect(0, 0, size, size);

    // Rotate the map so the player always drives "up".
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-heading);
    ctx.scale(scale, scale);
    ctx.translate(-playerX, -playerZ);

    // The map canvas covers the whole world.
    const worldScale = this.mapSize / this.worldSize;
    ctx.drawImage(
      this.map,
      -this.worldSize / 2,
      -this.worldSize / 2,
      this.worldSize,
      this.worldSize,
    );
    void worldScale;
    ctx.restore();

    // The border of the minimap.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    // The player marker in the middle.
    ctx.fillStyle = '#ffd166';
    ctx.strokeStyle = '#1b1f27';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2 - 8);
    ctx.lineTo(size / 2 - 6, size / 2 + 6);
    ctx.lineTo(size / 2, size / 2 + 3);
    ctx.lineTo(size / 2 + 6, size / 2 + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  dispose(): void {
    this.root.remove();
  }
}

import * as THREE from 'three';
import type { RoadNetwork } from '../world/RoadNetwork';

/**
 * Draws the road graph as lines.
 *
 * It is only used for debugging (the F3 overlay), so it is a simple
 * `LineSegments` object that is rebuilt when the player moves far enough.
 */
export class RoadGraphDebug {
  readonly object = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ vertexColors: true }),
  );

  private lastX = Number.NaN;
  private lastZ = Number.NaN;

  constructor(private readonly network: RoadNetwork) {
    this.object.name = 'road-graph-debug';
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Show or hide the graph. */
  set visible(visible: boolean) {
    this.object.visible = visible;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  /** Rebuild the lines when the player has moved far enough. */
  update(playerX: number, playerZ: number): void {
    if (
      Number.isFinite(this.lastX) &&
      Math.abs(playerX - this.lastX) < 200 &&
      Math.abs(playerZ - this.lastZ) < 200
    ) {
      return;
    }
    this.lastX = playerX;
    this.lastZ = playerZ;

    const positions: number[] = [];
    const colors: number[] = [];

    for (const edge of this.network.edges) {
      const count = edge.points.length / 2;
      // Highways are yellow, the other roads are blue.
      const color =
        edge.type === 'highway'
          ? new THREE.Color(0xf0c76a)
          : edge.type === 'avenue'
            ? new THREE.Color(0x8fb4e0)
            : new THREE.Color(0x4a6b8a);

      for (let i = 0; i < count - 1; i++) {
        positions.push(edge.points[i * 2], edge.heights[i] + 0.5, edge.points[i * 2 + 1]);
        positions.push(edge.points[i * 2 + 2], edge.heights[i + 1] + 0.5, edge.points[i * 2 + 3]);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.object.geometry.dispose();
    this.object.geometry = geometry;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}

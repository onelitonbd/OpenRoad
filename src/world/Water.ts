import * as THREE from 'three';
import { SEA_LEVEL, WORLD_HALF } from './Terrain';

/**
 * The sea.
 *
 * A single big plane with a cheap custom shader: the vertices wobble a little
 * and the colour changes with the distance so it reads as water without any
 * reflections (those are too expensive for the low end target).
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  private time = 0;

  constructor() {
    const geometry = new THREE.PlaneGeometry(WORLD_HALF * 4, WORLD_HALF * 4, 40, 40);
    geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x14415f) },
        uShallow: { value: new THREE.Color(0x2f87a8) },
        uFogColor: { value: new THREE.Color(0x9fc8e8) },
        uFogNear: { value: 200 },
        uFogFar: { value: 1200 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying float vWave;
        varying float vDist;

        void main() {
          vec3 pos = position;
          float wave =
            sin(pos.x * 0.02 + uTime * 0.8) * 0.35 +
            sin(pos.z * 0.017 - uTime * 0.6) * 0.3 +
            sin((pos.x + pos.z) * 0.008 + uTime * 0.35) * 0.5;
          pos.y += wave;
          vWave = wave;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying float vWave;
        varying float vDist;

        void main() {
          float t = clamp(vWave * 0.6 + 0.5, 0.0, 1.0);
          vec3 color = mix(uDeep, uShallow, t);
          // Fade the water into the fog at the horizon.
          float fogFactor = smoothstep(uFogNear, uFogFar, vDist);
          color = mix(color, uFogColor, fogFactor);
          gl_FragColor = vec4(color, mix(0.92, 1.0, fogFactor));
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'water';
  }

  /** Animate the waves. */
  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
  }

  /** Keep the water plane centred on the player so it always reaches the horizon. */
  follow(x: number, z: number): void {
    this.mesh.position.x = Math.round(x / 100) * 100;
    this.mesh.position.z = Math.round(z / 100) * 100;
  }

  /** Match the fog of the scene so the horizon disappears nicely. */
  setFog(color: THREE.Color, near: number, far: number): void {
    this.material.uniforms.uFogColor.value.copy(color);
    this.material.uniforms.uFogNear.value = near;
    this.material.uniforms.uFogFar.value = far;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

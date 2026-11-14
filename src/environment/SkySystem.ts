// SkySystem.ts — Three Sky + stars + moon + cheap clouds
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export class SkySystem {
  sky: Sky;
  sun = new THREE.Vector3();
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private clouds: THREE.Mesh;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(8000);
    scene.add(this.sky);
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = 6.5;
    uniforms['rayleigh'].value = 1.8;
    uniforms['mieCoefficient'].value = 0.003;
    uniforms['mieDirectionalG'].value = 0.75;

    // Stars — points on dome
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const pos = new Float32Array(starCount*3);
    for (let i=0;i<starCount;i++) {
      const theta = Math.random()*Math.PI*2;
      const phi = Math.acos(1 - Math.random()*0.5); // upper hemisphere only, avoid horizon
      const r = 3900;
      pos[i*3+0] = r * Math.sin(phi)*Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = r * Math.sin(phi)*Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation:true, transparent:true, opacity:0.85 });
    this.stars = new THREE.Points(starGeo, starMat);
    scene.add(this.stars);

    // Moon
    const moonGeo = new THREE.SphereGeometry(110, 16, 16);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xfff8dc });
    this.moon = new THREE.Mesh(moonGeo, moonMat);
    scene.add(this.moon);

    // Clouds — dome with noise texture (simple transparent plane dome)
    const cloudGeo = new THREE.SphereGeometry(3800, 32, 16, 0, Math.PI*2, 0, Math.PI*0.45);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent:true, opacity:0.22, side:THREE.DoubleSide });
    this.clouds = new THREE.Mesh(cloudGeo, cloudMat);
    this.clouds.position.y = -120;
    scene.add(this.clouds);
  }

  updateFromSun(sunPos: THREE.Vector3, timeOfDay:number) {
    // Sky sun
    this.sun.copy(sunPos);
    this.sky.material.uniforms['sunPosition'].value.copy(this.sun);

    // Stars opacity: only at night
    const isNight = timeOfDay < 5.5 || timeOfDay > 19.5;
    (this.stars.material as THREE.PointsMaterial).opacity = isNight ? 0.9 : 0.0;

    // Moon opposite sun
    this.moon.position.copy(sunPos.clone().negate().normalize().multiplyScalar(3200));
    this.moon.position.y = Math.abs(this.moon.position.y) * 0.6 + 800;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = isNight ? 0.95 : 0.0;
    this.moon.visible = isNight;

    // Clouds drift slowly
    this.clouds.rotation.y += 0.00007;
    // Thicker at cloudy/rain see Weather — opacity modulated externally
  }

  setCloudOpacity(o:number) {
    (this.clouds.material as THREE.MeshStandardMaterial).opacity = o;
  }

  dispose() {
    this.scene.remove(this.sky); this.scene.remove(this.stars); this.scene.remove(this.moon); this.scene.remove(this.clouds);
    this.sky.geometry.dispose(); (this.sky.material as THREE.Material).dispose();
    this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose();
    this.moon.geometry.dispose(); (this.moon.material as THREE.Material).dispose();
    this.clouds.geometry.dispose(); (this.clouds.material as THREE.Material).dispose();
  }
}

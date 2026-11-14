// cars.ts — list of car definitions (Phase 1: one car, ready for 10+)
import type { VehicleConfig } from './VehicleConfig';

export const CARS: VehicleConfig[] = [
  {
    id: 'comet-gt',
    name: 'Comet GT',
    class: 'sports',
    mass: 1500,
    engineForce: 2800,
    brakeForce: 4000,
    maxSpeedKmh: 240,
    steerMax: 0.55,
    steerSpeedFalloff: 0.6,
    suspension: { stiffness: 22, damping: 2.2, travel: 0.35, restLength: 0.38 },
    friction: { front: 1.15, rear: 1.05, driftSlip: 0.3 },
    centerOfMassY: -0.25,
    downforce: 0.12,
    gearRatios: [3.2, 2.1, 1.5, 1.1, 0.85],
    finalDrive: 3.4,
    redlineRpm: 7000,
    wheelRadius: 0.34,
    dimensions: [4.4, 1.9, 1.2],
    model: 'procedural',
    color: '#e11d48',
  },
];

// helper
export function getCarById(id: string): VehicleConfig | undefined {
  return CARS.find(c => c.id === id);
}
export function getDefaultCar(): VehicleConfig {
  return CARS[0];
}

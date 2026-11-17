import type { VehicleConfig } from './VehicleConfig';

/**
 * The car catalogue.
 *
 * Every car is pure data - the physics and the mesh builder read these
 * numbers, so adding a new car never requires touching game logic.
 * Phase 7 fills this list out with the remaining 10+ cars.
 */

export const COMET_GT: VehicleConfig = {
  id: 'comet-gt',
  name: 'Comet GT',
  class: 'sports',
  mass: 1350,
  engineForce: 3600,
  brakeForce: 3200,
  maxSpeedKmh: 245,
  steerMax: 0.55,
  steerSpeed: 4.2,
  steerSpeedFalloff: 0.72,
  suspension: {
    stiffness: 45,
    damping: 7.5,
    relaxation: 9.5,
    travel: 0.2,
    restLength: 0.36,
    maxForce: 30000,
  },
  friction: {
    front: 2.4,
    rear: 2.2,
    driftSlip: 0.6,
    slipFactor: 1.35,
  },
  centerOfMassY: 0.36,
  downforce: 900,
  idleRpm: 900,
  redlineRpm: 7600,
  gearRatios: [3.1, 2.05, 1.5, 1.18, 0.96, 0.79],
  finalDrive: 3.6,
  wheelRadius: 0.35,
  dimensions: [1.9, 1.28, 4.5],
  frontAxleOffset: 1.38,
  rearAxleOffset: -1.42,
  groundClearance: 0.2,
  trackWidth: 0.82,
  model: 'models/sedan-sports.glb',
  color: '#ff5d5d',
  accentColor: '#20242e',
  bodyShape: 'coupe',
  drag: 1,
  stabilityAssist: 0.35,
  description: 'Balanced starter sports car. Forgiving, quick and easy to place.',
};

export const CARS: VehicleConfig[] = [COMET_GT];

/** Find a car definition by its id. */
export function getCarById(id: string): VehicleConfig | undefined {
  return CARS.find((car) => car.id === id);
}

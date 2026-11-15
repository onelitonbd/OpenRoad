import type { VehicleConfig } from './VehicleConfig';

/**
 * The cars of the traffic.
 *
 * They are ordinary road cars - not race cars - so they only need a few
 * numbers: enough mass to sit on the road and enough power to keep up with
 * the speed limit of their road.
 */

/** The suspension that every traffic car uses. */
const TRAFFIC_SUSPENSION = {
  stiffness: 42,
  damping: 3.2,
  relaxation: 2.6,
  travel: 0.3,
  restLength: 0.34,
  maxForce: 12000,
};

function trafficCar(
  id: string,
  name: string,
  bodyShape: VehicleConfig['bodyShape'],
  dimensions: [number, number, number],
  color: string,
  accentColor: string,
  maxSpeedKmh: number,
): VehicleConfig {
  const length = dimensions[2];
  return {
    id,
    name,
    class: 'sedan',
    mass: 1200,
    engineForce: 3600,
    brakeForce: 9000,
    maxSpeedKmh,
    steerMax: 0.6,
    steerSpeed: 6,
    // The AI cars need to be able to steer at high speed, otherwise they
    // drive straight over the kerb.
    steerSpeedFalloff: 0.3,
    suspension: { ...TRAFFIC_SUSPENSION },
    friction: { front: 2.1, rear: 2.1, driftSlip: 0.5, slipFactor: 0.12 },
    centerOfMassY: 0.5,
    downforce: 2,
    idleRpm: 800,
    redlineRpm: 6000,
    gearRatios: [3.2, 1.9, 1.3, 1.0, 0.8],
    finalDrive: 3.6,
    wheelRadius: 0.32,
    dimensions,
    frontAxleOffset: length * 0.32,
    rearAxleOffset: -length * 0.32,
    groundClearance: 0.22,
    trackWidth: dimensions[0] * 0.46,
    drag: 1,
    stabilityAssist: 0.25,
    description: `${name} - one of the cars on the road.`,
    model: 'procedural',
    color,
    accentColor,
    bodyShape,
  };
}

/** The traffic cars. The traffic picks one of them at random. */
export const AI_CARS: VehicleConfig[] = [
  trafficCar('sedan', 'Sedan', 'sedan', [1.78, 1.42, 4.4], '#c8ccd4', '#8f959e', 160),
  trafficCar('hatch', 'Hatchback', 'hatch', [1.72, 1.46, 3.9], '#d8dde4', '#7d838c', 150),
  trafficCar('van', 'Van', 'suv', [1.9, 2.0, 4.8], '#e2e6ea', '#9aa1a9', 140),
  trafficCar('pickup', 'Pickup', 'truck', [1.95, 1.72, 5.1], '#9fb0c4', '#5d6b7d', 150),
  trafficCar('taxi', 'Taxi', 'sedan', [1.8, 1.44, 4.5], '#f0c33c', '#2b2b2b', 155),
  trafficCar('compact', 'Compact', 'hatch', [1.66, 1.4, 3.7], '#9fd0b0', '#4f7a63', 145),
];

/** The paint colours the traffic uses (the taxi keeps its yellow). */
export const AI_PAINT_COLORS = [
  '#c8ccd4', '#d8dde4', '#9fb0c4', '#7f96ad', '#b8b2a6',
  '#8fa3b8', '#c2c6cf', '#a9b2be', '#6f7d8c', '#d0c3b4',
];

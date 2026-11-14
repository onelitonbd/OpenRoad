/**
 * Data driven description of a car.
 *
 * All handling numbers live here (and in `cars.ts`), never inside the driving
 * logic. That way adding a new car is only a matter of adding one entry.
 */

export type CarClass =
  | 'sports'
  | 'super'
  | 'muscle'
  | 'hatch'
  | 'sedan'
  | 'suv'
  | 'truck'
  | 'local';

export interface SuspensionConfig {
  /** Spring stiffness of the wheel ray-cast suspension. */
  stiffness: number;
  /** Damping while the suspension is compressing. */
  damping: number;
  /** Damping while the suspension is extending. */
  relaxation: number;
  /** Maximum travel of the suspension in metres. */
  travel: number;
  /** Rest length of the suspension in metres. */
  restLength: number;
  /** Hard limit on the suspension force (prevents the car from launching). */
  maxForce: number;
}

export interface FrictionConfig {
  /** Grip of the front axle. */
  front: number;
  /** Grip of the rear axle. */
  rear: number;
  /** How much grip the handbrake removes from the rear axle (0..1). */
  driftSlip: number;
  /** Longitudinal slip factor (higher = more wheelspin). */
  slipFactor: number;
}

export interface VehicleConfig {
  id: string;
  name: string;
  class: CarClass;
  /** Chassis mass in kilograms. */
  mass: number;
  /** Peak engine force in newtons (per driven wheel). */
  engineForce: number;
  /** Brake force in newtons. */
  brakeForce: number;
  /** Top speed in km/h. */
  maxSpeedKmh: number;
  /** Maximum steering angle in radians. */
  steerMax: number;
  /** How fast the steering angle reaches its maximum (higher = sharper). */
  steerSpeed: number;
  /** Steering angle is reduced at speed; 1 = no reduction, 0 = full lock unused. */
  steerSpeedFalloff: number;
  suspension: SuspensionConfig;
  friction: FrictionConfig;
  /** Height of the centre of mass above the chassis origin. */
  centerOfMassY: number;
  /** Downforce applied at speed (newtons per m/s). */
  downforce: number;
  /** Engine RPM at full throttle in neutral (used for the fake gearbox). */
  idleRpm: number;
  /** RPM where the limiter cuts in. */
  redlineRpm: number;
  /** Gear ratios (index 0 = first gear). */
  gearRatios: number[];
  /** Final drive ratio. */
  finalDrive: number;
  /** Wheel radius in metres. */
  wheelRadius: number;
  /** Chassis size in metres: [width, height, length]. */
  dimensions: [number, number, number];
  /** Distance from the chassis centre to the front axle. */
  frontAxleOffset: number;
  /** Distance from the chassis centre to the rear axle. */
  rearAxleOffset: number;
  /** Height of the car body above the road surface in metres. */
  groundClearance: number;
  /** Half track width in metres. */
  trackWidth: number;
  /** GLB path under /public/models or 'procedural' for the generated mesh. */
  model: string;
  /** Default paint colour (hex). */
  color: string;
  /** Accent colour used for details (hex). */
  accentColor: string;
  /** Shape of the procedurally generated body. */
  bodyShape: 'coupe' | 'roadster' | 'muscle' | 'hatch' | 'suv' | 'truck' | 'sedan';
  /** Aerodynamic drag coefficient multiplier. */
  drag: number;
  /** Extra yaw damping used by the stability assist (0 = off). */
  stabilityAssist: number;
  /** Short description shown in the garage. */
  description: string;
}

/** Colours offered in the garage. */
export const CAR_COLORS: { name: string; hex: string }[] = [
  { name: 'Sunset', hex: '#ff5d5d' },
  { name: 'Ocean', hex: '#3aa0ff' },
  { name: 'Lime', hex: '#8ede4a' },
  { name: 'Gold', hex: '#ffc02e' },
  { name: 'Violet', hex: '#a06bff' },
  { name: 'Pearl', hex: '#eef2f7' },
  { name: 'Onyx', hex: '#22262e' },
  { name: 'Mint', hex: '#39d3b0' },
];

/** Rough 0..1 ratings used for the garage stat bars. */
export interface CarRatings {
  speed: number;
  accel: number;
  handling: number;
}

export function rateCar(config: VehicleConfig): CarRatings {
  const speed = Math.min(1, config.maxSpeedKmh / 340);
  // Acceleration depends on power per ton.
  const powerPerTon = (config.engineForce * 4) / (config.mass / 1000);
  const accel = Math.min(1, powerPerTon / 190);
  // Handling depends on grip relative to mass, plus downforce.
  const gripPerTon = (config.friction.rear * 4 + config.friction.front * 4) / (config.mass / 1000);
  const handling = Math.min(1, gripPerTon / 34 + config.downforce / 2600);
  return { speed, accel, handling };
}

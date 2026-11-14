// VehicleConfig.ts — per-car tuning data type
export interface SuspensionConfig {
  stiffness: number;
  damping: number;
  travel: number;
  restLength: number;
}
export interface FrictionConfig {
  front: number;
  rear: number;
  driftSlip: number;
}
export interface VehicleConfig {
  id: string;
  name: string;
  class: 'sports' | 'super' | 'muscle' | 'hatch' | 'sedan' | 'suv' | 'truck' | 'local';
  mass: number;
  engineForce: number;
  brakeForce: number;
  maxSpeedKmh: number;
  steerMax: number; // radians
  steerSpeedFalloff: number; // how much steer reduces at speed 0..1
  suspension: SuspensionConfig;
  friction: FrictionConfig;
  centerOfMassY: number;
  downforce: number;
  gearRatios: number[];
  finalDrive: number;
  redlineRpm: number;
  wheelRadius: number;
  dimensions: [number, number, number]; // length, width, height
  model: string; // GLB path or 'procedural'
  color: string;
}

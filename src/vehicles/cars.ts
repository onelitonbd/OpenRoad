// cars.ts — 12 car definitions with distinct handling, per PROJECT.md 7.2
import type { VehicleConfig } from './VehicleConfig';

export const CARS: VehicleConfig[] = [
  {
    id: 'comet-gt', name: 'Comet GT', class: 'sports', mass: 1500, engineForce: 2800, brakeForce: 4000, maxSpeedKmh: 240, steerMax: 0.55, steerSpeedFalloff: 0.6,
    suspension: { stiffness: 22, damping: 2.2, travel: 0.35, restLength: 0.38 }, friction: { front: 1.15, rear: 1.05, driftSlip: 0.3 }, centerOfMassY: -0.25, downforce: 0.12,
    gearRatios:[3.2,2.1,1.5,1.1,0.85], finalDrive:3.4, redlineRpm:7000, wheelRadius:0.34, dimensions:[4.4,1.9,1.2], model:'procedural', color:'#e11d48',
  },
  {
    id: 'vortex-r', name: 'Vortex R', class:'super', mass:1380, engineForce:3600, brakeForce:4200, maxSpeedKmh:310, steerMax:0.50, steerSpeedFalloff:0.65,
    suspension:{stiffness:26,damping:2.0,travel:0.32,restLength:0.35}, friction:{front:1.22,rear:1.08,driftSlip:0.28}, centerOfMassY:-0.28, downforce:0.18,
    gearRatios:[3.0,1.9,1.4,1.05,0.78], finalDrive:3.2, redlineRpm:8200, wheelRadius:0.33, dimensions:[4.5,1.95,1.05], model:'procedural', color:'#0ea5e9',
  },
  {
    id: 'apex-speedster', name:'Apex Speedster', class:'super', mass:1420, engineForce:3400, brakeForce:4400, maxSpeedKmh:295, steerMax:0.52, steerSpeedFalloff:0.55,
    suspension:{stiffness:28,damping:2.4,travel:0.30,restLength:0.34}, friction:{front:1.28,rear:1.18,driftSlip:0.32}, centerOfMassY:-0.30, downforce:0.22,
    gearRatios:[3.1,2.0,1.45,1.08,0.82], finalDrive:3.3, redlineRpm:7800, wheelRadius:0.34, dimensions:[4.6,2.0,1.1], model:'procedural', color:'#22c55e',
  },
  {
    id:'bolt-coupe', name:'Bolt Coupe', class:'sports', mass:1280, engineForce:2500, brakeForce:3800, maxSpeedKmh:250, steerMax:0.60, steerSpeedFalloff:0.58,
    suspension:{stiffness:20,damping:1.9,travel:0.36,restLength:0.39}, friction:{front:1.12,rear:1.02,driftSlip:0.26}, centerOfMassY:-0.22, downforce:0.10,
    gearRatios:[3.3,2.2,1.55,1.15,0.88], finalDrive:3.5, redlineRpm:7200, wheelRadius:0.33, dimensions:[4.1,1.82,1.12], model:'procedural', color:'#facc15',
  },
  {
    id:'thunder-v8', name:'Thunder V8', class:'muscle', mass:1650, engineForce:3200, brakeForce:3800, maxSpeedKmh:270, steerMax:0.48, steerSpeedFalloff:0.62,
    suspension:{stiffness:18,damping:2.0,travel:0.38,restLength:0.40}, friction:{front:1.10,rear:0.92,driftSlip:0.20}, centerOfMassY:-0.20, downforce:0.09,
    gearRatios:[3.4,2.3,1.6,1.18,0.90], finalDrive:3.6, redlineRpm:6500, wheelRadius:0.35, dimensions:[4.7,1.92,1.28], model:'procedural', color:'#ef4444',
  },
  {
    id:'drift-king', name:'Drift King', class:'sports', mass:1350, engineForce:2700, brakeForce:3600, maxSpeedKmh:235, steerMax:0.62, steerSpeedFalloff:0.52,
    suspension:{stiffness:19,damping:1.7,travel:0.40,restLength:0.42}, friction:{front:1.18,rear:0.78,driftSlip:0.18}, centerOfMassY:-0.24, downforce:0.08,
    gearRatios:[3.25,2.15,1.5,1.12,0.85], finalDrive:3.45, redlineRpm:7000, wheelRadius:0.34, dimensions:[4.3,1.88,1.15], model:'procedural', color:'#a78bfa',
  },
  {
    id:'phantom-x', name:'Phantom X', class:'super', mass:1500, engineForce:4000, brakeForce:4300, maxSpeedKmh:330, steerMax:0.45, steerSpeedFalloff:0.70,
    suspension:{stiffness:30,damping:2.1,travel:0.28,restLength:0.33}, friction:{front:1.20,rear:1.10,driftSlip:0.30}, centerOfMassY:-0.32, downforce:0.20,
    gearRatios:[2.9,1.85,1.35,1.0,0.75], finalDrive:3.1, redlineRpm:8500, wheelRadius:0.33, dimensions:[4.8,2.02,1.08], model:'procedural', color:'#111827',
  },
  {
    id:'rally-fox', name:'Rally Fox', class:'hatch', mass:1220, engineForce:2400, brakeForce:3900, maxSpeedKmh:220, steerMax:0.58, steerSpeedFalloff:0.54,
    suspension:{stiffness:16,damping:2.3,travel:0.45,restLength:0.45}, friction:{front:1.08,rear:1.04,driftSlip:0.34}, centerOfMassY:-0.18, downforce:0.07,
    gearRatios:[3.35,2.25,1.6,1.2,0.92], finalDrive:3.7, redlineRpm:6800, wheelRadius:0.34, dimensions:[4.0,1.78,1.35], model:'procedural', color:'#f97316',
  },
  {
    id:'hyper-wing', name:'Hyper Wing', class:'super', mass:1400, engineForce:3800, brakeForce:4600, maxSpeedKmh:320, steerMax:0.46, steerSpeedFalloff:0.60,
    suspension:{stiffness:32,damping:2.5,travel:0.26,restLength:0.32}, friction:{front:1.30,rear:1.22,driftSlip:0.33}, centerOfMassY:-0.35, downforce:0.26,
    gearRatios:[2.95,1.88,1.38,1.02,0.77], finalDrive:3.0, redlineRpm:8800, wheelRadius:0.33, dimensions:[4.65,2.00,1.02], model:'procedural', color:'#06b6d4',
  },
  {
    id:'street-racer', name:'Street Racer', class:'sedan', mass:1480, engineForce:2300, brakeForce:3800, maxSpeedKmh:215, steerMax:0.54, steerSpeedFalloff:0.50,
    suspension:{stiffness:21,damping:2.1,travel:0.36,restLength:0.38}, friction:{front:1.10,rear:1.06,driftSlip:0.31}, centerOfMassY:-0.20, downforce:0.09,
    gearRatios:[3.3,2.2,1.55,1.12,0.86], finalDrive:3.5, redlineRpm:6400, wheelRadius:0.34, dimensions:[4.55,1.85,1.30], model:'procedural', color:'#e5e7eb',
  },
  {
    id:'dune-runner', name:'Dune Runner', class:'suv', mass:1750, engineForce:2600, brakeForce:3700, maxSpeedKmh:200, steerMax:0.52, steerSpeedFalloff:0.48,
    suspension:{stiffness:15,damping:2.6,travel:0.50,restLength:0.48}, friction:{front:1.05,rear:1.02,driftSlip:0.35}, centerOfMassY:-0.12, downforce:0.06,
    gearRatios:[3.5,2.4,1.7,1.25,0.95], finalDrive:3.8, redlineRpm:6200, wheelRadius:0.38, dimensions:[4.6,1.95,1.55], model:'procedural', color:'#84cc16',
  },
  {
    id:'iron-hauler', name:'Iron Hauler', class:'truck', mass:2200, engineForce:2800, brakeForce:5000, maxSpeedKmh:175, steerMax:0.42, steerSpeedFalloff:0.45,
    suspension:{stiffness:14,damping:2.8,travel:0.52,restLength:0.50}, friction:{front:1.02,rear:0.98,driftSlip:0.36}, centerOfMassY:-0.08, downforce:0.05,
    gearRatios:[3.6,2.5,1.8,1.3,1.0], finalDrive:4.0, redlineRpm:5800, wheelRadius:0.40, dimensions:[5.2,2.1,1.85], model:'procedural', color:'#78350f',
  },
];

export function getCarById(id:string){ return CARS.find(c=>c.id===id); }
export function getDefaultCar(){ return CARS[0]; }

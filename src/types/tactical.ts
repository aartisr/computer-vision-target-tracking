/**
 * Tactical Data Models & Types for GNSS-Denied Edge CV & Tracking System
 */

export type OperationalDomain = 'maritime' | 'aerial' | 'joint';

export type SensorSpectrum = 'eo_day' | 'flir_white' | 'flir_black' | 'nvg_night';

export type TrackState = 'tentative' | 'confirmed' | 'lost';

export interface BoundingBox {
  x: number; // Top-left x
  y: number; // Top-left y
  w: number; // Width
  h: number; // Height
}

export interface Point {
  x: number;
  y: number;
}

export interface Detection {
  id?: number;
  class: string;
  category: 'vessel' | 'aircraft' | 'beacon' | 'unknown';
  bbox: BoundingBox;
  score: number;
  thermalSignature: number; // 0..1 temperature contrast
  radarCrossSection?: number; // m^2
  actualVelocity?: [number, number];
}

export interface Tracklet {
  id: number;
  class: string;
  category: 'vessel' | 'aircraft' | 'beacon' | 'unknown';
  bbox: BoundingBox;
  predictedBbox?: BoundingBox;
  velocity: [number, number]; // [vx, vy] in pixels/sec
  speedKnots: number;
  headingDeg: number;
  rangeMeters: number;
  bearingDeg: number;
  confidence: number;
  state: TrackState;
  history: Array<{ x: number; y: number; time: number }>;
  lostFrames: number;
  confirmedFrames: number;
  covariance: number; // Position variance from Kalman Filter
  thermalSignature: number;
  tcpaSeconds: number; // Time to Closest Point of Approach
  locked: boolean;
}

export type FlirPalette = 'white_hot' | 'black_hot' | 'ironbow';

export interface DegradationSettings {
  spectrum: SensorSpectrum;
  flirPalette: FlirPalette;
  fogDensity: number; // 0..1
  marineHaze: number; // 0..1
  jitterRms: number; // 0..10 pixels
  enableJitterCompensation: boolean; // Dynamically scales Kalman measurement noise R to curb jitter drift
  luxLevel: number; // 0.01 (pitch night) to 1000 (bright sun)
  glare: number; // 0..1
  enableOpticalFlowOverlay: boolean;
  enableKalmanVectorOverlay: boolean;
  enableCovarianceEllipse: boolean;
  enableHorizonHud: boolean;
  flirGain: number; // 0.5 .. 3.5 (gain multiplier)
  flirLevel: number; // -40 .. +40 (offset/center level)
  flirAgcMode: 'linear' | 'plateau' | 'manual';
  flirHistogramEq: boolean;
}

export type HardwareDevice = 'orin_agx' | 'orin_nano' | 'rpi5_hailo' | 'rpi5_cpu';
export type QuantizationPrecision = 'FP32' | 'FP16' | 'INT8';

export interface HardwareSpec {
  id: HardwareDevice;
  name: string;
  vendor: string;
  computeArchitecture: string;
  tops: number;
  tdpWatts: number;
  maxMemoryMb: number;
  defaultPowerMode: string;
  dlaEngines: number;
}

export interface EdgeBenchmarkMetrics {
  device: HardwareDevice;
  precision: QuantizationPrecision;
  model: string;
  fps: number;
  latencyMs: number;
  p99LatencyMs: number;
  powerWatts: number;
  memoryMb: number;
  gpuUtilization: number;
  dlaUtilization: number;
  temperatureC: number;
  map50_95: number;
}

export interface EdgeHardwareHealth {
  device: HardwareDevice;
  gpuTempC: number;
  cpuTempC: number;
  powerWatts: number;
  maxPowerWatts: number;
  cpuUtilPercent: number;
  gpuUtilPercent: number;
  dlaUtilPercent: number;
  fanRpm: number;
  throttleStatus: 'NOMINAL' | 'WARNING' | 'THROTTLED';
  powerMode: string;
  voltageV: number;
  currentA: number;
}

export interface OpticalFlowPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  confidence: number;
  isLandmark: boolean;
}

export interface DeadReckoningTelemetry {
  gpsStatus: 'JAMMED' | 'SPOOFED' | 'DENIED' | 'SYNTHETIC_FIX';
  jammingSignalStrengthDbm: number;
  accumulatedDriftMeters: number;
  driftRateMetersPerMin: number;
  estimatedPosition: { lat: number; lon: number };
  spoofedPosition: { lat: number; lon: number };
  visualOdometryConfidence: number;
  activeLandmarkAnchors: number;
  headingDeg: number;
  speedKnots: number;
  odometryHistory: Array<{ x: number; y: number; timestamp: number; type: 'vo' | 'spoofed_gps' }>;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  domain: OperationalDomain;
  environment: string;
  description: string;
  recommendedSpectrum: SensorSpectrum;
  defaultDegradation: Partial<DegradationSettings>;
  targets: Array<{
    class: string;
    category: 'vessel' | 'aircraft' | 'beacon';
    initialX: number;
    initialY: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    thermalSignature: number;
    rangeMeters: number;
  }>;
}

/**
 * GNSS-Denied Visual Odometry & Dead-Reckoning Navigation Engine
 * Estimates ego-vehicle trajectory through optical flow vectors and landmark anchoring
 * when GPS/Galileo signals are jammed or spoofed by Electronic Warfare (EW).
 */

import { DeadReckoningTelemetry, OpticalFlowPoint, Point } from '../types/tactical';

export class DeadReckoningEngine {
  private initialLat: number = 26.5412; // Strait of Hormuz coastal corridor
  private initialLon: number = 56.4198;
  private currentLat: number = 26.5412;
  private currentLon: number = 56.4198;

  // Spoofed GPS coordinates deliberately deviating toward shoals
  private spoofedLat: number = 26.5412;
  private spoofedLon: number = 56.4198;

  private headingDeg: number = 74.2;
  private speedKnots: number = 22.4;
  private accumulatedDriftMeters: number = 0;
  private totalDistanceTravelledMeters: number = 0;

  private history: Array<{ x: number; y: number; timestamp: number; type: 'vo' | 'spoofed_gps' }> = [];
  private opticalPoints: OpticalFlowPoint[] = [];

  constructor() {
    this.initOpticalPoints();
    this.history.push({ x: 0, y: 0, timestamp: Date.now(), type: 'vo' });
    this.history.push({ x: 0, y: 0, timestamp: Date.now(), type: 'spoofed_gps' });
  }

  private initOpticalPoints(): void {
    // Generate simulated optical flow feature points across littoral / aerial background
    this.opticalPoints = [];
    for (let i = 0; i < 28; i++) {
      this.opticalPoints.push({
        x: 40 + Math.random() * 880,
        y: 120 + Math.random() * 300,
        vx: -1.2 + (Math.random() - 0.5) * 0.4,
        vy: 0.1 + (Math.random() - 0.5) * 0.2,
        confidence: 0.75 + Math.random() * 0.24,
        isLandmark: i % 5 === 0, // 20% are fixed geological / coastal landmarks
      });
    }
  }

  /**
   * Update visual odometry per frame with optical flow delta
   */
  public step(dt: number = 0.05, sensorJitter: number = 0): DeadReckoningTelemetry {
    // 1. Ego-motion calculation from optical flow
    // Distance in meters travelled in this time step
    const speedMps = this.speedKnots * 0.514444;
    const deltaDistance = speedMps * dt;
    this.totalDistanceTravelledMeters += deltaDistance;

    // Small heading oscillation (yaw rate)
    const yawRate = (Math.sin(Date.now() / 4000) * 0.6);
    this.headingDeg = (this.headingDeg + yawRate * dt + 360) % 360;

    // Displacement in local nautical frame
    const headingRad = (this.headingDeg * Math.PI) / 180;
    const dxMeters = Math.sin(headingRad) * deltaDistance;
    const dyMeters = Math.cos(headingRad) * deltaDistance;

    // Convert meters to lat/lon offsets (approx 111,111m per degree lat)
    const dLat = dyMeters / 111111;
    const dLon = dxMeters / (111111 * Math.cos((this.currentLat * Math.PI) / 180));

    this.currentLat += dLat;
    this.currentLon += dLon;

    // 2. Uncorrected drift accumulation under pure dead reckoning (approx 0.7% of distance travelled)
    // Optical landmark anchoring curbs drift to under 0.15%
    const uncurbedDriftRate = 0.007; // 0.7%
    const landmarkDampening = 0.22; // 78% reduction via feature anchors
    this.accumulatedDriftMeters += deltaDistance * uncurbedDriftRate * landmarkDampening;

    // 3. Spoofed GPS vector (adversary EW transmitter injects gradual deviation north-west)
    const spoofDriftMps = 1.4; // 1.4 m/s false drift
    const spoofDx = -Math.cos(Date.now() / 8000) * spoofDriftMps * dt;
    const spoofDy = Math.sin(Date.now() / 8000) * spoofDriftMps * dt;
    this.spoofedLat += dLat + spoofDy / 111111;
    this.spoofedLon += dLon + spoofDx / (111111 * Math.cos((this.currentLat * Math.PI) / 180));

    // 4. Update optical flow vectors (simulating background motion)
    for (const pt of this.opticalPoints) {
      pt.x += pt.vx * (speedMps / 10);
      pt.y += pt.vy * (speedMps / 10);

      // Wrap around edges
      if (pt.x < 20) pt.x = 940;
      if (pt.x > 940) pt.x = 20;
      if (pt.y < 120) pt.y = 420;
      if (pt.y > 420) pt.y = 120;
    }

    // 5. Append trajectory point
    const lastPoint = this.history[this.history.length - 2];
    const mapScale = 0.08; // pixels per meter
    const localX = (this.currentLon - this.initialLon) * 111111 * Math.cos((this.initialLat * Math.PI) / 180) * mapScale;
    const localY = -(this.currentLat - this.initialLat) * 111111 * mapScale;

    const spoofX = (this.spoofedLon - this.initialLon) * 111111 * Math.cos((this.initialLat * Math.PI) / 180) * mapScale;
    const spoofY = -(this.spoofedLat - this.initialLat) * 111111 * mapScale;

    if (!lastPoint || Math.hypot(localX - lastPoint.x, localY - lastPoint.y) > 2) {
      this.history.push({ x: localX, y: localY, timestamp: Date.now(), type: 'vo' });
      this.history.push({ x: spoofX, y: spoofY, timestamp: Date.now(), type: 'spoofed_gps' });
      if (this.history.length > 200) {
        this.history.splice(0, 2);
      }
    }

    return {
      gpsStatus: 'JAMMED',
      jammingSignalStrengthDbm: -68.4, // Heavy barrage noise
      accumulatedDriftMeters: parseFloat(this.accumulatedDriftMeters.toFixed(1)),
      driftRateMetersPerMin: parseFloat(((this.speedKnots * 0.514444 * 60) * 0.007 * landmarkDampening).toFixed(2)),
      estimatedPosition: {
        lat: parseFloat(this.currentLat.toFixed(5)),
        lon: parseFloat(this.currentLon.toFixed(5)),
      },
      spoofedPosition: {
        lat: parseFloat(this.spoofedLat.toFixed(5)),
        lon: parseFloat(this.spoofedLon.toFixed(5)),
      },
      visualOdometryConfidence: Math.max(0.72, Math.min(0.98, 0.94 - sensorJitter * 0.02)),
      activeLandmarkAnchors: this.opticalPoints.filter(p => p.isLandmark).length,
      headingDeg: Math.round(this.headingDeg),
      speedKnots: parseFloat(this.speedKnots.toFixed(1)),
      odometryHistory: this.history,
    };
  }

  public getOpticalFlowPoints(): OpticalFlowPoint[] {
    return this.opticalPoints;
  }
}

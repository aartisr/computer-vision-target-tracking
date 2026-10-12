/**
 * 8-State Extended/Linear Kalman Filter for 2D Multi-Object Tracking (ByteTrack / SORT)
 * State: [cx, cy, a, h, vx, vy, va, vh]^T
 *   cx, cy: Bounding box center coordinates
 *   a: Aspect ratio (w / h)
 *   h: Bounding box height
 *   vx, vy, va, vh: Respective velocities
 */

import { BoundingBox } from '../types/tactical';

export class KalmanBoxTracker {
  // State vector: 8x1
  public x: number[];
  // Covariance matrix: 8x8 flattened
  public P: number[][];
  // Filter age in frames
  public age: number;
  public timeSinceUpdate: number;
  public id: number;

  private static count = 0;

  constructor(bbox: BoundingBox, id?: number) {
    this.id = id !== undefined ? id : ++KalmanBoxTracker.count;
    this.age = 0;
    this.timeSinceUpdate = 0;

    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const a = Math.max(0.1, bbox.w / Math.max(1, bbox.h));
    const h = bbox.h;

    // Initial state: [cx, cy, a, h, vx, vy, va, vh]
    this.x = [cx, cy, a, h, 0, 0, 0, 0];

    // Initial covariance P (8x8)
    this.P = Array.from({ length: 8 }, () => Array(8).fill(0));
    // Standard deviations for position and velocity uncertainty
    const stdPos = 2 * (1 / 20) * h;
    const stdVel = 10 * (1 / 160) * h;

    this.P[0][0] = stdPos * stdPos;
    this.P[1][1] = stdPos * stdPos;
    this.P[2][2] = 1e-2;
    this.P[3][3] = stdPos * stdPos;
    this.P[4][4] = stdVel * stdVel;
    this.P[5][5] = stdVel * stdVel;
    this.P[6][6] = 1e-5;
    this.P[7][7] = stdVel * stdVel;
  }

  /**
   * Predict next bounding box state using kinematic motion model
   * F = [ I_4   dt * I_4 ]
   *     [ 0     I_4      ]
   */
  public predict(dt: number = 1.0): BoundingBox {
    // Process noise std dev
    const h = this.x[3];
    const stdP = (1 / 20) * h;
    const stdV = (1 / 160) * h;

    // State transition x = F * x
    this.x[0] += this.x[4] * dt;
    this.x[1] += this.x[5] * dt;
    this.x[2] += this.x[6] * dt;
    this.x[3] += this.x[7] * dt;

    // Process noise matrix Q (diagonal approximation)
    const Q = [
      (stdP * dt) ** 2,
      (stdP * dt) ** 2,
      1e-4,
      (stdP * dt) ** 2,
      (stdV * dt) ** 2,
      (stdV * dt) ** 2,
      1e-6,
      (stdV * dt) ** 2,
    ];

    // Propagate covariance: P = F * P * F^T + Q
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        this.P[i][j] += (this.P[i + 4][j] + this.P[i][j + 4]) * dt + this.P[i + 4][j + 4] * dt * dt;
        this.P[i][j + 4] += this.P[i + 4][j + 4] * dt;
        this.P[i + 4][j] += this.P[i + 4][j + 4] * dt;
      }
    }
    for (let i = 0; i < 8; i++) {
      this.P[i][i] += Q[i];
    }

    this.age += 1;
    this.timeSinceUpdate += 1;

    return this.getStateBoundingBox();
  }

  /**
   * Update state vector using new sensor measurement (bounding box)
   * Dynamically adjusts measurement noise covariance R when jitter compensation is active
   */
  public update(
    bbox: BoundingBox,
    jitterRms: number = 0,
    enableJitterCompensation: boolean = false
  ): void {
    this.timeSinceUpdate = 0;

    const zCx = bbox.x + bbox.w / 2;
    const zCy = bbox.y + bbox.h / 2;
    const zA = Math.max(0.1, bbox.w / Math.max(1, bbox.h));
    const zH = bbox.h;
    const z = [zCx, zCy, zA, zH];

    // Baseline measurement noise std dev
    const stdR = (1 / 20) * zH;

    // Dynamic jitter compensation: Inflate position measurement noise covariance R
    // to prevent over-correcting and drifting on high-frequency camera vibration
    let jitterVariance = 0;
    if (enableJitterCompensation && jitterRms > 0) {
      jitterVariance = Math.pow(jitterRms * 1.8, 2);
    }

    const R = [
      stdR * stdR + jitterVariance,
      stdR * stdR + jitterVariance,
      1e-2,
      stdR * stdR + jitterVariance * 0.2,
    ];

    // Measurement residual y = z - H * x (H is top-left 4x4 identity)
    const y = [
      z[0] - this.x[0],
      z[1] - this.x[1],
      z[2] - this.x[2],
      z[3] - this.x[3],
    ];

    // S = H * P * H^T + R
    const S = [
      this.P[0][0] + R[0],
      this.P[1][1] + R[1],
      this.P[2][2] + R[2],
      this.P[3][3] + R[3],
    ];

    // Kalman gain K = P * H^T * inv(S) (simplified diagonal S for numerical stability)
    const K: number[][] = Array.from({ length: 8 }, () => Array(4).fill(0));
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 4; j++) {
        K[i][j] = this.P[i][j] / Math.max(1e-6, S[j]);
      }
    }

    // State update: x = x + K * y
    for (let i = 0; i < 8; i++) {
      let delta = 0;
      for (let j = 0; j < 4; j++) {
        delta += K[i][j] * y[j];
      }
      this.x[i] += delta;
    }

    // Covariance update: P = (I - K * H) * P
    const newP: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        let khP = 0;
        for (let k = 0; k < 4; k++) {
          khP += K[i][k] * this.P[k][j];
        }
        newP[i][j] = this.P[i][j] - khP;
      }
    }
    this.P = newP;
  }

  /**
   * Convert current filter state [cx, cy, a, h] to [x, y, w, h] bounding box
   */
  public getStateBoundingBox(): BoundingBox {
    const cx = this.x[0];
    const cy = this.x[1];
    const a = Math.max(0.1, this.x[2]);
    const h = Math.max(2, this.x[3]);
    const w = Math.max(2, a * h);

    return {
      x: cx - w / 2,
      y: cy - h / 2,
      w,
      h,
    };
  }

  /**
   * Compute 2D position covariance magnitude and uncertainty ellipse radius
   */
  public getCovarianceRadius(): { rx: number; ry: number; totalVariance: number } {
    const varX = Math.max(1, this.P[0][0]);
    const varY = Math.max(1, this.P[1][1]);
    return {
      rx: Math.min(60, Math.sqrt(varX) * 2), // 2-sigma boundary
      ry: Math.min(60, Math.sqrt(varY) * 2),
      totalVariance: Math.sqrt(varX + varY),
    };
  }

  /**
   * Estimated instantaneous velocity vector [vx, vy]
   */
  public getVelocity(): [number, number] {
    return [this.x[4], this.x[5]];
  }
}

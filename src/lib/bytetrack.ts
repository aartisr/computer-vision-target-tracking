/**
 * ByteTrack: Multi-Object Tracking by Associating Every Detection Box
 * Implements two-stage data association with Kalman Filter motion prediction.
 */

import { BoundingBox, Detection, Tracklet } from '../types/tactical';
import { KalmanBoxTracker } from './kalman';

export interface ByteTrackConfig {
  trackHighThresh: number; // Threshold for high score detections (default 0.6)
  trackLowThresh: number;  // Threshold for low score detections (default 0.2)
  matchThreshStage1: number; // IoU threshold for stage 1 (default 0.7)
  matchThreshStage2: number; // IoU threshold for stage 2 (default 0.5)
  maxLostFrames: number;   // Frames before lost track is deleted (default 30)
  minConfirmedFrames: number; // Frames needed to confirm tentative track (default 3)
}

const DEFAULT_CONFIG: ByteTrackConfig = {
  trackHighThresh: 0.55,
  trackLowThresh: 0.18,
  matchThreshStage1: 0.35,
  matchThreshStage2: 0.25,
  maxLostFrames: 30,
  minConfirmedFrames: 3,
};

/**
 * Compute Intersection-Over-Union between two bounding boxes
 */
export function calculateIoU(boxA: BoundingBox, boxB: BoundingBox): number {
  const x1 = Math.max(boxA.x, boxB.x);
  const y1 = Math.max(boxA.y, boxB.y);
  const x2 = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
  const y2 = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

  const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersectionArea <= 0) return 0;

  const areaA = boxA.w * boxA.h;
  const areaB = boxB.w * boxB.h;
  const unionArea = areaA + areaB - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

export class ByteTracker {
  private config: ByteTrackConfig;
  private trackers: Map<number, KalmanBoxTracker> = new Map();
  private tracklets: Map<number, Tracklet> = new Map();
  private frameId: number = 0;
  public totalIdSwitches: number = 0;
  public totalDetectionsProcessed: number = 0;

  constructor(config: Partial<ByteTrackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public reset(): void {
    this.trackers.clear();
    this.tracklets.clear();
    this.frameId = 0;
    this.totalIdSwitches = 0;
    this.totalDetectionsProcessed = 0;
  }

  /**
   * Primary tracking update loop called per frame
   * Accepts dynamic jitter parameters to scale Kalman measurement noise covariance
   */
  public update(
    detections: Detection[],
    timestamp: number = Date.now(),
    jitterRms: number = 0,
    enableJitterCompensation: boolean = false
  ): Tracklet[] {
    this.frameId++;
    this.totalDetectionsProcessed += detections.length;

    // 1. Separate detections into high-confidence and low-confidence pools
    const detHigh: Detection[] = [];
    const detLow: Detection[] = [];

    for (const det of detections) {
      if (det.score >= this.config.trackHighThresh) {
        detHigh.push(det);
      } else if (det.score >= this.config.trackLowThresh) {
        detLow.push(det);
      }
    }

    // 2. Predict new states for all active Kalman trackers
    const activeTrackIds = Array.from(this.tracklets.keys());
    const predictedBoxes: Map<number, BoundingBox> = new Map();

    for (const id of activeTrackIds) {
      const tracker = this.trackers.get(id);
      if (tracker) {
        const predBox = tracker.predict();
        predictedBoxes.set(id, predBox);
        const tracklet = this.tracklets.get(id)!;
        tracklet.predictedBbox = predBox;
      }
    }

    // 3. First Association: Match High-Confidence Detections with Active Tracks
    const confirmedTrackIds = activeTrackIds.filter(
      id => this.tracklets.get(id)?.state !== 'lost'
    );
    const lostTrackIds = activeTrackIds.filter(
      id => this.tracklets.get(id)?.state === 'lost'
    );

    const {
      matches: matches1,
      unmatchedTracks: unmatchedTracks1,
      unmatchedDets: unmatchedDetsHigh,
    } = this.associate(confirmedTrackIds, detHigh, predictedBoxes, this.config.matchThreshStage1);

    // Apply Stage 1 matches
    for (const [trackId, detIdx] of matches1) {
      const det = detHigh[detIdx];
      this.updateTrack(trackId, det, timestamp, jitterRms, enableJitterCompensation);
    }

    // 4. Second Association: Match Low-Confidence Detections with Unmatched Tracks from Stage 1
    const {
      matches: matches2,
      unmatchedTracks: unmatchedTracks2,
    } = this.associate(unmatchedTracks1, detLow, predictedBoxes, this.config.matchThreshStage2);

    // Apply Stage 2 matches (crucial for fog/spray/occlusion recovery)
    for (const [trackId, detIdx] of matches2) {
      const det = detLow[detIdx];
      this.updateTrack(trackId, det, timestamp, jitterRms, enableJitterCompensation);
    }

    // 5. Handle remaining unmatched tracks -> mark lost or remove
    for (const trackId of unmatchedTracks2) {
      const tracklet = this.tracklets.get(trackId);
      if (!tracklet) continue;

      tracklet.lostFrames++;
      if (tracklet.lostFrames > this.config.maxLostFrames) {
        // Purge expired track
        this.tracklets.delete(trackId);
        this.trackers.delete(trackId);
      } else {
        tracklet.state = 'lost';
        // Advance position using Kalman velocity extrapolation
        if (tracklet.predictedBbox) {
          tracklet.bbox = tracklet.predictedBbox;
        }
      }
    }

    // 6. Handle lost tracks recovery with remaining unmatched high detections
    if (lostTrackIds.length > 0 && unmatchedDetsHigh.length > 0) {
      const remainingHighDets = unmatchedDetsHigh.map(i => detHigh[i]);
      const {
        matches: matchesLost,
        unmatchedDets: finalUnmatchedHigh,
      } = this.associate(lostTrackIds, remainingHighDets, predictedBoxes, this.config.matchThreshStage2);

      for (const [trackId, detSubIdx] of matchesLost) {
        const det = remainingHighDets[detSubIdx];
        this.updateTrack(trackId, det, timestamp, jitterRms, enableJitterCompensation);
      }

      // Initialize new tracks for remaining high detections
      for (const detSubIdx of finalUnmatchedHigh) {
        const det = remainingHighDets[detSubIdx];
        this.initTrack(det, timestamp);
      }
    } else {
      // Initialize new tracks for all unmatched high detections
      for (const detIdx of unmatchedDetsHigh) {
        const det = detHigh[detIdx];
        this.initTrack(det, timestamp);
      }
    }

    return Array.from(this.tracklets.values());
  }

  /**
   * Greedy bipartite association between track IDs and detection array
   */
  private associate(
    trackIds: number[],
    dets: Detection[],
    predictedBoxes: Map<number, BoundingBox>,
    iouThresh: number
  ): {
    matches: Array<[number, number]>;
    unmatchedTracks: number[];
    unmatchedDets: number[];
  } {
    const matches: Array<[number, number]> = [];
    const matchedTrackSet = new Set<number>();
    const matchedDetSet = new Set<number>();

    // Build cost / IoU matrix
    const iouPairs: Array<{ trackId: number; detIdx: number; iou: number }> = [];

    for (let t = 0; t < trackIds.length; t++) {
      const trackId = trackIds[t];
      const trackBox = predictedBoxes.get(trackId);
      if (!trackBox) continue;

      for (let d = 0; d < dets.length; d++) {
        const iou = calculateIoU(trackBox, dets[d].bbox);
        if (iou >= iouThresh) {
          iouPairs.push({ trackId, detIdx: d, iou });
        }
      }
    }

    // Sort descending by IoU
    iouPairs.sort((a, b) => b.iou - a.iou);

    for (const pair of iouPairs) {
      if (!matchedTrackSet.has(pair.trackId) && !matchedDetSet.has(pair.detIdx)) {
        matches.push([pair.trackId, pair.detIdx]);
        matchedTrackSet.add(pair.trackId);
        matchedDetSet.add(pair.detIdx);
      }
    }

    const unmatchedTracks = trackIds.filter(id => !matchedTrackSet.has(id));
    const unmatchedDets = dets
      .map((_, idx) => idx)
      .filter(idx => !matchedDetSet.has(idx));

    return { matches, unmatchedTracks, unmatchedDets };
  }

  private updateTrack(
    trackId: number,
    det: Detection,
    timestamp: number,
    jitterRms: number = 0,
    enableJitterCompensation: boolean = false
  ): void {
    const tracker = this.trackers.get(trackId);
    const tracklet = this.tracklets.get(trackId);
    if (!tracker || !tracklet) return;

    // Kalman update with new measurement and dynamic jitter noise covariance adjustment
    tracker.update(det.bbox, jitterRms, enableJitterCompensation);
    const updatedBox = tracker.getStateBoundingBox();
    const vel = tracker.getVelocity();
    const { totalVariance } = tracker.getCovarianceRadius();

    tracklet.bbox = updatedBox;
    tracklet.velocity = vel;
    tracklet.confidence = det.score;
    tracklet.thermalSignature = det.thermalSignature;
    tracklet.lostFrames = 0;
    tracklet.confirmedFrames++;

    if (tracklet.confirmedFrames >= this.config.minConfirmedFrames) {
      tracklet.state = 'confirmed';
    }

    tracklet.covariance = totalVariance;

    // Update kinematic properties (speed, heading, range, TCPA)
    const pxSpeed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1]);
    tracklet.speedKnots = parseFloat((pxSpeed * 0.45).toFixed(1));
    tracklet.headingDeg = Math.round(((Math.atan2(vel[1], vel[0]) * 180) / Math.PI + 360) % 360);

    // Approximate range in meters based on box height and perspective horizon
    const horizonY = 280;
    const dy = Math.max(10, tracklet.bbox.y + tracklet.bbox.h - horizonY);
    tracklet.rangeMeters = Math.max(150, Math.round(18000 / dy));

    // Approximate bearing relative to optical boresight (-35° to +35°)
    const screenCenter = 480;
    const contactCenter = tracklet.bbox.x + tracklet.bbox.w / 2;
    tracklet.bearingDeg = parseFloat((((contactCenter - screenCenter) / screenCenter) * 35).toFixed(1));

    // TCPA: Time to Closest Point of Approach in seconds
    const approachRate = -vel[1] * 2.5; // heading toward camera
    tracklet.tcpaSeconds = approachRate > 0.5 ? Math.round(tracklet.rangeMeters / approachRate) : 999;

    // Append to trajectory history (cap at 40 points)
    tracklet.history.push({
      x: updatedBox.x + updatedBox.w / 2,
      y: updatedBox.y + updatedBox.h / 2,
      time: timestamp,
    });
    if (tracklet.history.length > 40) {
      tracklet.history.shift();
    }
  }

  private initTrack(det: Detection, timestamp: number): void {
    const tracker = new KalmanBoxTracker(det.bbox);
    const trackId = tracker.id;

    const vel = tracker.getVelocity();
    const pxSpeed = Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1]);

    const tracklet: Tracklet = {
      id: trackId,
      class: det.class,
      category: det.category,
      bbox: det.bbox,
      velocity: vel,
      speedKnots: parseFloat((pxSpeed * 0.45).toFixed(1)),
      headingDeg: 90,
      rangeMeters: 1200,
      bearingDeg: 0,
      confidence: det.score,
      state: 'tentative',
      history: [{
        x: det.bbox.x + det.bbox.w / 2,
        y: det.bbox.y + det.bbox.h / 2,
        time: timestamp,
      }],
      lostFrames: 0,
      confirmedFrames: 1,
      covariance: 15,
      thermalSignature: det.thermalSignature,
      tcpaSeconds: 420,
      locked: false,
    };

    this.trackers.set(trackId, tracker);
    this.tracklets.set(trackId, tracklet);
  }

  public setTrackLocked(trackId: number, locked: boolean): void {
    const tracklet = this.tracklets.get(trackId);
    if (tracklet) {
      tracklet.locked = locked;
    }
  }
}

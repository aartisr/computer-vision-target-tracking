import React from 'react';
import { Tracklet } from '../types/tactical';
import { X, Crosshair, Shield, Activity, Compass, Gauge, AlertTriangle } from 'lucide-react';

interface TargetDetailModalProps {
  tracklet: Tracklet | null;
  onClose: () => void;
  onToggleLock: (id: number) => void;
}

export const TargetDetailModal: React.FC<TargetDetailModalProps> = ({
  tracklet,
  onClose,
  onToggleLock,
}) => {
  if (!tracklet) return null;

  // Intercept calculations
  const tcpaFormatted =
    tracklet.tcpaSeconds < 999
      ? `${Math.floor(tracklet.tcpaSeconds / 60)}m ${tracklet.tcpaSeconds % 60}s`
      : 'COASTING';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-[#090e1b] border border-cyan-500/40 rounded-lg shadow-2xl overflow-hidden font-sans text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0c1322] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Crosshair className="w-4 h-4 text-rose-400" />
            <h3 className="font-bold text-slate-100 uppercase tracking-wider text-xs font-mono">
              TACTICAL CONTACT DOSSIER // TRK-{String(tracklet.id).padStart(3, '0')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto font-mono text-xs">
          {/* Classification & Threat Banner */}
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">
                Vessel Identification & Class
              </div>
              <div className="text-base font-bold text-white font-sans mt-0.5">
                {tracklet.class}
              </div>
              <div className="text-[11px] text-cyan-400 mt-0.5">
                Domain Category: {tracklet.category.toUpperCase()} · Status: {tracklet.state.toUpperCase()}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-400">DETECTION CONFIDENCE</div>
              <div className="text-xl font-bold text-emerald-400">
                {Math.round(tracklet.confidence * 100)}%
              </div>
            </div>
          </div>

          {/* Kinematic State & EKF Vectors */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Gauge className="w-3 h-3 text-cyan-400" /> SPEED
              </div>
              <div className="text-lg font-bold text-white mt-1 tabular-nums">
                {tracklet.speedKnots} kts
              </div>
              <div className="text-[9px] text-slate-500">
                EKF: [{tracklet.velocity[0].toFixed(1)}, {tracklet.velocity[1].toFixed(1)}] px/s
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Compass className="w-3 h-3 text-amber-400" /> HEADING
              </div>
              <div className="text-lg font-bold text-white mt-1 tabular-nums">
                {tracklet.headingDeg}°
              </div>
              <div className="text-[9px] text-slate-500">True Course</div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" /> RANGE
              </div>
              <div className="text-lg font-bold text-white mt-1 tabular-nums">
                {tracklet.rangeMeters} m
              </div>
              <div className="text-[9px] text-slate-500">
                Bearing: {tracklet.bearingDeg > 0 ? `+${tracklet.bearingDeg}°` : `${tracklet.bearingDeg}°`}
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-slate-800 rounded">
              <div className="text-[10px] text-slate-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-400" /> TCPA
              </div>
              <div className="text-lg font-bold text-rose-400 mt-1 tabular-nums">
                {tcpaFormatted}
              </div>
              <div className="text-[9px] text-slate-500">Intercept Window</div>
            </div>
          </div>

          {/* Kalman Filter State Covariance Inspector */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-slate-300 text-[11px] font-bold mb-2">
              <span>8-STATE EXTENDED KALMAN FILTER (EKF) MATRIX</span>
              <span className="text-amber-400 text-[10px]">
                COVARIANCE TRACE: {tracklet.covariance.toFixed(2)}σ
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px] text-slate-400">
              <div>
                <span className="text-slate-500">Bounding Box State:</span>
                <div className="text-white mt-0.5">
                  X: {Math.round(tracklet.bbox.x)}px · Y: {Math.round(tracklet.bbox.y)}px
                </div>
                <div className="text-white">
                  W: {Math.round(tracklet.bbox.w)}px · H: {Math.round(tracklet.bbox.h)}px
                </div>
              </div>

              <div>
                <span className="text-slate-500">Thermal IR Contrast:</span>
                <div className="text-white mt-0.5">
                  LWIR Signature: {Math.round(tracklet.thermalSignature * 100)}% Contrast
                </div>
                <div className="text-slate-300">
                  Track Continuity: {tracklet.confirmedFrames} confirmed frames
                </div>
              </div>
            </div>
          </div>

          {/* Tactical Recommendations */}
          <div className="p-3 bg-cyan-950/20 border border-cyan-900/40 rounded-lg text-slate-300 font-sans text-xs">
            <span className="font-bold text-cyan-300">Autonomous Intercept Recommendation:</span>
            <p className="mt-1 text-slate-400">
              Maintain optical lock using ByteTrack two-stage data association. In the event of dense fog or thermal occlusion, Kalman Filter state propagation will sustain track ID continuity for up to 30 frames without requiring GNSS telemetry.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#0c1322] border-t border-slate-800">
          <button
            onClick={() => onToggleLock(tracklet.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              tracklet.locked
                ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30'
            }`}
          >
            {tracklet.locked ? 'Release Target Lock' : 'Designate & Lock Target'}
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};

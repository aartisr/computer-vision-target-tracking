import React, { useRef, useEffect } from 'react';
import { DeadReckoningTelemetry } from '../types/tactical';
import { Navigation, ShieldAlert, Radio, Compass, RefreshCw, Anchor, CheckCircle2 } from 'lucide-react';

interface DeadReckoningPanelProps {
  telemetry: DeadReckoningTelemetry;
  onResetOdometry: () => void;
}

export const DeadReckoningPanel: React.FC<DeadReckoningPanelProps> = ({
  telemetry,
  onResetOdometry,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render tactical dead-reckoning mini-map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background tactical grid
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, w, h);

    // Subtle nautical grid lines
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 35) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Range rings from center
    const cx = w * 0.45;
    const cy = h * 0.55;

    ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
    [40, 80, 120, 160].forEach(r => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 1. Draw Spoofed GPS false trajectory (Rose/Red dashed line)
    const spoofPoints = telemetry.odometryHistory.filter(p => p.type === 'spoofed_gps');
    if (spoofPoints.length > 1) {
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      spoofPoints.forEach((pt, idx) => {
        const px = cx + pt.x * 0.8;
        const py = cy + pt.y * 0.8;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Current spoofed false fix
      const lastSpoof = spoofPoints[spoofPoints.length - 1];
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(cx + lastSpoof.x * 0.8, cy + lastSpoof.y * 0.8, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Draw Visual Odometry True Dead-Reckoning Trajectory (Cyan solid line)
    const voPoints = telemetry.odometryHistory.filter(p => p.type === 'vo');
    if (voPoints.length > 1) {
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      voPoints.forEach((pt, idx) => {
        const px = cx + pt.x * 0.8;
        const py = cy + pt.y * 0.8;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Current estimated ego vehicle position
      const lastVo = voPoints[voPoints.length - 1];
      const curX = cx + lastVo.x * 0.8;
      const curY = cy + lastVo.y * 0.8;

      // Heading arrow
      ctx.save();
      ctx.translate(curX, curY);
      ctx.rotate(((telemetry.headingDeg - 90) * Math.PI) / 180);

      ctx.fillStyle = '#0ea5e9';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fill();

      // Uncertainty circle
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(12, telemetry.accumulatedDriftMeters * 0.2), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // Map Legend on Canvas
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#0ea5e9';
    ctx.fillText('— Visual Odometry (Ground Truth)', 16, 22);

    ctx.fillStyle = '#f43f5e';
    ctx.fillText('- - Spoofed GPS Signal (EW Jammed)', 16, 36);
  }, [telemetry]);

  return (
    <div className="flex flex-col h-full bg-[#090e1b] border border-slate-800 rounded-lg text-slate-200 text-xs overflow-hidden">
      {/* Top Banner */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0c1222]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-slate-100 uppercase tracking-wider text-xs">
              GNSS-Denied Visual Odometry & Optical Dead Reckoning
            </h3>
          </div>
          <button
            onClick={onResetOdometry}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Recalibrate Fix</span>
          </button>
        </div>

        {/* Electronic Warfare Alert Strip */}
        <div className="flex items-center justify-between p-2.5 bg-rose-950/30 border border-rose-900/60 rounded text-[11px] font-mono text-rose-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              STATUS: <strong>GPS JAMMED & SPOOFED</strong> (Signal {telemetry.jammingSignalStrengthDbm} dBm)
            </span>
          </div>
          <span className="text-[10px] bg-rose-900/50 px-2 py-0.5 rounded text-rose-200 font-bold">
            FAILOVER TO OPTICAL DEAD RECKONING
          </span>
        </div>
      </div>

      {/* Main Content Split: Vector Map & Telemetry Dashboard */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Vector Map Canvas */}
        <div className="relative w-full h-[260px] bg-slate-950 rounded-lg border border-slate-800 overflow-hidden shadow-inner">
          <canvas ref={canvasRef} width={640} height={260} className="w-full h-full object-cover" />
          <div className="absolute bottom-2 right-2 text-[10px] font-mono text-slate-400 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
            SCALE: 1:25,000 NM
          </div>
        </div>

        {/* Navigation Coordinates Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Optical Dead Reckoning Coordinates */}
          <div className="p-3 bg-cyan-950/20 border border-cyan-900/50 rounded-lg font-mono">
            <div className="flex items-center justify-between text-cyan-400 text-[11px] font-bold mb-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Optical Odometry Fix (Verified)
              </span>
              <span className="text-[10px] text-emerald-400">DRIFT COMPENSATED</span>
            </div>
            <div className="space-y-1 text-slate-300 text-xs">
              <div className="flex justify-between">
                <span>EST LAT:</span>
                <span className="text-white font-bold">{telemetry.estimatedPosition.lat}° N</span>
              </div>
              <div className="flex justify-between">
                <span>EST LON:</span>
                <span className="text-white font-bold">{telemetry.estimatedPosition.lon}° E</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px] pt-1 border-t border-cyan-900/40">
                <span>ACCUMULATED DRIFT:</span>
                <span className="text-cyan-300">{telemetry.accumulatedDriftMeters} m</span>
              </div>
            </div>
          </div>

          {/* Spoofed GPS Receiver Coordinates */}
          <div className="p-3 bg-rose-950/20 border border-rose-900/50 rounded-lg font-mono">
            <div className="flex items-center justify-between text-rose-400 text-[11px] font-bold mb-2">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-rose-400" />
                Raw GPS Satellite Fix (Corrupted)
              </span>
              <span className="text-[10px] text-rose-400">SPOOFED BY EW</span>
            </div>
            <div className="space-y-1 text-slate-300 text-xs">
              <div className="flex justify-between">
                <span>SPOOF LAT:</span>
                <span className="text-rose-200 line-through">{telemetry.spoofedPosition.lat}° N</span>
              </div>
              <div className="flex justify-between">
                <span>SPOOF LON:</span>
                <span className="text-rose-200 line-through">{telemetry.spoofedPosition.lon}° E</span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px] pt-1 border-t border-rose-900/40">
                <span>SPOOF DIVERGENCE:</span>
                <span className="text-rose-400 font-bold">+184.2 m North-West</span>
              </div>
            </div>
          </div>
        </div>

        {/* Telemetry Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 font-mono text-center">
          <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded">
            <div className="text-[10px] text-slate-400">HEADING</div>
            <div className="text-lg font-bold text-white tabular-nums">{telemetry.headingDeg}°</div>
            <div className="text-[9px] text-slate-500">True Magnetic</div>
          </div>

          <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded">
            <div className="text-[10px] text-slate-400">GROUND SPEED</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums">{telemetry.speedKnots} kts</div>
            <div className="text-[9px] text-slate-500">Optic Flow Est.</div>
          </div>

          <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded">
            <div className="text-[10px] text-slate-400">LANDMARK ANCHORS</div>
            <div className="text-lg font-bold text-amber-300 tabular-nums">{telemetry.activeLandmarkAnchors} / 28</div>
            <div className="text-[9px] text-slate-500">Coastal Anchors</div>
          </div>

          <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded">
            <div className="text-[10px] text-slate-400">VO CONFIDENCE</div>
            <div className="text-lg font-bold text-cyan-300 tabular-nums">
              {Math.round(telemetry.visualOdometryConfidence * 100)}%
            </div>
            <div className="text-[9px] text-slate-500">RANSAC Inliers</div>
          </div>
        </div>
      </div>
    </div>
  );
};

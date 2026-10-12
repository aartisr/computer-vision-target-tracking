import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Crosshair } from 'lucide-react';
import {
  Tracklet,
  DegradationSettings,
  OpticalFlowPoint,
  Detection,
  ScenarioDefinition,
  HardwareDevice,
  QuantizationPrecision,
} from '../types/tactical';
import { calculateIoU } from '../lib/bytetrack';
import { HardwareHealthIndicator } from './HardwareHealthIndicator';

interface OpticalViewportProps {
  tracklets: Tracklet[];
  selectedTrackId: number | null;
  onSelectTrack: (id: number | null) => void;
  degradation: DegradationSettings;
  opticalFlowPoints: OpticalFlowPoint[];
  currentScenario: ScenarioDefinition;
  isStreaming: boolean;
  isWebcamActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onDetectionsGenerated?: (dets: Detection[]) => void;
  activeDevice?: HardwareDevice;
  onChangeDevice?: (device: HardwareDevice) => void;
  precision?: QuantizationPrecision;
  autoCenter?: boolean;
  onToggleAutoCenter?: () => void;
}

export const OpticalViewport: React.FC<OpticalViewportProps> = ({
  tracklets,
  selectedTrackId,
  onSelectTrack,
  degradation,
  opticalFlowPoints,
  currentScenario,
  isStreaming,
  isWebcamActive,
  videoRef,
  onDetectionsGenerated,
  activeDevice = 'orin_nano',
  onChangeDevice = () => {},
  precision = 'INT8',
  autoCenter = false,
  onToggleAutoCenter,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const simTimeRef = useRef<number>(0);
  const [fpsCounter, setFpsCounter] = useState<number>(60);
  const frameTimesRef = useRef<number[]>([]);

  // Slew-to-Cue Gimbal Camera Pan & Zoom Refs
  const panRef = useRef<{ x: number; y: number }>({ x: 480, y: 270 });
  const zoomRef = useRef<number>(1.0);
  const [zoomLevel, setZoomLevel] = useState<number>(2.0);

  // Internal simulated physical target positions that move smoothly
  const simTargetsRef = useRef<
    Array<{
      id: number;
      class: string;
      category: 'vessel' | 'aircraft' | 'beacon';
      x: number;
      y: number;
      w: number;
      h: number;
      vx: number;
      vy: number;
      thermalSignature: number;
      rangeMeters: number;
      score: number;
      occluded: boolean;
    }>
  >([]);

  // Re-seed targets whenever scenario changes
  useEffect(() => {
    simTargetsRef.current = currentScenario.targets.map((tgt, idx) => ({
      id: idx + 1,
      class: tgt.class,
      category: tgt.category,
      x: tgt.initialX,
      y: tgt.initialY,
      w: tgt.w,
      h: tgt.h,
      vx: tgt.vx,
      vy: tgt.vy,
      thermalSignature: tgt.thermalSignature,
      rangeMeters: tgt.rangeMeters,
      score: 0.92,
      occluded: false,
    }));
  }, [currentScenario.id]);

  // Main 60 FPS Render & Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTimestamp = performance.now();

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTimestamp) / 1000);
      lastTimestamp = now;

      // Track FPS
      frameTimesRef.current.push(now);
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift();
        const delta = now - frameTimesRef.current[0];
        if (delta > 0) {
          setFpsCounter(Math.round(((frameTimesRef.current.length - 1) * 1000) / delta));
        }
      }

      const width = canvas.width;
      const height = canvas.height;

      if (isStreaming) {
        simTimeRef.current += dt;
      }
      const t = simTimeRef.current;

      // Compute camera jitter offset
      let jitterX = 0;
      let jitterY = 0;
      if (degradation.jitterRms > 0) {
        jitterX = (Math.sin(t * 32.5) + Math.cos(t * 47.1)) * degradation.jitterRms * 0.7;
        jitterY = (Math.cos(t * 29.3) + Math.sin(t * 53.7)) * degradation.jitterRms * 0.7;
      }

      // --- TARGET AUTO-CENTER & GIMBAL SLEW INTERPOLATION ---
      const selectedTracklet = selectedTrackId ? tracklets.find(t => t.id === selectedTrackId) : null;
      let desiredZoom = 1.0;
      let desiredPanX = width / 2;
      let desiredPanY = height / 2;

      if (autoCenter && selectedTracklet) {
        desiredZoom = zoomLevel;
        desiredPanX = selectedTracklet.bbox.x + selectedTracklet.bbox.w / 2;
        desiredPanY = selectedTracklet.bbox.y + selectedTracklet.bbox.h / 2;

        // Catch canvas wrap-around jump so camera does not whip across frame
        if (Math.abs(desiredPanX - panRef.current.x) > width * 0.5) {
          panRef.current.x = desiredPanX;
        }
        if (Math.abs(desiredPanY - panRef.current.y) > height * 0.5) {
          panRef.current.y = desiredPanY;
        }
      }

      // Smooth gimbal camera tracking interpolation
      const lerpFactor = 1 - Math.exp(-dt * 6.5);
      panRef.current.x += (desiredPanX - panRef.current.x) * lerpFactor;
      panRef.current.y += (desiredPanY - panRef.current.y) * lerpFactor;
      zoomRef.current += (desiredZoom - zoomRef.current) * lerpFactor;

      const curZoom = zoomRef.current;
      const curPanX = panRef.current.x;
      const curPanY = panRef.current.y;

      ctx.save();
      ctx.translate(jitterX, jitterY);

      // Apply Slew-to-Cue Gimbal Pan & Zoom Transformation
      ctx.translate(width / 2, height / 2);
      ctx.scale(curZoom, curZoom);
      ctx.translate(-curPanX, -curPanY);

      // --- 1. RENDER BACKGROUND ---
      if (isWebcamActive && videoRef.current && videoRef.current.readyState >= 2) {
        // Draw real camera video feed
        ctx.drawImage(videoRef.current, 0, 0, width, height);
      } else {
        // Procedural Tactical Synthetic Scenery
        drawSyntheticBackground(ctx, width, height, t, degradation, currentScenario.domain);
      }

      // --- 2. UPDATE SIMULATED TARGETS & GENERATE DETECTIONS ---
      const detections: Detection[] = [];

      if (isStreaming) {
        for (const tgt of simTargetsRef.current) {
          // Move target
          tgt.x += tgt.vx * (dt * 30);
          tgt.y += tgt.vy * (dt * 30);

          // Wrap around canvas bounds
          if (tgt.x > width + 40) tgt.x = -60;
          if (tgt.x < -70) tgt.x = width + 30;
          if (tgt.y > height - 60) tgt.vy = -Math.abs(tgt.vy);
          if (tgt.y < 80) tgt.vy = Math.abs(tgt.vy);

          // Occlusion and score degradation based on fog, low-light, and haze
          const fogDrop = degradation.fogDensity * 0.45;
          const hazeDrop = degradation.marineHaze * 0.25;
          const luxNoise = degradation.luxLevel < 5 ? 0.3 : 0;
          
          // Thermal signatures penetrate fog much better than optical EO; enhanced by FLIR gain tuning
          const flirGainFactor = degradation.flirGain ? Math.min(1.8, degradation.flirGain * 0.8) : 1.0;
          const thermalBonus = degradation.spectrum.startsWith('flir')
            ? (tgt.thermalSignature * 0.35 * flirGainFactor)
            : 0;
          
          let effectiveScore = Math.max(0.12, Math.min(0.98, 0.94 - fogDrop - hazeDrop - luxNoise + thermalBonus));
          
          // Periodic intermittent optical occlusion (e.g. wave crest or fog bank passing)
          const wavePhase = Math.sin(t * 2 + tgt.id * 1.5);
          if (degradation.fogDensity > 0.5 && wavePhase > 0.82) {
            effectiveScore = 0.22; // Triggers ByteTrack Stage-2 association!
            tgt.occluded = true;
          } else {
            tgt.occluded = false;
          }
          tgt.score = effectiveScore;

          // Draw physical target on canvas before optical filters
          if (!isWebcamActive) {
            drawPhysicalTarget(ctx, tgt, t, degradation);
          }

          // High-frequency optical measurement perturbation induced by gimbal vibration
          const detJitterX = degradation.jitterRms > 0
            ? Math.sin(t * 43.1 + tgt.id * 1.9) * degradation.jitterRms * 0.75
            : 0;
          const detJitterY = degradation.jitterRms > 0
            ? Math.cos(t * 39.7 + tgt.id * 2.3) * degradation.jitterRms * 0.75
            : 0;

          detections.push({
            id: tgt.id,
            class: tgt.class,
            category: tgt.category,
            bbox: {
              x: tgt.x + detJitterX,
              y: tgt.y + detJitterY,
              w: tgt.w,
              h: tgt.h,
            },
            score: parseFloat(effectiveScore.toFixed(3)),
            thermalSignature: tgt.thermalSignature,
            actualVelocity: [tgt.vx * 30, tgt.vy * 30],
          });
        }

        if (onDetectionsGenerated) {
          onDetectionsGenerated(detections);
        }
      }

      // --- 3. APPLY SPECTRAL FILTERS & ENVIRONMENTAL DEGRADATION ---
      applySensorDegradationShaders(ctx, width, height, degradation, t);

      // --- 4. RENDER OPTICAL FLOW FEATURE VECTORS ---
      if (degradation.enableOpticalFlowOverlay && opticalFlowPoints.length > 0) {
        drawOpticalFlowOverlay(ctx, opticalFlowPoints);
      }

      // --- 5. RENDER BYTETRACK BOUNDING BOXES & KALMAN FORECASTS ---
      drawTrackletsOverlay(
        ctx,
        tracklets,
        selectedTrackId,
        degradation.enableKalmanVectorOverlay,
        degradation.enableCovarianceEllipse
      );

      ctx.restore();

      // --- 6. RENDER HUD HEADS-UP DISPLAY (Reticle, Boresight, Telemetry) in SCREEN SPACE ---
      if (degradation.enableHorizonHud) {
        ctx.save();
        ctx.translate(jitterX * 0.25, jitterY * 0.25);
        drawTacticalHud(
          ctx,
          width,
          height,
          t,
          fpsCounter,
          degradation,
          autoCenter,
          selectedTracklet,
          curZoom
        );
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [
    isStreaming,
    degradation,
    currentScenario.id,
    currentScenario.domain,
    isWebcamActive,
    tracklets,
    selectedTrackId,
    opticalFlowPoints,
    autoCenter,
    zoomLevel,
  ]);

  // Click handler to select / lock target (inverts pan/zoom transform for accurate hit detection)
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

      const curZoom = zoomRef.current;
      const curPanX = panRef.current.x;
      const curPanY = panRef.current.y;

      // Invert pan & zoom transformation to map screen coordinates to world coordinates
      const worldClickX = (clickX - canvas.width / 2) / curZoom + curPanX;
      const worldClickY = (clickY - canvas.height / 2) / curZoom + curPanY;

      // Find closest tracklet
      let clickedId: number | null = null;
      let minDistance = 50 / curZoom; // tolerance in world units

      for (const trk of tracklets) {
        const cx = trk.bbox.x + trk.bbox.w / 2;
        const cy = trk.bbox.y + trk.bbox.h / 2;
        const dist = Math.hypot(worldClickX - cx, worldClickY - cy);
        if (dist < minDistance) {
          minDistance = dist;
          clickedId = trk.id;
        }
      }

      onSelectTrack(clickedId === selectedTrackId ? null : clickedId);
    },
    [tracklets, selectedTrackId, onSelectTrack]
  );

  return (
    <div className="relative w-full h-full flex flex-col bg-[#050811] rounded-lg border border-slate-800 overflow-hidden shadow-2xl">
      {/* Viewport Top Status Strip with Edge Hardware Health Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#090e1b]/95 border-b border-slate-800/80 text-[11px] text-slate-400 font-mono select-none">
        <div className="flex items-center gap-2.5">
          <span className="text-cyan-400 font-semibold tracking-wider">
            SENSOR 01 // {degradation.spectrum.startsWith('flir') ? `FLIR [${degradation.flirPalette.toUpperCase()}]` : degradation.spectrum.toUpperCase()}
          </span>
          <span className="text-slate-600">|</span>
          <span>FPS: <strong className="text-emerald-400 font-semibold tabular-nums">{fpsCounter}</strong></span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="hidden sm:inline">
            TRACKS: <strong className="text-cyan-300 font-semibold">{tracklets.filter(t => t.state === 'confirmed').length}</strong>
          </span>
          {degradation.jitterRms > 0 && (
            <>
              <span className="text-slate-600 hidden md:inline">|</span>
              <span
                className={`hidden md:inline px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  degradation.enableJitterCompensation
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                }`}
                title={
                  degradation.enableJitterCompensation
                    ? 'Kalman measurement noise covariance R dynamically adjusted for vibration'
                    : 'Camera vibration uncompensated: track drift risk'
                }
              >
                {degradation.enableJitterCompensation ? 'JITTER COMP: ACTIVE' : 'JITTER: UNCOMPENSATED'}
              </span>
            </>
          )}
        </div>

        {/* Viewport Top Right: Auto-Center status, zoom controls, and Edge Hardware Health */}
        <div className="flex items-center gap-2">
          {/* Target Auto-Center Indicator & Zoom Select */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleAutoCenter}
              title={
                autoCenter
                  ? 'Target Auto-Center Active (Click to disable)'
                  : 'Target Auto-Center Inactive (Click to enable)'
              }
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                autoCenter
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Crosshair className={`w-3 h-3 ${autoCenter ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">AUTO-CENTER:</span>
              <span className="font-bold">{autoCenter ? 'ON' : 'OFF'}</span>
            </button>

            {autoCenter && (
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-[9px] font-mono">
                {([1.5, 2.0, 2.5] as const).map(z => (
                  <button
                    key={z}
                    onClick={() => setZoomLevel(z)}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      zoomLevel === z
                        ? 'bg-cyan-500/25 text-cyan-300 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title={`Set Auto-Center Zoom: ${z}x`}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <HardwareHealthIndicator
            activeDevice={activeDevice}
            onChangeDevice={onChangeDevice}
            precision={precision}
            isStreaming={isStreaming}
          />
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <div className="relative flex-1 flex items-center justify-center p-1 bg-black overflow-hidden">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          onClick={handleCanvasClick}
          className="w-full h-full object-contain cursor-crosshair rounded"
        />

        {/* Selected Target HUD Quick Card Overlay */}
        {selectedTrackId && (
          <div className="absolute top-4 left-4 bg-[#090e1b]/90 backdrop-blur-md border border-cyan-500/50 rounded p-2.5 text-xs font-mono text-cyan-200 pointer-events-none shadow-xl">
            <div className="flex items-center justify-between gap-4 font-bold text-cyan-300 border-b border-cyan-800/60 pb-1 mb-1.5">
              <span>TARGET LOCK // TRK-{String(selectedTrackId).padStart(3, '0')}</span>
              <span className="text-rose-400">ENGAGED</span>
            </div>
            {(() => {
              const trk = tracklets.find(t => t.id === selectedTrackId);
              if (!trk) return <span>TRACK SEARCHING...</span>;
              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div>CLASS: <span className="text-white">{trk.class}</span></div>
                  <div>SPEED: <span className="text-emerald-400">{trk.speedKnots} kts</span></div>
                  <div>RANGE: <span className="text-amber-300">{trk.rangeMeters} m</span></div>
                  <div>BEARING: <span className="text-white">{trk.bearingDeg > 0 ? `+${trk.bearingDeg}°` : `${trk.bearingDeg}°`}</span></div>
                  <div>CONF: <span className="text-cyan-300">{Math.round(trk.confidence * 100)}%</span></div>
                  <div>TCPA: <span className="text-white">{trk.tcpaSeconds < 999 ? `${trk.tcpaSeconds}s` : 'CLEAR'}</span></div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// CANVAS RENDERING UTILITIES & PROCEDURAL GENERATORS
// ============================================================================

function drawSyntheticBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  deg: DegradationSettings,
  domain: string
) {
  const isThermal = deg.spectrum.startsWith('flir');
  const isIronbow = isThermal && deg.flirPalette === 'ironbow';
  const isNight = deg.spectrum === 'nvg_night';

  const minX = -w;
  const maxX = 2 * w;
  const minY = -h;
  const maxY = 2 * h;
  const horizonY = 280;

  if (isThermal) {
    // Thermal background: dark cool gradient for ocean, slightly warmer horizon
    const grad = ctx.createLinearGradient(0, minY, 0, maxY);
    if (isIronbow) {
      grad.addColorStop(0, '#06021a');
      grad.addColorStop(0.5, '#13042e');
      grad.addColorStop(1, '#1c053a');
    } else {
      grad.addColorStop(0, '#0a0d14');
      grad.addColorStop(0.5, '#121824');
      grad.addColorStop(1, '#0e141f');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  } else if (isNight) {
    // Night vision background: dark charcoal before phosphor shader
    ctx.fillStyle = '#050a08';
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  } else {
    // Daylight EO sky and sea
    const skyGrad = ctx.createLinearGradient(0, minY, 0, horizonY);
    skyGrad.addColorStop(0, '#2d4b73');
    skyGrad.addColorStop(1, '#6889b0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(minX, minY, maxX - minX, horizonY - minY);

    const seaGrad = ctx.createLinearGradient(0, horizonY, 0, maxY);
    seaGrad.addColorStop(0, '#1a334d');
    seaGrad.addColorStop(1, '#0f2033');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(minX, horizonY, maxX - minX, maxY - horizonY);
  }

  // Draw horizon line
  ctx.strokeStyle = isThermal ? 'rgba(70, 95, 130, 0.4)' : isNight ? 'rgba(30, 80, 50, 0.4)' : 'rgba(180, 210, 240, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(minX, horizonY);
  ctx.lineTo(maxX, horizonY);
  ctx.stroke();

  // Distant terrain / islands / coastline
  ctx.fillStyle = isThermal ? '#161e2e' : isNight ? '#0b1610' : '#23384d';
  ctx.beginPath();
  ctx.moveTo(minX, horizonY);
  for (let x = minX; x <= maxX; x += 30) {
    const hillHeight = Math.sin(x * 0.008 + 1.2) * 22 + Math.cos(x * 0.015) * 12;
    ctx.lineTo(x, horizonY - Math.max(2, hillHeight));
  }
  ctx.lineTo(maxX, horizonY);
  ctx.closePath();
  ctx.fill();

  // Sea waves / wake ripples
  if (domain !== 'aerial') {
    ctx.strokeStyle = isThermal ? 'rgba(45, 65, 90, 0.35)' : isNight ? 'rgba(20, 60, 35, 0.35)' : 'rgba(120, 160, 200, 0.2)';
    ctx.lineWidth = 1.2;
    for (let y = horizonY + 12; y < maxY; y += 18) {
      const waveSpeed = t * 18 * (y / 300);
      ctx.beginPath();
      for (let x = minX; x < maxX; x += 40) {
        const waveOffset = Math.sin((x + waveSpeed) * 0.04) * 3;
        if (x === minX) ctx.moveTo(x, y + waveOffset);
        else ctx.lineTo(x, y + waveOffset);
      }
      ctx.stroke();
    }
  }
}

function drawPhysicalTarget(
  ctx: CanvasRenderingContext2D,
  tgt: {
    id: number;
    class: string;
    category: 'vessel' | 'aircraft' | 'beacon';
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    thermalSignature: number;
    occluded: boolean;
  },
  t: number,
  deg: DegradationSettings
) {
  const isThermal = deg.spectrum.startsWith('flir');
  const isIronbow = isThermal && deg.flirPalette === 'ironbow';
  const isWhiteHot = isThermal && (deg.flirPalette === 'white_hot' || (!isIronbow && deg.spectrum === 'flir_white'));
  const isNight = deg.spectrum === 'nvg_night';

  const cx = tgt.x + tgt.w / 2;
  const cy = tgt.y + tgt.h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  if (tgt.category === 'vessel') {
    // Vessel Hull
    const hullColor = isThermal
      ? (isIronbow ? 'rgb(159, 18, 57)' : isWhiteHot ? 'rgb(180, 200, 220)' : 'rgb(40, 45, 55)')
      : isNight
      ? '#1a3d24'
      : '#334155';

    ctx.fillStyle = hullColor;
    ctx.beginPath();
    ctx.moveTo(-tgt.w * 0.48, tgt.h * 0.25);
    ctx.lineTo(tgt.w * 0.42, tgt.h * 0.25);
    ctx.lineTo(tgt.w * 0.5, tgt.h * 0.05);
    ctx.lineTo(tgt.w * 0.35, -tgt.h * 0.2);
    ctx.lineTo(-tgt.w * 0.45, -tgt.h * 0.2);
    ctx.closePath();
    ctx.fill();

    // Superstructure / Bridge
    ctx.fillStyle = isThermal
      ? (isIronbow ? 'rgb(234, 88, 12)' : isWhiteHot ? 'rgb(220, 235, 255)' : 'rgb(20, 25, 30)')
      : isNight
      ? '#255734'
      : '#475569';
    ctx.fillRect(-tgt.w * 0.2, -tgt.h * 0.45, tgt.w * 0.35, tgt.h * 0.3);

    // Mast / Radar Antenna
    ctx.strokeStyle = isIronbow ? '#fde047' : isThermal ? 'rgba(255,255,255,0.7)' : '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-tgt.w * 0.05, -tgt.h * 0.45);
    ctx.lineTo(-tgt.w * 0.05, -tgt.h * 0.65);
    ctx.stroke();

    // Engine Exhaust Hotspot (Thermal FLIR glowing plume scaled by FLIR Gain)
    if (isThermal) {
      const gainScale = Math.max(0.6, Math.min(2.0, (deg.flirGain ?? 1.25) * 0.9));
      const r = tgt.h * 0.18 * tgt.thermalSignature * gainScale;

      if (isIronbow) {
        // Multi-tier Ironbow fiery flare
        ctx.fillStyle = 'rgba(234, 88, 12, 0.8)';
        ctx.beginPath();
        ctx.arc(-tgt.w * 0.38, 0, r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(-tgt.w * 0.38, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-tgt.w * 0.38, 0, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const glowColor = isWhiteHot ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 15, 0.95)';
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(-tgt.w * 0.38, 0, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Water Wake behind vessel
    const wakeColor = isIronbow
      ? 'rgba(168, 85, 247, 0.45)'
      : isThermal
      ? 'rgba(60, 90, 120, 0.4)'
      : isNight
      ? 'rgba(40, 90, 50, 0.3)'
      : 'rgba(255, 255, 255, 0.35)';
    ctx.strokeStyle = wakeColor;
    ctx.lineWidth = 1.5;
    const wakeDir = tgt.vx >= 0 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(wakeDir * tgt.w * 0.45, tgt.h * 0.25);
    ctx.lineTo(wakeDir * tgt.w * 1.1, tgt.h * 0.35);
    ctx.moveTo(wakeDir * tgt.w * 0.45, tgt.h * 0.25);
    ctx.lineTo(wakeDir * tgt.w * 0.95, tgt.h * 0.15);
    ctx.stroke();
  } else if (tgt.category === 'aircraft') {
    // Aircraft / UAV Silhouette
    ctx.fillStyle = isThermal
      ? (isIronbow ? '#be123c' : isWhiteHot ? 'rgb(240, 248, 255)' : 'rgb(25, 25, 30)')
      : isNight
      ? '#2d5c38'
      : '#1e293b';

    // Fuselage
    ctx.beginPath();
    ctx.ellipse(0, 0, tgt.w * 0.45, tgt.h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings
    ctx.beginPath();
    ctx.moveTo(-tgt.w * 0.1, 0);
    ctx.lineTo(-tgt.w * 0.4, -tgt.h * 0.45);
    ctx.lineTo(tgt.w * 0.3, -tgt.h * 0.45);
    ctx.lineTo(tgt.w * 0.15, 0);
    ctx.closePath();
    ctx.fill();

    // Engine heat plume
    if (isThermal) {
      ctx.fillStyle = isWhiteHot ? '#ffffff' : '#050505';
      ctx.beginPath();
      ctx.arc(-tgt.w * 0.4, 0, 3.5 * tgt.thermalSignature, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Navigational Beacon / Buoy
    ctx.fillStyle = isThermal ? (isWhiteHot ? '#dbeafe' : '#1e293b') : '#f59e0b';
    ctx.fillRect(-tgt.w * 0.3, -tgt.h * 0.4, tgt.w * 0.6, tgt.h * 0.8);
  }

  ctx.restore();
}

function applySensorDegradationShaders(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  deg: DegradationSettings,
  t: number
) {
  const minX = -w;
  const maxX = 2 * w;
  const minY = -h;
  const maxY = 2 * h;

  // 1. NIGHT VISION PHOSPHOR GREEN SHADER
  if (deg.spectrum === 'nvg_night') {
    ctx.fillStyle = 'rgba(10, 48, 20, 0.45)';
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Starlight photon noise grain
    const noiseCount = 350;
    ctx.fillStyle = 'rgba(167, 243, 208, 0.25)';
    for (let i = 0; i < noiseCount; i++) {
      const nx = minX + Math.random() * (maxX - minX);
      const ny = minY + Math.random() * (maxY - minY);
      ctx.fillRect(nx, ny, 1.5, 1.5);
    }
  }

  // 2. FOG & ADVECTION HAZE LAYER
  if (deg.fogDensity > 0.05) {
    const fogAlpha = deg.fogDensity * 0.75;
    const fogGrad = ctx.createLinearGradient(0, minY + 180, 0, maxY);
    fogGrad.addColorStop(0, `rgba(200, 215, 230, ${fogAlpha * 0.4})`);
    fogGrad.addColorStop(0.4, `rgba(215, 225, 240, ${fogAlpha * 0.85})`);
    fogGrad.addColorStop(1, `rgba(190, 205, 220, ${fogAlpha * 0.95})`);

    ctx.fillStyle = fogGrad;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

    // Dynamic swirling fog puffs
    ctx.fillStyle = `rgba(255, 255, 255, ${deg.fogDensity * 0.18})`;
    for (let i = 0; i < 6; i++) {
      const px = minX + ((t * 22 * (i + 1) + i * 260) % (maxX - minX + 200)) - 100;
      const py = 240 + Math.sin(t + i) * 40;
      ctx.beginPath();
      ctx.arc(px, py, 110 + i * 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. SEA SPRAY & MARINE HAZE
  if (deg.marineHaze > 0.05) {
    ctx.fillStyle = `rgba(180, 200, 220, ${deg.marineHaze * 0.25})`;
    ctx.fillRect(minX, 260, maxX - minX, maxY - 260);
  }

  // 4. LOW-LIGHT / STARLIGHT ILLUMINATION
  if (deg.luxLevel < 20 && deg.spectrum === 'eo_day') {
    const darkness = (1 - deg.luxLevel / 20) * 0.88;
    ctx.fillStyle = `rgba(5, 10, 20, ${darkness})`;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  }
}

function drawOpticalFlowOverlay(ctx: CanvasRenderingContext2D, points: OpticalFlowPoint[]) {
  ctx.save();
  for (const pt of points) {
    if (pt.isLandmark) {
      // Golden diamond for fixed landmark ground-truth anchor
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pt.x - 4, pt.y - 4, 8, 8);
    } else {
      // Small cyan optical flow velocity vector arrow
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x + pt.vx * 8, pt.y + pt.vy * 8);
      ctx.stroke();

      ctx.fillStyle = 'rgba(14, 165, 233, 0.8)';
      ctx.fillRect(pt.x - 1, pt.y - 1, 2, 2);
    }
  }
  ctx.restore();
}

function drawTrackletsOverlay(
  ctx: CanvasRenderingContext2D,
  tracklets: Tracklet[],
  selectedId: number | null,
  showKalmanVector: boolean,
  showCovariance: boolean
) {
  ctx.save();

  for (const trk of tracklets) {
    const isSelected = trk.id === selectedId;
    const isConfirmed = trk.state === 'confirmed';
    const isLost = trk.state === 'lost';

    // Color code by state and lock
    let boxColor = 'rgba(14, 165, 233, 0.85)'; // Cyan
    if (isSelected) {
      boxColor = 'rgba(239, 68, 68, 0.95)'; // Red lock
    } else if (isLost) {
      boxColor = 'rgba(148, 163, 184, 0.5)'; // Gray lost
    } else if (!isConfirmed) {
      boxColor = 'rgba(245, 158, 11, 0.85)'; // Amber tentative
    }

    ctx.strokeStyle = boxColor;
    ctx.lineWidth = isSelected ? 2 : 1.5;

    // Bounding Box corners (military reticle style)
    const { x, y, w, h } = trk.bbox;
    const corner = Math.min(10, Math.min(w, h) * 0.3);

    if (isLost) {
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    } else {
      // Corner brackets
      ctx.beginPath();
      // Top-Left
      ctx.moveTo(x, y + corner);
      ctx.lineTo(x, y);
      ctx.lineTo(x + corner, y);
      // Top-Right
      ctx.moveTo(x + w - corner, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + corner);
      // Bottom-Right
      ctx.moveTo(x + w, y + h - corner);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - corner, y + h);
      // Bottom-Left
      ctx.moveTo(x + corner, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + h - corner);
      ctx.stroke();
    }

    // 2-Sigma Kalman Position Covariance Ellipse
    if (showCovariance) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = Math.max(8, trk.covariance * 1.4);
      const ry = Math.max(6, trk.covariance * 0.9);

      ctx.strokeStyle = isSelected ? 'rgba(239, 68, 68, 0.35)' : 'rgba(14, 165, 233, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Kalman Filter 2-Second Predicted Path Vector for Active Tracklets
    if (showKalmanVector && !isLost) {
      const cx = x + w / 2;
      const cy = y + h / 2;

      // Kalman filter velocity estimation: trk.velocity is [vx, vy] in pixels/frame (~30 fps).
      // For a 2.0-second predicted path: 2.0s * 30 frames/s = 60 frames forward projection.
      const fps = 30;
      const horizonSec = 2.0;
      const vxSec = trk.velocity[0] * fps;
      const vySec = trk.velocity[1] * fps;

      const predX2 = cx + vxSec * horizonSec;
      const predY2 = cy + vySec * horizonSec;
      const predX1 = cx + vxSec * 1.0;
      const predY1 = cy + vySec * 1.0;

      const pathDist = Math.hypot(predX2 - cx, predY2 - cy);

      ctx.save();
      const strokeColor = isSelected ? 'rgba(244, 63, 94, 0.95)' : 'rgba(52, 211, 153, 0.9)';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 2.0 : 1.5;

      if (pathDist >= 2.0) {
        const angle = Math.atan2(predY2 - cy, predX2 - cx);

        // 1. Draw 2-second trajectory line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(predX2, predY2);
        ctx.stroke();

        // 2. Draw +1.0s intermediate waypoint tick mark
        const tickLen = isSelected ? 4 : 3;
        const perpX = -Math.sin(angle) * tickLen;
        const perpY = Math.cos(angle) * tickLen;
        ctx.beginPath();
        ctx.moveTo(predX1 - perpX, predY1 - perpY);
        ctx.lineTo(predX1 + perpX, predY1 + perpY);
        ctx.stroke();

        // 3. Directional tactical arrowhead at +2.0s
        const headLen = isSelected ? 7 : 5.5;
        ctx.beginPath();
        ctx.moveTo(predX2, predY2);
        ctx.lineTo(
          predX2 - headLen * Math.cos(angle - Math.PI / 6),
          predY2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(predX2, predY2);
        ctx.lineTo(
          predX2 - headLen * Math.cos(angle + Math.PI / 6),
          predY2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();

        // 4. Projected ghost bounding box at +2.0s to anticipate target envelope
        ctx.save();
        ctx.strokeStyle = isSelected ? 'rgba(244, 63, 94, 0.4)' : 'rgba(52, 211, 153, 0.28)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(predX2 - w / 2, predY2 - h / 2, w, h);
        ctx.restore();

        // 5. Operator anticipation badge (+2.0s)
        const badgeText = isSelected ? `+2.0s [${trk.speedKnots}kt]` : '+2.0s';
        ctx.font = '600 8.5px "JetBrains Mono", monospace';
        const textMetrics = ctx.measureText(badgeText);
        const textW = textMetrics.width;
        const badgeX = predX2 + 5;
        const badgeY = predY2 - 3;

        ctx.fillStyle = 'rgba(9, 14, 27, 0.85)';
        ctx.fillRect(badgeX - 2, badgeY - 8, textW + 4, 11);
        ctx.strokeStyle = isSelected ? 'rgba(244, 63, 94, 0.6)' : 'rgba(52, 211, 153, 0.5)';
        ctx.lineWidth = 0.75;
        ctx.strokeRect(badgeX - 2, badgeY - 8, textW + 4, 11);
        ctx.fillStyle = isSelected ? '#fca5a5' : '#a7f3d0';
        ctx.fillText(badgeText, badgeX, badgeY);
      }

      // Endpoint pip
      ctx.fillStyle = isSelected ? '#f43f5e' : '#34d399';
      ctx.beginPath();
      ctx.arc(predX2, predY2, isSelected ? 3 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Track ID and Class Tag
    ctx.fillStyle = isSelected ? '#ef4444' : '#0ea5e9';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    const tag = `TRK-${String(trk.id).padStart(2, '0')} [${trk.class.substring(0, 10)}]`;
    ctx.fillText(tag, x, Math.max(12, y - 4));

    // Confidence / Speed subtitle
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    const sub = `${Math.round(trk.confidence * 100)}% · ${trk.speedKnots}kt`;
    ctx.fillText(sub, x, y + h + 11);
  }

  ctx.restore();
}

function drawTacticalHud(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  fps: number,
  deg: DegradationSettings,
  autoCenter?: boolean,
  selectedTracklet?: Tracklet | null,
  currentZoom: number = 1.0
) {
  ctx.save();
  const cx = w / 2;
  const cy = h / 2;

  const isLocked = Boolean(autoCenter && selectedTracklet);

  // Center Crosshair Reticle - illuminates rose/red when auto-centered on locked target
  ctx.strokeStyle = isLocked ? 'rgba(244, 63, 94, 0.85)' : 'rgba(14, 165, 233, 0.45)';
  ctx.lineWidth = isLocked ? 1.5 : 1;

  ctx.beginPath();
  // Horizontal ticks
  ctx.moveTo(cx - 30, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 30, cy);
  // Vertical ticks
  ctx.moveTo(cx, cy - 30);
  ctx.lineTo(cx, cy - 8);
  ctx.moveTo(cx, cy + 8);
  ctx.lineTo(cx, cy + 30);
  ctx.stroke();

  // Circle reticle
  ctx.beginPath();
  ctx.arc(cx, cy, isLocked ? 46 : 50, 0, Math.PI * 2);
  ctx.setLineDash(isLocked ? [6, 4] : [4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // If Target Auto-Center is active on contact, draw Tactical Gimbal Slew Box & Telemetry
  if (isLocked && selectedTracklet) {
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
    ctx.lineWidth = 1.5;
    const bSize = 34;
    const bLen = 8;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(cx - bSize, cy - bSize + bLen);
    ctx.lineTo(cx - bSize, cy - bSize);
    ctx.lineTo(cx - bSize + bLen, cy - bSize);
    // Top-right
    ctx.moveTo(cx + bSize - bLen, cy - bSize);
    ctx.lineTo(cx + bSize, cy - bSize);
    ctx.lineTo(cx + bSize, cy - bSize + bLen);
    // Bottom-right
    ctx.moveTo(cx + bSize, cy + bSize - bLen);
    ctx.lineTo(cx + bSize, cy + bSize);
    ctx.lineTo(cx + bSize - bLen, cy + bSize);
    // Bottom-left
    ctx.moveTo(cx - bSize + bLen, cy + bSize);
    ctx.lineTo(cx - bSize, cy + bSize);
    ctx.lineTo(cx - bSize, cy + bSize - bLen);
    ctx.stroke();

    // Slew Telemetry Boresight Subtitle
    ctx.fillStyle = '#f43f5e';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`AUTO-CENTER [TRK-${String(selectedTracklet.id).padStart(2, '0')}]`, cx, cy + 62);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    const azStr = (selectedTracklet.bearingDeg >= 0 ? '+' : '') + selectedTracklet.bearingDeg.toFixed(1);
    ctx.fillText(`GIMBAL: AZ ${azStr}° · ZOOM ${currentZoom.toFixed(1)}X`, cx, cy + 74);
    ctx.textAlign = 'left';
  } else if (autoCenter) {
    ctx.fillStyle = '#0ea5e9';
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AUTO-CENTER: STANDBY', cx, cy + 64);
    ctx.textAlign = 'left';
  }

  // Artificial Horizon Ladder
  const rollAngle = Math.sin(t * 0.4) * 0.03; // slight platform roll
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rollAngle);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.beginPath();
  ctx.moveTo(-120, 0);
  ctx.lineTo(-60, 0);
  ctx.moveTo(60, 0);
  ctx.lineTo(120, 0);
  ctx.stroke();
  ctx.restore();

  // Corner HUD Brackets
  const pad = 16;
  const brk = 24;
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
  ctx.beginPath();
  // Top-left
  ctx.moveTo(pad, pad + brk);
  ctx.lineTo(pad, pad);
  ctx.lineTo(pad + brk, pad);
  // Top-right
  ctx.moveTo(w - pad - brk, pad);
  ctx.lineTo(w - pad, pad);
  ctx.lineTo(w - pad, pad + brk);
  // Bottom-left
  ctx.moveTo(pad, h - pad - brk);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(pad + brk, h - pad);
  // Bottom-right
  ctx.moveTo(w - pad - brk, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.lineTo(w - pad, h - pad - brk);
  ctx.stroke();

  ctx.restore();
}

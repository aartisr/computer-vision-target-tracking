import React, { useRef, useEffect, useState, useCallback } from 'react';
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const simTimeRef = useRef<number>(0);
  const [fpsCounter, setFpsCounter] = useState<number>(60);
  const frameTimesRef = useRef<number[]>([]);

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

      ctx.save();
      ctx.translate(jitterX, jitterY);

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

      // --- 6. RENDER HUD HEADS-UP DISPLAY (Reticle, Boresight, Telemetry) ---
      if (degradation.enableHorizonHud) {
        drawTacticalHud(ctx, width, height, t, fpsCounter, degradation);
      }

      ctx.restore();

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
  ]);

  // Click handler to select / lock target
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height;

      // Find closest tracklet
      let clickedId: number | null = null;
      let minDistance = 45; // pixel tolerance

      for (const trk of tracklets) {
        const cx = trk.bbox.x + trk.bbox.w / 2;
        const cy = trk.bbox.y + trk.bbox.h / 2;
        const dist = Math.hypot(clickX - cx, clickY - cy);
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

        {/* Edge Hardware Health Indicator specifically tailored for Jetson / Raspberry Pi */}
        <div className="flex items-center gap-2">
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

  if (isThermal) {
    // Thermal background: dark cool gradient for ocean, slightly warmer horizon
    const grad = ctx.createLinearGradient(0, 0, 0, h);
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
    ctx.fillRect(0, 0, w, h);
  } else if (isNight) {
    // Night vision background: dark charcoal before phosphor shader
    ctx.fillStyle = '#050a08';
    ctx.fillRect(0, 0, w, h);
  } else {
    // Daylight EO sky and sea
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 280);
    skyGrad.addColorStop(0, '#2d4b73');
    skyGrad.addColorStop(1, '#6889b0');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, 280);

    const seaGrad = ctx.createLinearGradient(0, 280, 0, h);
    seaGrad.addColorStop(0, '#1a334d');
    seaGrad.addColorStop(1, '#0f2033');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 280, w, h - 280);
  }

  // Draw horizon line
  const horizonY = 280;
  ctx.strokeStyle = isThermal ? 'rgba(70, 95, 130, 0.4)' : isNight ? 'rgba(30, 80, 50, 0.4)' : 'rgba(180, 210, 240, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.stroke();

  // Distant terrain / islands / coastline
  ctx.fillStyle = isThermal ? '#161e2e' : isNight ? '#0b1610' : '#23384d';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= w; x += 30) {
    const hillHeight = Math.sin(x * 0.008 + 1.2) * 22 + Math.cos(x * 0.015) * 12;
    ctx.lineTo(x, horizonY - Math.max(2, hillHeight));
  }
  ctx.lineTo(w, horizonY);
  ctx.closePath();
  ctx.fill();

  // Sea waves / wake ripples
  if (domain !== 'aerial') {
    ctx.strokeStyle = isThermal ? 'rgba(45, 65, 90, 0.35)' : isNight ? 'rgba(20, 60, 35, 0.35)' : 'rgba(120, 160, 200, 0.2)';
    ctx.lineWidth = 1.2;
    for (let y = horizonY + 12; y < h; y += 18) {
      const waveSpeed = t * 18 * (y / 300);
      ctx.beginPath();
      for (let x = 0; x < w; x += 40) {
        const waveOffset = Math.sin((x + waveSpeed) * 0.04) * 3;
        if (x === 0) ctx.moveTo(x, y + waveOffset);
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
  // 1. NIGHT VISION PHOSPHOR GREEN SHADER
  if (deg.spectrum === 'nvg_night') {
    ctx.fillStyle = 'rgba(10, 48, 20, 0.45)';
    ctx.fillRect(0, 0, w, h);

    // Starlight photon noise grain
    const noiseCount = 350;
    ctx.fillStyle = 'rgba(167, 243, 208, 0.25)';
    for (let i = 0; i < noiseCount; i++) {
      const nx = Math.random() * w;
      const ny = Math.random() * h;
      ctx.fillRect(nx, ny, 1.5, 1.5);
    }
  }

  // 2. FOG & ADVECTION HAZE LAYER
  if (deg.fogDensity > 0.05) {
    const fogAlpha = deg.fogDensity * 0.75;
    const fogGrad = ctx.createLinearGradient(0, 180, 0, h);
    fogGrad.addColorStop(0, `rgba(200, 215, 230, ${fogAlpha * 0.4})`);
    fogGrad.addColorStop(0.4, `rgba(215, 225, 240, ${fogAlpha * 0.85})`);
    fogGrad.addColorStop(1, `rgba(190, 205, 220, ${fogAlpha * 0.95})`);

    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, 0, w, h);

    // Dynamic swirling fog puffs
    ctx.fillStyle = `rgba(255, 255, 255, ${deg.fogDensity * 0.18})`;
    for (let i = 0; i < 4; i++) {
      const px = ((t * 22 * (i + 1) + i * 260) % (w + 200)) - 100;
      const py = 240 + Math.sin(t + i) * 40;
      ctx.beginPath();
      ctx.arc(px, py, 110 + i * 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. SEA SPRAY & MARINE HAZE
  if (deg.marineHaze > 0.05) {
    ctx.fillStyle = `rgba(180, 200, 220, ${deg.marineHaze * 0.25})`;
    ctx.fillRect(0, 260, w, h - 260);
  }

  // 4. LOW-LIGHT / STARLIGHT ILLUMINATION
  if (deg.luxLevel < 20 && deg.spectrum === 'eo_day') {
    const darkness = (1 - deg.luxLevel / 20) * 0.88;
    ctx.fillStyle = `rgba(5, 10, 20, ${darkness})`;
    ctx.fillRect(0, 0, w, h);
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

    // Kalman Filter Velocity Prediction Vector (3-second forward extrapolate)
    if (showKalmanVector && !isLost) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      const forecastX = cx + trk.velocity[0] * 3;
      const forecastY = cy + trk.velocity[1] * 3;

      ctx.strokeStyle = isSelected ? 'rgba(239, 68, 68, 0.8)' : 'rgba(52, 211, 153, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(forecastX, forecastY);
      ctx.stroke();

      // Velocity endpoint pip
      ctx.fillStyle = isSelected ? '#ef4444' : '#34d399';
      ctx.beginPath();
      ctx.arc(forecastX, forecastY, 2.5, 0, Math.PI * 2);
      ctx.fill();
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
  deg: DegradationSettings
) {
  ctx.save();
  const cx = w / 2;
  const cy = h / 2;

  // Center Crosshair Reticle
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
  ctx.lineWidth = 1;

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
  ctx.arc(cx, cy, 50, 0, Math.PI * 2);
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

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

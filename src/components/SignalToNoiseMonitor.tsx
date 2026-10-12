import React, { useMemo } from 'react';
import { DegradationSettings } from '../types/tactical';
import { Radio, AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, Activity } from 'lucide-react';

interface SignalToNoiseMonitorProps {
  degradation: DegradationSettings;
}

export const SignalToNoiseMonitor: React.FC<SignalToNoiseMonitorProps> = ({ degradation }) => {
  const {
    snrDb,
    status,
    scatteringLossDb,
    jitterLossDb,
    photonicLossDb,
    glareLossDb,
    thermalGainBonusDb,
    detectionAccuracyImpact,
    motMode,
  } = useMemo(() => {
    const isThermal = degradation.spectrum.startsWith('flir');
    const isNVG = degradation.spectrum === 'nvg_night';
    const isEO = degradation.spectrum === 'eo_day';

    // Baseline clean sensor SNR
    const baseSnr = 32.0;

    // 1. Atmospheric scattering noise (Fog + Haze)
    // Thermal LWIR penetrates fog much better than EO
    let fogCoeff = isThermal ? 9.5 : isNVG ? 16.0 : 22.5;
    let hazeCoeff = isThermal ? 4.0 : isNVG ? 7.0 : 10.0;
    const scatteringLoss = -(degradation.fogDensity * fogCoeff + degradation.marineHaze * hazeCoeff);

    // 2. Gimbal jitter & optical blur noise
    const jitterLoss = -(degradation.jitterRms * 1.35);

    // 3. Photonic / low-light shot noise
    let photonicLoss = 0;
    if (isEO) {
      if (degradation.luxLevel < 25) {
        photonicLoss = -Math.min(18, ((25 - degradation.luxLevel) / 25) * 16.5);
      }
    } else if (isNVG) {
      photonicLoss = -3.2; // Fixed phosphor scintillation noise
    } else {
      photonicLoss = 0; // Thermal is passive emission, unaffected by ambient daylight darkness
    }

    // 4. Glare & sea-state specular reflection noise
    const glareLoss = -(degradation.glare * 4.5);

    // 5. Thermal gain / PEQ compensation bonus
    let thermalBonus = 0;
    if (isThermal && degradation.flirGain) {
      thermalBonus = Math.max(0, (degradation.flirGain - 0.9) * 2.8);
      if (degradation.flirHistogramEq) thermalBonus += 1.2;
    }

    const netSnr = Math.max(3.0, Math.min(32.0, baseSnr + scatteringLoss + jitterLoss + photonicLoss + glareLoss + thermalBonus));

    let status: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL' = 'OPTIMAL';
    let motMode = 'Stage 1 High-Conf Matching';
    let accuracyLoss = 0;

    if (netSnr >= 22) {
      status = 'OPTIMAL';
      motMode = 'Stage-1 Direct Hungarian Match';
      accuracyLoss = (32 - netSnr) * 0.35;
    } else if (netSnr >= 12) {
      status = 'DEGRADED';
      motMode = 'Stage-2 Low-Conf IoU Association';
      accuracyLoss = 4.5 + (22 - netSnr) * 1.4;
    } else {
      status = 'CRITICAL';
      motMode = 'EKF Velocity Coasting (Lost Recovery)';
      accuracyLoss = 18.5 + (12 - netSnr) * 2.8;
    }

    return {
      snrDb: parseFloat(netSnr.toFixed(1)),
      status,
      scatteringLossDb: parseFloat(scatteringLoss.toFixed(1)),
      jitterLossDb: parseFloat(jitterLoss.toFixed(1)),
      photonicLossDb: parseFloat(photonicLoss.toFixed(1)),
      glareLossDb: parseFloat(glareLoss.toFixed(1)),
      thermalGainBonusDb: parseFloat(thermalBonus.toFixed(1)),
      detectionAccuracyImpact: Math.min(48, parseFloat(accuracyLoss.toFixed(1))),
      motMode,
    };
  }, [degradation]);

  const statusColor =
    status === 'OPTIMAL'
      ? 'text-emerald-400'
      : status === 'DEGRADED'
      ? 'text-amber-300'
      : 'text-rose-400';

  const statusBg =
    status === 'OPTIMAL'
      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
      : status === 'DEGRADED'
      ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
      : 'bg-rose-950/40 border-rose-500/40 text-rose-300';

  const gaugePercent = Math.min(100, Math.max(5, (snrDb / 32) * 100));

  return (
    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-200 font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold text-slate-300 tracking-wider uppercase flex items-center gap-1.5 font-mono">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          Signal-to-Noise Ratio (SNR) Monitor
        </label>
        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border font-mono ${statusBg}`}>
          {status}
        </span>
      </div>

      {/* Primary SNR Metric Card */}
      <div className="p-2.5 bg-[#060a14] border border-slate-800 rounded mb-2.5 font-mono">
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-white tabular-nums">
              {snrDb}
            </span>
            <span className="text-xs text-slate-400">dB</span>
          </div>

          <div className="text-right">
            <div className="text-[10px] text-slate-400">MOT ACCURACY DROP</div>
            <div className={`text-xs font-bold tabular-nums ${detectionAccuracyImpact > 15 ? 'text-rose-400' : detectionAccuracyImpact > 5 ? 'text-amber-300' : 'text-emerald-400'}`}>
              -{detectionAccuracyImpact}% mAP
            </div>
          </div>
        </div>

        {/* Dynamic Segmented Gauge Bar */}
        <div className="mt-2 w-full h-2 bg-slate-800/80 rounded-full overflow-hidden relative shadow-inner">
          {/* Reference thresholds */}
          <div className="absolute inset-0 flex">
            <div className="w-[37.5%] h-full border-r border-slate-900 bg-rose-500/20" title="Critical (< 12dB)" />
            <div className="w-[31.25%] h-full border-r border-slate-900 bg-amber-500/20" title="Degraded (12-22dB)" />
            <div className="w-[31.25%] h-full bg-emerald-500/20" title="Optimal (> 22dB)" />
          </div>

          {/* Active Level Fill */}
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              snrDb >= 22 ? 'bg-emerald-400' : snrDb >= 12 ? 'bg-amber-400' : 'bg-rose-500'
            }`}
            style={{ width: `${gaugePercent}%` }}
          />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-[9px] text-slate-500 mt-1">
          <span>0 dB (Floor)</span>
          <span className="text-rose-400/80">12 dB</span>
          <span className="text-amber-400/80">22 dB</span>
          <span className="text-emerald-400/80">32 dB (Max)</span>
        </div>
      </div>

      {/* Degradation Noise Artifacts Breakdown */}
      <div className="space-y-1.5 mb-2.5 font-mono text-[11px]">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>Degradation Artifacts Breakdown</span>
          <span className="text-slate-500">Decibel Penalties</span>
        </div>

        {/* Atmospheric Scattering */}
        <div className="flex justify-between items-center text-slate-300">
          <span className="text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            Atmospheric Scatter (Fog/Haze)
          </span>
          <span className="text-rose-400 font-semibold tabular-nums">
            {scatteringLossDb !== 0 ? `${scatteringLossDb} dB` : '0 dB'}
          </span>
        </div>

        {/* Gimbal Jitter */}
        <div className="flex justify-between items-center text-slate-300">
          <span className="text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Camera Jitter / Motion Blur
          </span>
          <span className="text-rose-400 font-semibold tabular-nums">
            {jitterLossDb !== 0 ? `${jitterLossDb} dB` : '0 dB'}
          </span>
        </div>

        {/* Low-Light Photonic Shot Noise */}
        <div className="flex justify-between items-center text-slate-300">
          <span className="text-slate-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Photonic / Shot Noise
          </span>
          <span className="text-rose-400 font-semibold tabular-nums">
            {photonicLossDb !== 0 ? `${photonicLossDb} dB` : '0 dB'}
          </span>
        </div>

        {/* Thermal AGC Compensation Bonus */}
        {thermalGainBonusDb > 0 && (
          <div className="flex justify-between items-center text-slate-300 pt-0.5 border-t border-slate-800/80">
            <span className="text-emerald-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              FLIR Gain / PEQ Recovery
            </span>
            <span className="text-emerald-400 font-bold tabular-nums">
              +{thermalGainBonusDb} dB
            </span>
          </div>
        )}
      </div>

      {/* Target Tracking Pipeline Impact Callout */}
      <div className="p-2 bg-slate-900/80 border border-slate-800 rounded font-mono text-[10px]">
        <div className="text-slate-400 mb-0.5">ACTIVE MOT TRACKING REGIME:</div>
        <div className={`font-semibold ${statusColor}`}>
          {motMode}
        </div>
        <div className="text-[9px] text-slate-400 mt-0.5 font-sans">
          {status === 'OPTIMAL' && 'Direct IoU matching nominal; detections exceed high threshold τ=0.55.'}
          {status === 'DEGRADED' && 'ByteTrack stage-2 association salvaging low-confidence detections (0.18 ≤ score < 0.55).'}
          {status === 'CRITICAL' && 'Severe signal occlusion; Extended Kalman Filter coasting velocities to preserve track IDs.'}
        </div>
      </div>
    </div>
  );
};

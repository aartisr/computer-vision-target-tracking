import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HardwareDevice, QuantizationPrecision } from '../types/tactical';
import { calculateEdgeHealth } from '../lib/edgeHealthSimulation';
import { HARDWARE_PLATFORMS } from '../lib/edgeProfilerData';
import { Flame, Zap, Cpu, ChevronDown, CheckCircle2, Activity, Terminal, AlertTriangle, TrendingUp } from 'lucide-react';

export interface HardwareHealthIndicatorProps {
  activeDevice?: HardwareDevice;
  onChangeDevice?: (device: HardwareDevice) => void;
  precision?: QuantizationPrecision;
  isStreaming?: boolean;
  className?: string;
}

interface PowerHistorySample {
  second: number; // 0..59 relative second offset
  watts: number;
  isSpike: boolean;
  timestamp: number;
}

export const HardwareHealthIndicator: React.FC<HardwareHealthIndicatorProps> = ({
  activeDevice = 'orin_nano',
  onChangeDevice = () => {},
  precision = 'INT8',
  isStreaming = true,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [timeCounter, setTimeCounter] = useState(0);
  const [hoveredSampleIndex, setHoveredSampleIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Rolling 60-second power history buffer
  const [powerHistory, setPowerHistory] = useState<PowerHistorySample[]>(() => {
    // Generate initial 60 seconds of realistic telemetry
    const initial: PowerHistorySample[] = [];
    const baseW = activeDevice === 'orin_agx' ? 18.5 : activeDevice === 'orin_nano' ? 9.8 : activeDevice === 'rpi5_hailo' ? 5.2 : 9.5;
    const now = Date.now();
    for (let i = 59; i >= 0; i--) {
      // Occasional simulated inference spikes
      const isSpike = i % 18 === 0 || i === 4;
      const spikeBonus = isSpike ? (activeDevice === 'orin_agx' ? 12.0 : 3.4) : 0;
      const noise = (Math.sin(i * 0.4) * 0.8) + (Math.cos(i * 0.9) * 0.4);
      const w = parseFloat(Math.max(1.5, baseW + noise + spikeBonus).toFixed(1));
      initial.push({
        second: 59 - i,
        watts: w,
        isSpike,
        timestamp: now - i * 1000,
      });
    }
    return initial;
  });

  // Re-seed history on device switch
  useEffect(() => {
    const baseW = activeDevice === 'orin_agx' ? 18.5 : activeDevice === 'orin_nano' ? 9.8 : activeDevice === 'rpi5_hailo' ? 5.2 : 9.5;
    const now = Date.now();
    const seeded: PowerHistorySample[] = [];
    for (let i = 59; i >= 0; i--) {
      const isSpike = i % 20 === 0 || i === 8;
      const spikeBonus = isSpike ? (activeDevice === 'orin_agx' ? 11.5 : 3.2) : 0;
      const noise = Math.sin(i * 0.5) * 0.7;
      seeded.push({
        second: 59 - i,
        watts: parseFloat(Math.max(1.5, baseW + noise + spikeBonus).toFixed(1)),
        isSpike,
        timestamp: now - i * 1000,
      });
    }
    setPowerHistory(seeded);
  }, [activeDevice]);

  // Periodic telemetry tick
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeCounter(t => t + 0.5);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Update rolling 60s history buffer every 1 second
  useEffect(() => {
    const historyTimer = setInterval(() => {
      setPowerHistory(prev => {
        const { health } = calculateEdgeHealth(activeDevice, precision, isStreaming, timeCounter);
        const lastWatts = health.powerWatts;
        
        // Spike detection: if power is >= 80% TDP or 25% above recent average
        const recentAvg = prev.slice(-10).reduce((acc, p) => acc + p.watts, 0) / Math.max(1, prev.slice(-10).length);
        const isSpike = lastWatts > recentAvg * 1.22 || lastWatts >= health.maxPowerWatts * 0.85;

        const newSample: PowerHistorySample = {
          second: 60,
          watts: lastWatts,
          isSpike,
          timestamp: Date.now(),
        };

        const updated = [...prev.slice(1), newSample].map((sample, idx) => ({
          ...sample,
          second: idx,
        }));
        return updated;
      });
    }, 1000);

    return () => clearInterval(historyTimer);
  }, [activeDevice, precision, isStreaming, timeCounter]);

  // Dismiss dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { health, rawTelemetrySnippet } = calculateEdgeHealth(
    activeDevice,
    precision,
    isStreaming,
    timeCounter
  );

  const deviceShortLabel =
    activeDevice === 'orin_nano'
      ? 'Orin Nano'
      : activeDevice === 'orin_agx'
      ? 'AGX Orin'
      : activeDevice === 'rpi5_hailo'
      ? 'RPi 5+Hailo'
      : 'RPi 5 CPU';

  const tempColor =
    health.gpuTempC >= 75
      ? 'text-rose-400'
      : health.gpuTempC >= 60
      ? 'text-amber-300'
      : 'text-emerald-400';

  const isJetson = activeDevice.startsWith('orin');

  // Sparkline calculations (60 seconds)
  const sparklineStats = useMemo(() => {
    if (powerHistory.length === 0) return { min: 0, max: 15, avg: 0, peak: 0, spikeCount: 0 };
    const wattsList = powerHistory.map(p => p.watts);
    const min = Math.min(...wattsList);
    const peak = Math.max(...wattsList);
    const sum = wattsList.reduce((acc, w) => acc + w, 0);
    const avg = parseFloat((sum / wattsList.length).toFixed(1));
    const spikeCount = powerHistory.filter(p => p.isSpike).length;
    // Upper boundary scales to maximum between peak or TDP limit
    const maxBound = Math.max(health.maxPowerWatts, peak * 1.1);
    return { min, max: maxBound, avg, peak, spikeCount };
  }, [powerHistory, health.maxPowerWatts]);

  // Generate SVG path for mini sparkline (w=52, h=14)
  const miniSparklinePoints = useMemo(() => {
    const w = 52;
    const h = 14;
    const max = sparklineStats.max || 15;
    return powerHistory
      .map((pt, idx) => {
        const x = (idx / Math.max(1, powerHistory.length - 1)) * w;
        const y = h - Math.max(1, (pt.watts / max) * h);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [powerHistory, sparklineStats.max]);

  // Generate SVG path for expanded sparkline (viewBox: 320x70)
  const expandedGraph = useMemo(() => {
    const w = 320;
    const h = 70;
    const max = sparklineStats.max || 15;

    const coords = powerHistory.map((pt, idx) => {
      const x = (idx / Math.max(1, powerHistory.length - 1)) * w;
      const y = h - Math.max(2, (pt.watts / max) * (h - 8));
      return { x, y, pt };
    });

    const polyline = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const areaPath = `M 0,${h} L ${polyline} L ${w},${h} Z`;
    const tdpY = h - (health.maxPowerWatts / max) * (h - 8);

    return { coords, polyline, areaPath, tdpY, w, h };
  }, [powerHistory, sparklineStats.max, health.maxPowerWatts]);

  return (
    <div className={`relative font-mono ${className}`} ref={containerRef}>
      {/* Persistent Top-Bar Health Pill with Mini Sparkline */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Edge Hardware Health: Click for 60s power telemetry & spike analysis"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="flex items-center gap-2 px-2.5 py-1 bg-slate-900/95 hover:bg-slate-800/90 border border-slate-700/80 hover:border-cyan-500/50 rounded transition-all text-xs text-slate-300 hover:text-white cursor-pointer select-none shadow-sm"
      >
        {/* Device Tag */}
        <span className="font-semibold text-cyan-300 text-[11px] uppercase tracking-wide">
          {deviceShortLabel}
        </span>

        <span className="text-slate-600 hidden sm:inline" aria-hidden="true">·</span>

        {/* GPU Temperature */}
        <span className="flex items-center gap-1 text-[11px]">
          <Flame className={`w-3 h-3 ${tempColor} shrink-0`} />
          <span className="text-slate-400 hidden md:inline">GPU:</span>
          <strong className={`${tempColor} tabular-nums font-semibold`}>
            {health.gpuTempC}°C
          </strong>
        </span>

        <span className="text-slate-600" aria-hidden="true">·</span>

        {/* Power Watts + Mini Real-Time Sparkline */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <Zap className="w-3 h-3 text-amber-300 shrink-0" />
          <span className="text-slate-400 hidden md:inline">PWR:</span>
          <strong className="text-slate-100 tabular-nums font-semibold">
            {health.powerWatts}W
          </strong>

          {/* Mini 60s Trend Sparkline */}
          <svg className="w-13 h-3.5 shrink-0 overflow-visible" viewBox="0 0 52 14" aria-hidden="true">
            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={miniSparklinePoints}
            />
            {/* Last active point dot */}
            {powerHistory.length > 0 && (
              <circle
                cx="52"
                cy={14 - Math.max(1, (health.powerWatts / sparklineStats.max) * 14)}
                r="1.8"
                className="fill-amber-400"
              />
            )}
          </svg>
        </div>

        <span className="text-slate-600 hidden lg:inline" aria-hidden="true">·</span>

        {/* CPU Utilization */}
        <span className="hidden lg:flex items-center gap-1 text-[11px]">
          <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
          <span className="text-slate-400">CPU:</span>
          <strong className="text-cyan-200 tabular-nums font-semibold">
            {health.cpuUtilPercent}%
          </strong>
        </span>

        {/* Throttling Badge */}
        <span
          className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase tracking-wider ${
            health.throttleStatus === 'NOMINAL'
              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
          }`}
        >
          {health.throttleStatus === 'NOMINAL' ? 'NOM' : 'THROT'}
        </span>

        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Flyout Hardware Diagnostic Dossier & 60s Power Sparkline */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-92 bg-[#090e1b] border border-cyan-500/40 rounded-lg shadow-2xl p-3.5 z-50 text-xs animate-in fade-in slide-in-from-top-1 duration-150 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-slate-100 text-xs font-mono uppercase">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Edge Hardware Health Monitor</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Sustained 60+ FPS
            </span>
          </div>

          {/* Target Architecture Selector */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block mb-1">
              Active Hardware Deployment Target
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(HARDWARE_PLATFORMS) as HardwareDevice[]).map(devId => {
                const spec = HARDWARE_PLATFORMS[devId];
                const isSelected = activeDevice === devId;
                return (
                  <button
                    key={devId}
                    onClick={() => onChangeDevice(devId)}
                    className={`px-2 py-1.5 text-left rounded text-[11px] transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 font-semibold'
                        : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <div className="truncate">{spec.name.split(' (')[0]}</div>
                    <div className="text-[9px] text-slate-500 font-mono">{spec.tdpWatts}W TDP · {spec.tops} TOPS</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ============================================================== */}
          {/* ROLLING 60-SECOND POWER SPARKLINE & INFERENCE SPIKE ANALYZER */}
          {/* ============================================================== */}
          <div className="p-2.5 bg-slate-950/90 border border-slate-800/90 rounded-lg mb-3">
            <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
              <span className="font-semibold text-amber-300 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                ROLLING 60-SEC POWER CONSUMPTION
              </span>
              <span className="text-[10px] text-slate-400">
                Peak: <strong className="text-white">{sparklineStats.peak}W</strong>
              </span>
            </div>

            {/* Sparkline Canvas Area */}
            <div className="relative w-full h-[74px] bg-[#060a14] border border-slate-800/80 rounded overflow-hidden p-1">
              <svg
                className="w-full h-full overflow-visible"
                viewBox={`0 0 ${expandedGraph.w} ${expandedGraph.h}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* TDP Limit Guideline (Red Dashed) */}
                <line
                  x1="0"
                  y1={expandedGraph.tdpY}
                  x2={expandedGraph.w}
                  y2={expandedGraph.tdpY}
                  stroke="#ef4444"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                  opacity="0.6"
                />

                {/* Gradient area fill under curve */}
                <path d={expandedGraph.areaPath} fill="url(#powerGradient)" />

                {/* Primary power history polyline */}
                <polyline
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={expandedGraph.polyline}
                />

                {/* Inference Spike Highlight Markers */}
                {expandedGraph.coords
                  .filter(c => c.pt.isSpike)
                  .map((c, i) => (
                    <circle
                      key={`spike-${i}`}
                      cx={c.x}
                      cy={c.y}
                      r="2.5"
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="0.8"
                    />
                  ))}

                {/* Hover indicator point */}
                {hoveredSampleIndex !== null && expandedGraph.coords[hoveredSampleIndex] && (
                  <g>
                    <line
                      x1={expandedGraph.coords[hoveredSampleIndex].x}
                      y1="0"
                      x2={expandedGraph.coords[hoveredSampleIndex].x}
                      y2={expandedGraph.h}
                      stroke="#38bdf8"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={expandedGraph.coords[hoveredSampleIndex].x}
                      cy={expandedGraph.coords[hoveredSampleIndex].y}
                      r="3.5"
                      fill="#38bdf8"
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                  </g>
                )}
              </svg>

              {/* Interactive Hover Scrub Surface */}
              <div
                className="absolute inset-0 cursor-crosshair"
                onMouseMove={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  const sampleIdx = Math.min(powerHistory.length - 1, Math.floor(relX * powerHistory.length));
                  setHoveredSampleIndex(sampleIdx);
                }}
                onMouseLeave={() => setHoveredSampleIndex(null)}
              />

              {/* TDP Label watermark on chart */}
              <div className="absolute top-1 right-1.5 text-[9px] font-mono text-rose-400/80 pointer-events-none">
                TDP Limit {health.maxPowerWatts}W
              </div>
            </div>

            {/* Time Axis Markers */}
            <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1 px-0.5">
              <span>-60s</span>
              <span>-45s</span>
              <span>-30s</span>
              <span>-15s</span>
              <span className="text-amber-400 font-bold">NOW ({health.powerWatts}W)</span>
            </div>

            {/* Rolling Statistics & Spike Summary Bar */}
            <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-slate-800/80 text-[10px] font-mono">
              <div className="bg-slate-900/60 p-1.5 rounded text-center">
                <span className="text-slate-400 block text-[9px]">60S AVERAGE</span>
                <strong className="text-slate-200 tabular-nums">{sparklineStats.avg} W</strong>
              </div>
              <div className="bg-slate-900/60 p-1.5 rounded text-center">
                <span className="text-slate-400 block text-[9px]">PEAK SPIKE</span>
                <strong className="text-amber-300 tabular-nums">{sparklineStats.peak} W</strong>
              </div>
              <div className="bg-slate-900/60 p-1.5 rounded text-center">
                <span className="text-slate-400 block text-[9px]">SPIKES DETECTED</span>
                <strong className={`tabular-nums ${sparklineStats.spikeCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {sparklineStats.spikeCount} bursts
                </strong>
              </div>
            </div>

            {/* Hovered Time Window Inspection Tooltip */}
            {hoveredSampleIndex !== null && powerHistory[hoveredSampleIndex] && (
              <div className="mt-1.5 p-1 bg-cyan-950/40 border border-cyan-800/50 rounded text-[10px] font-mono text-cyan-200 flex justify-between items-center">
                <span>
                  T-{60 - hoveredSampleIndex}s ({new Date(powerHistory[hoveredSampleIndex].timestamp).toLocaleTimeString()})
                </span>
                <span className="font-bold text-white">
                  {powerHistory[hoveredSampleIndex].watts} W
                  {powerHistory[hoveredSampleIndex].isSpike && (
                    <span className="text-rose-400 ml-1.5 font-bold">[INFERENCE BURST]</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Granular Hardware Health Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-950/80 border border-slate-800/80 rounded mb-3 text-[11px] font-mono">
            <div>
              <span className="text-slate-500 text-[10px]">GPU / SoC Thermal:</span>
              <div className="text-slate-100 font-bold flex items-center gap-1 mt-0.5">
                <Flame className={`w-3 h-3 ${tempColor}`} />
                <span className={tempColor}>{health.gpuTempC}°C</span>
                <span className="text-[9px] text-slate-400 font-normal">
                  ({Math.max(0, 85 - health.gpuTempC).toFixed(1)}°C margin)
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Power Rail Voltage:</span>
              <div className="text-slate-300 font-bold mt-0.5">
                {health.voltageV}V · {health.currentA}A
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Compute Utilization:</span>
              <div className="text-cyan-300 font-bold mt-0.5">
                CPU: {health.cpuUtilPercent}% · GPU: {health.gpuUtilPercent}%
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Fan / Active Cooling:</span>
              <div className="text-slate-200 font-bold mt-0.5">
                {health.fanRpm} RPM <span className="text-[9px] text-slate-400 font-normal">(PWM)</span>
              </div>
            </div>
          </div>

          {/* Raw Diagnostic Buffer (tegrastats / vcgencmd) */}
          <div className="bg-black/90 border border-slate-800 rounded p-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1 font-mono">
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>{isJetson ? 'NVIDIA tegrastats buffer' : 'Raspberry Pi vcgencmd buffer'}</span>
            </div>
            <pre className="text-[10px] text-cyan-300/90 whitespace-pre-wrap break-all font-mono leading-tight">
              {rawTelemetrySnippet}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

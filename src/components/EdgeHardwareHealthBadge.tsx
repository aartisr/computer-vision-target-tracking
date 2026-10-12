import React, { useState, useRef, useEffect } from 'react';
import { HardwareDevice, QuantizationPrecision } from '../types/tactical';
import { calculateEdgeHealth } from '../lib/edgeHealthSimulation';
import { HARDWARE_PLATFORMS } from '../lib/edgeProfilerData';
import { Flame, Zap, Cpu, Activity, ChevronDown, CheckCircle2, AlertTriangle, Terminal } from 'lucide-react';

interface EdgeHardwareHealthBadgeProps {
  activeDevice: HardwareDevice;
  onChangeDevice: (device: HardwareDevice) => void;
  precision?: QuantizationPrecision;
  isStreaming?: boolean;
}

export const EdgeHardwareHealthBadge: React.FC<EdgeHardwareHealthBadgeProps> = ({
  activeDevice,
  onChangeDevice,
  precision = 'INT8',
  isStreaming = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [timeCounter, setTimeCounter] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Micro-telemetry tick
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeCounter(t => t + 0.5);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  // Close dropdown on outside click
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

  const deviceShortName =
    activeDevice === 'orin_nano'
      ? 'JETSON ORIN NANO'
      : activeDevice === 'orin_agx'
      ? 'JETSON AGX ORIN'
      : activeDevice === 'rpi5_hailo'
      ? 'RPI 5 + HAILO'
      : 'RPI 5 CPU';

  const tempColor =
    health.gpuTempC >= 75
      ? 'text-rose-400'
      : health.gpuTempC >= 60
      ? 'text-amber-300'
      : 'text-emerald-400';

  const isJetson = activeDevice.startsWith('orin');

  return (
    <div className="relative font-mono" ref={containerRef}>
      {/* HUD Top-Bar Metric Capsule Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="View Edge Hardware Health & Telemetry"
        className="flex items-center gap-2 px-2.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded transition-colors text-[11px] text-slate-300 hover:text-white cursor-pointer select-none shadow-sm"
      >
        {/* Device Label */}
        <span className="font-bold text-cyan-300 tracking-wider">
          [{deviceShortName}]
        </span>

        <span className="text-slate-600">·</span>

        {/* GPU/SoC Temp */}
        <span className="flex items-center gap-1">
          <Flame className={`w-3 h-3 ${tempColor}`} />
          <strong className={`${tempColor} tabular-nums font-semibold`}>
            {health.gpuTempC}°C
          </strong>
        </span>

        <span className="text-slate-600">·</span>

        {/* Power Watts */}
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-300" />
          <strong className="text-slate-100 tabular-nums font-semibold">
            {health.powerWatts}W
          </strong>
          <span className="text-[10px] text-slate-500">/{health.maxPowerWatts}W</span>
        </span>

        <span className="text-slate-600">·</span>

        {/* CPU Util */}
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-cyan-400" />
          <strong className="text-cyan-200 tabular-nums">
            {health.cpuUtilPercent}%
          </strong>
        </span>

        {/* Thermal Throttling Status Flag */}
        <span
          className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider ${
            health.throttleStatus === 'NOMINAL'
              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
          }`}
        >
          {health.throttleStatus === 'NOMINAL' ? 'NOM' : 'THROT'}
        </span>

        <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
      </button>

      {/* Flyout Tactical Dossier for Edge Hardware */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-84 bg-[#090e1b] border border-cyan-500/40 rounded-lg shadow-2xl p-3 z-50 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5 font-bold text-slate-100 text-[11px] uppercase">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Edge Hardware Health Monitor</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Sustained 60+ FPS
            </span>
          </div>

          {/* Quick Hardware Target Switcher */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
              Target Edge Platform
            </label>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              {(Object.keys(HARDWARE_PLATFORMS) as HardwareDevice[]).map(devId => (
                <button
                  key={devId}
                  onClick={() => {
                    onChangeDevice(devId);
                  }}
                  className={`px-2 py-1 text-left rounded transition-colors ${
                    activeDevice === devId
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="truncate">{HARDWARE_PLATFORMS[devId].name.split(' (')[0]}</div>
                  <div className="text-[9px] text-slate-500">{HARDWARE_PLATFORMS[devId].tdpWatts}W TDP</div>
                </button>
              ))}
            </div>
          </div>

          {/* Granular Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/80 border border-slate-800/80 rounded mb-3 text-[11px] font-mono">
            <div>
              <span className="text-slate-500 text-[10px]">SoC Temperature:</span>
              <div className="text-slate-100 font-bold flex items-center gap-1 mt-0.5">
                <Flame className={`w-3 h-3 ${tempColor}`} />
                <span className={tempColor}>{health.gpuTempC}°C</span>
                <span className="text-[9px] text-slate-400 font-normal">
                  ({Math.max(0, 85 - health.gpuTempC).toFixed(1)}°C margin)
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Power Consumption:</span>
              <div className="text-amber-300 font-bold flex items-center gap-1 mt-0.5">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>{health.powerWatts}W</span>
                <span className="text-[9px] text-slate-400 font-normal">
                  ({Math.round((health.powerWatts / health.maxPowerWatts) * 100)}% TDP)
                </span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Compute Utilization:</span>
              <div className="text-cyan-300 font-bold mt-0.5">
                CPU: {health.cpuUtilPercent}% · GPU: {health.gpuUtilPercent}%
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Cooling / Fan:</span>
              <div className="text-slate-200 font-bold mt-0.5">
                {health.fanRpm} RPM <span className="text-[9px] text-slate-400 font-normal">(PWM active)</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Power Rail Voltage:</span>
              <div className="text-slate-300 font-bold mt-0.5">
                {health.voltageV}V / {health.currentA}A
              </div>
            </div>

            <div>
              <span className="text-slate-500 text-[10px]">Throttling State:</span>
              <div className="text-emerald-400 font-bold mt-0.5">
                {health.throttleStatus}
              </div>
            </div>
          </div>

          {/* Raw Diagnostics Telemetry Readout (tegrastats / vcgencmd) */}
          <div className="bg-black/90 border border-slate-800 rounded p-2">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-1">
              <Terminal className="w-3 h-3 text-cyan-400" />
              <span>{isJetson ? 'NVIDIA tegrastats live buffer' : 'Raspberry Pi vcgencmd diagnostic buffer'}</span>
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

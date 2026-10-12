import React, { useState } from 'react';
import {
  HardwareDevice,
  QuantizationPrecision,
} from '../types/tactical';
import {
  HARDWARE_PLATFORMS,
  DETAILED_LAYERS,
  getEdgeMetrics,
} from '../lib/edgeProfilerData';
import { Cpu, Zap, Activity, Flame, Layers, Terminal, CheckCircle2 } from 'lucide-react';

interface EdgeProfilerPanelProps {
  onOpenExportModal: () => void;
  selectedDevice?: HardwareDevice;
  onSelectDevice?: (device: HardwareDevice) => void;
  selectedPrecision?: QuantizationPrecision;
  onSelectPrecision?: (precision: QuantizationPrecision) => void;
}

export const EdgeProfilerPanel: React.FC<EdgeProfilerPanelProps> = ({
  onOpenExportModal,
  selectedDevice: propDevice,
  onSelectDevice,
  selectedPrecision: propPrecision,
  onSelectPrecision,
}) => {
  const [internalDevice, setInternalDevice] = useState<HardwareDevice>('orin_nano');
  const [internalPrecision, setInternalPrecision] = useState<QuantizationPrecision>('INT8');
  const [selectedModel, setSelectedModel] = useState<string>('YOLOv8n-Maritime + ByteTrack');

  const selectedDevice = propDevice ?? internalDevice;
  const setSelectedDevice = onSelectDevice ?? setInternalDevice;

  const selectedPrecision = propPrecision ?? internalPrecision;
  const setSelectedPrecision = onSelectPrecision ?? setInternalPrecision;

  const currentSpec = HARDWARE_PLATFORMS[selectedDevice];
  const metrics = getEdgeMetrics(selectedDevice, selectedPrecision, selectedModel);

  return (
    <div className="flex flex-col h-full bg-[#090e1b] border border-slate-800 rounded-lg text-slate-200 text-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800/80 bg-[#0c1222]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-slate-100 uppercase tracking-wider text-xs">
              TensorRT Edge Inference & Quantization Profiler
            </h3>
          </div>
          <button
            onClick={onOpenExportModal}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800/60 rounded transition-colors"
          >
            <Terminal className="w-3 h-3" />
            <span>Generate C++ Engine</span>
          </button>
        </div>

        {/* Target Hardware Selector Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded border border-slate-800">
          {(Object.keys(HARDWARE_PLATFORMS) as HardwareDevice[]).map(devId => {
            const spec = HARDWARE_PLATFORMS[devId];
            const isSelected = selectedDevice === devId;
            return (
              <button
                key={devId}
                onClick={() => setSelectedDevice(devId)}
                className={`p-2 text-left rounded transition-colors ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <div className="font-semibold text-[11px] truncate">{spec.name}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {spec.tops} TOPS · {spec.tdpWatts}W TDP
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Precision & Model Selector Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">
              Active CV Pipeline Model
            </label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="YOLOv8n-Maritime + ByteTrack">YOLOv8n-Maritime + ByteTrack (Recommended)</option>
              <option value="MobileNetV4-AirSea + DeepSORT">MobileNetV4-AirSea + DeepSORT</option>
              <option value="RT-DETR-Tiny + EKF">RT-DETR-Tiny + EKF</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">
              TensorRT Precision Quantization
            </label>
            <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded border border-slate-800">
              {(['FP32', 'FP16', 'INT8'] as QuantizationPrecision[]).map(prec => (
                <button
                  key={prec}
                  onClick={() => setSelectedPrecision(prec)}
                  className={`px-3 py-1 font-mono text-xs font-semibold rounded transition-colors ${
                    selectedPrecision === prec
                      ? prec === 'INT8'
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {prec}
                  {prec === 'INT8' && ' (60+ FPS)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4-KPI Tactical Benchmarking Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* FPS */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span className="flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Pipeline FPS
              </span>
              <span className={`text-[10px] font-mono font-bold ${metrics.fps >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.fps >= 60 ? '60+ TARGET MET' : 'SUB-60 FPS'}
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {metrics.fps} <span className="text-xs text-slate-400 font-normal">frames/s</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              Latency: {metrics.latencyMs}ms (P99: {metrics.p99LatencyMs}ms)
            </div>
          </div>

          {/* Power Draw */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Power Consumption
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                TDP {currentSpec.tdpWatts}W
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300 tabular-nums">
              {metrics.powerWatts} <span className="text-xs text-slate-400 font-normal">Watts</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              Power profile: {currentSpec.defaultPowerMode}
            </div>
          </div>

          {/* Memory Footprint */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                VRAM / Memory
              </span>
              <span className="text-[10px] font-mono text-emerald-400">
                {(metrics.memoryMb / 1024).toFixed(1)} GB
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
              {metrics.memoryMb} <span className="text-xs text-slate-400 font-normal">MB</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              Model mAP 50:95: {metrics.map50_95}%
            </div>
          </div>

          {/* Temperature & Compute Load */}
          <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                Junction Temp
              </span>
              <span className="text-[10px] font-mono text-slate-300">
                GPU {metrics.gpuUtilization}%
              </span>
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
              {metrics.temperatureC}°C
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">
              {metrics.dlaUtilization > 0 ? `DLA Cores: ${metrics.dlaUtilization}% Load` : 'GPU Compute Mode'}
            </div>
          </div>
        </div>

        {/* Quantization Tradeoff Comparison Table */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Quantization Precision Benchmarking Matrix
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              Entropy Post-Training Quantization (PTQ)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                  <th className="py-1.5 px-2">PRECISION</th>
                  <th className="py-1.5 px-2 text-right">LATENCY</th>
                  <th className="py-1.5 px-2 text-right">FPS</th>
                  <th className="py-1.5 px-2 text-right">POWER</th>
                  <th className="py-1.5 px-2 text-right">MEMORY</th>
                  <th className="py-1.5 px-2 text-right">ACCURACY (mAP)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {(['FP32', 'FP16', 'INT8'] as QuantizationPrecision[]).map(p => {
                  const bench = getEdgeMetrics(selectedDevice, p, selectedModel);
                  const isCur = selectedPrecision === p;
                  return (
                    <tr
                      key={p}
                      onClick={() => setSelectedPrecision(p)}
                      className={`cursor-pointer transition-colors ${
                        isCur ? 'bg-cyan-950/40 text-cyan-200' : 'hover:bg-slate-900/50 text-slate-400'
                      }`}
                    >
                      <td className="py-2 px-2 font-bold flex items-center gap-1.5">
                        {p}
                        {p === 'INT8' && (
                          <span className="text-[9px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 rounded px-1.5 py-0.2">
                            Optimal
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-white">
                        {bench.latencyMs} ms
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold text-emerald-400">
                        {bench.fps} FPS
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-amber-300">
                        {bench.powerWatts} W
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {bench.memoryMb} MB
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-200">
                        {bench.map50_95}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Layer-by-Layer Execution Waterfall */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider">
              Layer-by-Layer Execution Waterfall ({selectedPrecision} Engine)
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              CUDA Streams & DLA Engine Dispatches
            </span>
          </div>

          <div className="space-y-2 font-mono text-[11px]">
            {DETAILED_LAYERS.map(layer => {
              const layerMs =
                selectedPrecision === 'FP32'
                  ? layer.fp32Ms
                  : selectedPrecision === 'FP16'
                  ? layer.fp16Ms
                  : layer.int8Ms;
              const barPercent = Math.min(100, (layerMs / 7.0) * 100);

              return (
                <div key={layer.name} className="p-2 bg-slate-900/70 border border-slate-800/80 rounded">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200 truncate max-w-[280px]">
                      {layer.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                        {layer.engine}
                      </span>
                      <span className="text-cyan-300 font-bold tabular-nums">
                        {layerMs.toFixed(2)} ms
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        selectedPrecision === 'INT8'
                          ? 'bg-emerald-400'
                          : selectedPrecision === 'FP16'
                          ? 'bg-cyan-400'
                          : 'bg-indigo-400'
                      }`}
                      style={{ width: `${barPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

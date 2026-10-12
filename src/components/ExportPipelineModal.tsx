import React, { useState } from 'react';
import { X, Copy, Check, Terminal, Code, Cpu } from 'lucide-react';
import { generateCppTensorRTSnippet } from '../lib/edgeProfilerData';
import { HardwareDevice, QuantizationPrecision } from '../types/tactical';

interface ExportPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportPipelineModal: React.FC<ExportPipelineModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [device, setDevice] = useState<HardwareDevice>('orin_nano');
  const [precision, setPrecision] = useState<QuantizationPrecision>('INT8');
  const [activeTab, setActiveTab] = useState<'cpp' | 'trtexec' | 'pytorch'>('cpp');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const cppCode = generateCppTensorRTSnippet(device, precision);

  const trtexecCmd = `# ==============================================================================
# Compile Optimized TensorRT INT8 Engine for NVIDIA Jetson / Edge Accelerator
# ==============================================================================

# 1. Run TensorRT Model Optimizer & Post-Training Quantization (PTQ)
trtexec \\
  --onnx=yolov8n_maritime.onnx \\
  --saveEngine=yolov8n_maritime_${precision.toLowerCase()}_${device}.engine \\
  --${precision.toLowerCase()} \\
  --memPoolSize=workspace:1024MiB \\
  --useDLACore=0 \\
  --allowGPUFallback \\
  --warmUp=200 \\
  --iterations=1000 \\
  --dumpProfile \\
  --separateProfileRun

# 2. Benchmark sustained throughput on edge device
# Verified Target: 60+ FPS sustained at < 15W TDP`;

  const pytorchExportCode = `# ==============================================================================
# PyTorch to ONNX Export with Dynamic Shapes & Explicit Batching
# ==============================================================================
import torch
from ultralytics import YOLO

# Load Maritime & Aerial Fine-Tuned Model
model = YOLO('yolov8n_maritime.pt')

# Export to ONNX with TensorRT-compatible Half & INT8 ops
model.export(
    format='onnx',
    dynamic=True,
    simplify=True,
    opset=17,
    half=${precision === 'FP16' ? 'True' : 'False'},
    nms=True  # Export with TensorRT EfficientNMS plugin
)
print("ONNX graph serialized for TensorRT Edge Compilation.")`;

  const getActiveCode = () => {
    if (activeTab === 'cpp') return cppCode;
    if (activeTab === 'trtexec') return trtexecCmd;
    return pytorchExportCode;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-3xl bg-[#090e1b] border border-cyan-500/40 rounded-lg shadow-2xl overflow-hidden font-sans text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0c1322] border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-slate-100 uppercase tracking-wider text-xs font-mono">
              EDGE TENSORRT & C++ BYTETRACK PIPELINE EXPORT
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Configuration Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-mono text-[11px]">Hardware:</span>
            <select
              value={device}
              onChange={e => setDevice(e.target.value as HardwareDevice)}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none"
            >
              <option value="orin_nano">NVIDIA Jetson Orin Nano (15W)</option>
              <option value="orin_agx">NVIDIA Jetson AGX Orin (60W)</option>
              <option value="rpi5_hailo">Raspberry Pi 5 + Hailo-8 HAT</option>
              <option value="rpi5_cpu">Raspberry Pi 5 (CPU ONNX)</option>
            </select>

            <span className="text-slate-400 font-mono text-[11px] ml-2">Precision:</span>
            <select
              value={precision}
              onChange={e => setPrecision(e.target.value as QuantizationPrecision)}
              className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none"
            >
              <option value="INT8">INT8 (60+ FPS PTQ)</option>
              <option value="FP16">FP16 (Half Precision)</option>
              <option value="FP32">FP32 (Full Precision)</option>
            </select>
          </div>

          {/* Sub-tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded border border-slate-800">
            <button
              onClick={() => setActiveTab('cpp')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                activeTab === 'cpp' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              C++ ByteTrack
            </button>
            <button
              onClick={() => setActiveTab('trtexec')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                activeTab === 'trtexec' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              trtexec CLI
            </button>
            <button
              onClick={() => setActiveTab('pytorch')}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                activeTab === 'pytorch' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              PyTorch Export
            </button>
          </div>
        </div>

        {/* Code Content Viewport */}
        <div className="relative p-4 max-h-[50vh] overflow-y-auto bg-[#050811]">
          <button
            onClick={handleCopy}
            className="absolute top-6 right-6 flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-mono rounded border border-slate-700 transition-colors shadow-lg z-10"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Snippet'}</span>
          </button>

          <pre className="font-mono text-xs text-slate-300 leading-relaxed overflow-x-auto p-2">
            <code>{getActiveCode()}</code>
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#0c1322] border-t border-slate-800 text-xs">
          <span className="text-slate-400 font-mono text-[11px]">
            Targeting 60+ FPS on edge hardware with zero external dependencies.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

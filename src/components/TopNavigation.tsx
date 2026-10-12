import React from 'react';
import { ShieldAlert, Cpu, Crosshair, Navigation, Play, Pause, Camera } from 'lucide-react';
import { OperationalDomain, HardwareDevice, QuantizationPrecision } from '../types/tactical';
import { HardwareHealthIndicator } from './HardwareHealthIndicator';

interface TopNavigationProps {
  activeDomain: OperationalDomain;
  onSelectDomain: (domain: OperationalDomain) => void;
  activeTab: 'hud' | 'profiler' | 'navigation' | 'code';
  onSelectTab: (tab: 'hud' | 'profiler' | 'navigation' | 'code') => void;
  isStreaming: boolean;
  onToggleStreaming: () => void;
  onOpenExportModal: () => void;
  isWebcamActive: boolean;
  onToggleWebcam: () => void;
  activeDevice?: HardwareDevice;
  onChangeDevice?: (device: HardwareDevice) => void;
  precision?: QuantizationPrecision;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({
  activeDomain,
  onSelectDomain,
  activeTab,
  onSelectTab,
  isStreaming,
  onToggleStreaming,
  onOpenExportModal,
  isWebcamActive,
  onToggleWebcam,
  activeDevice = 'orin_nano',
  onChangeDevice = () => {},
  precision = 'INT8',
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#090e1a] border-b border-slate-800 text-slate-200 select-none">
      {/* Zone 1: Brand Wordmark (Single text element wordmark) */}
      <div className="flex items-center gap-3 shrink-0">
        <a href="/" className="text-base font-bold tracking-wider text-slate-100 whitespace-nowrap uppercase">
          AEGIS-EDGE CV
        </a>
        <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-slate-800 text-xs text-rose-400 font-mono">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>GNSS-DENIED MODE ACTIVE</span>
        </div>
      </div>

      {/* Zone 2: 4-5 Navigation Links (Clean single-line text links) */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => onSelectTab('hud')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'hud' ? 'text-cyan-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span>Optical HUD & Tracking</span>
        </button>

        <button
          onClick={() => onSelectTab('navigation')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'navigation' ? 'text-cyan-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Visual Dead Reckoning</span>
        </button>

        <button
          onClick={() => onSelectTab('profiler')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            activeTab === 'profiler' ? 'text-cyan-400 font-semibold' : 'hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>TensorRT Edge Profiler</span>
        </button>
      </nav>

      {/* Zone 3: Edge Hardware Health & Primary Action Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Persistent Edge Hardware Status View */}
        <HardwareHealthIndicator
          activeDevice={activeDevice}
          onChangeDevice={onChangeDevice}
          precision={precision}
          isStreaming={isStreaming}
        />

        <button
          onClick={onToggleWebcam}
          title={isWebcamActive ? "Disconnect Live Camera" : "Connect Local Camera Feed"}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
            isWebcamActive
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-300'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isWebcamActive ? "Cam On" : "Connect Cam"}</span>
        </button>

        <button
          onClick={onToggleStreaming}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap ${
            isStreaming
              ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300'
          }`}
        >
          {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isStreaming ? 'Freeze' : 'Resume'}</span>
        </button>

        <button
          onClick={onOpenExportModal}
          className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap"
        >
          Export C++ Pipeline
        </button>
      </div>
    </header>
  );
};

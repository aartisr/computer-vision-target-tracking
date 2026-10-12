import React, { useMemo } from 'react';
import { DegradationSettings } from '../types/tactical';
import { Sliders, Sun, Eye, Sparkles, RefreshCw, Layers } from 'lucide-react';

interface InfraredIntensityWidgetProps {
  degradation: DegradationSettings;
  onChangeDegradation: (newSettings: DegradationSettings) => void;
}

export const InfraredIntensityWidget: React.FC<InfraredIntensityWidgetProps> = ({
  degradation,
  onChangeDegradation,
}) => {
  const isThermal = degradation.spectrum.startsWith('flir');
  const isIronbow = isThermal && degradation.flirPalette === 'ironbow';
  const isWhiteHot = isThermal && (degradation.flirPalette === 'white_hot' || (!isIronbow && degradation.spectrum === 'flir_white'));

  // Compute thermal histogram bins based on active gain, level, and fog
  const histogramData = useMemo(() => {
    const bins = 28;
    const data: Array<{ bin: number; height: number; tempC: number; isSignal: boolean }> = [];

    // Ambient water temperature ~20°C, hot vessels ~48°C
    const gainFactor = degradation.flirGain;
    const levelShift = degradation.flirLevel;

    for (let i = 0; i < bins; i++) {
      const tempC = 16 + (i / bins) * 45; // 16°C to 61°C
      
      // Sea background bell curve peak around bin 5-8
      const seaPeak = Math.exp(-Math.pow((i - (6 + levelShift * 0.15)), 2) / (6 / gainFactor));
      // Horizon / atmospheric haze peak
      const hazePeak = degradation.marineHaze * Math.exp(-Math.pow((i - 12), 2) / 8) * 0.4;
      // Target vessel hull / engine peak around bin 20-24
      const targetPeak = Math.exp(-Math.pow((i - (22 + levelShift * 0.1)), 2) / (3.5 / gainFactor)) * 0.65;
      
      let height = Math.min(100, Math.max(4, (seaPeak * 0.85 + hazePeak + targetPeak) * 90));
      if (degradation.flirHistogramEq) {
        // Equalization redistributes mid-range contrast
        height = Math.min(95, height * 0.8 + 12);
      }

      data.push({
        bin: i,
        height: Math.round(height),
        tempC: Math.round(tempC),
        isSignal: i >= 18, // Target thermal signatures
      });
    }
    return data;
  }, [degradation.flirGain, degradation.flirLevel, degradation.marineHaze, degradation.flirHistogramEq]);

  const handleGainChange = (gain: number) => {
    onChangeDegradation({ ...degradation, flirGain: gain });
  };

  const handleLevelChange = (level: number) => {
    onChangeDegradation({ ...degradation, flirLevel: level });
  };

  const handleAgcChange = (mode: 'linear' | 'plateau' | 'manual') => {
    onChangeDegradation({ ...degradation, flirAgcMode: mode });
  };

  const handleAutoTune = () => {
    onChangeDegradation({
      ...degradation,
      flirGain: 2.2,
      flirLevel: -4,
      flirAgcMode: 'plateau',
      flirHistogramEq: true,
    });
  };

  return (
    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-200 font-sans text-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <label className="text-[11px] font-semibold text-slate-300 tracking-wider uppercase flex items-center gap-1.5 font-mono">
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          Infrared Intensity Distribution
        </label>
        <span className="text-[10px] text-amber-400 font-mono">
          14-BIT LWIR
        </span>
      </div>

      {/* Real-time Dynamic Range Heatmap Histogram */}
      <div className="bg-[#060a14] border border-slate-800/90 rounded p-2 mb-2.5">
        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
          <span>DYNAMIC RANGE HISTOGRAM</span>
          <span className="text-cyan-300">
            {isThermal
              ? isIronbow
                ? 'FLIR Ironbow Palette'
                : isWhiteHot
                ? 'FLIR White-Hot Palette'
                : 'FLIR Black-Hot Palette'
              : 'EO Optical Simulated'}
          </span>
        </div>

        {/* 28-Bar Histogram Curve */}
        <div className="h-16 flex items-end gap-[2px] pt-2 px-1">
          {histogramData.map((bar, idx) => {
            // Color based on temperature and palette
            let barColor = isIronbow
              ? bar.isSignal
                ? 'bg-amber-400 hover:bg-yellow-300'
                : idx < 10
                ? 'bg-indigo-900 hover:bg-indigo-800'
                : 'bg-fuchsia-800 hover:bg-fuchsia-700'
              : isWhiteHot
              ? bar.isSignal
                ? 'bg-amber-400 hover:bg-amber-300'
                : 'bg-cyan-900 hover:bg-cyan-800'
              : bar.isSignal
              ? 'bg-slate-300 hover:bg-white'
              : 'bg-slate-700 hover:bg-slate-600';

            return (
              <div
                key={idx}
                className="flex-1 flex flex-col justify-end h-full group relative cursor-pointer"
                title={`Bin ${idx + 1}: ${bar.tempC}°C · Intensity ${bar.height}%`}
              >
                <div
                  className={`w-full rounded-t-[1px] transition-all duration-150 ${barColor}`}
                  style={{ height: `${bar.height}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Thermal Heatmap Gradient Colorbar */}
        <div className="mt-1.5 h-2 w-full rounded-sm overflow-hidden flex shadow-inner">
          <div
            className="w-full h-full"
            style={{
              background: isIronbow
                ? 'linear-gradient(to right, #000033, #3b0764, #9d174d, #ea580c, #facc15, #ffffff)'
                : isWhiteHot
                ? 'linear-gradient(to right, #0a1128, #1c2e4a, #0284c7, #f59e0b, #ffffff)'
                : 'linear-gradient(to right, #ffffff, #f59e0b, #0284c7, #1c2e4a, #0a1128)',
            }}
          />
        </div>

        {/* Temperature Axis Markers */}
        <div className="flex justify-between text-[9px] text-slate-500 font-mono mt-1">
          <span>16°C (Sea)</span>
          <span>28°C (Ambient)</span>
          <span className="text-amber-400 font-semibold">58°C (Exhausts)</span>
        </div>
      </div>

      {/* AGC Mode Segmented Selector */}
      <div className="mb-2.5">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase">AGC Algorithm</span>
          <button
            onClick={handleAutoTune}
            title="Auto-optimize gain and span for maritime contrast"
            className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Auto-Tune</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-900 rounded border border-slate-800 font-mono text-[10px]">
          {(['plateau', 'linear', 'manual'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => handleAgcChange(mode)}
              className={`py-1 rounded font-medium transition-colors capitalize ${
                degradation.flirAgcMode === mode
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Thermal Gain / Contrast Span Slider */}
      <div className="space-y-2 font-mono">
        <div>
          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
            <span className="text-slate-400">Thermal Gain (Span)</span>
            <span className="text-amber-300 font-bold">{degradation.flirGain.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="3.5"
            step="0.05"
            value={degradation.flirGain}
            onChange={e => handleGainChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
          />
          <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
            <span>Wide Dynamic (0.5x)</span>
            <span>Target Isolating (3.5x)</span>
          </div>
        </div>

        {/* Level / Black-Offset Slider */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-300 mb-1">
            <span className="text-slate-400">Level (Center Offset)</span>
            <span className="text-cyan-300 font-bold">
              {degradation.flirLevel > 0 ? `+${degradation.flirLevel}` : degradation.flirLevel}
            </span>
          </div>
          <input
            type="range"
            min="-30"
            max="30"
            step="1"
            value={degradation.flirLevel}
            onChange={e => handleLevelChange(parseInt(e.target.value, 10))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Histogram Equalization (HEQ) Toggle */}
        <label className="flex items-center justify-between pt-1 cursor-pointer text-slate-300 hover:text-white">
          <span className="text-[10px] text-slate-400 font-sans">
            Plateau Histogram Equalization (PEQ)
          </span>
          <input
            type="checkbox"
            checked={degradation.flirHistogramEq}
            onChange={e =>
              onChangeDegradation({ ...degradation, flirHistogramEq: e.target.checked })
            }
            className="accent-amber-400 rounded cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
};

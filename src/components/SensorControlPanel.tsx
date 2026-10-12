import React from 'react';
import {
  DegradationSettings,
  SensorSpectrum,
  ScenarioDefinition,
  OperationalDomain,
} from '../types/tactical';
import { MISSION_SCENARIOS } from '../lib/scenarios';
import { Eye, Sun, Cloud, Activity, Compass, Sliders, Shield, Palette } from 'lucide-react';
import { InfraredIntensityWidget } from './InfraredIntensityWidget';
import { SignalToNoiseMonitor } from './SignalToNoiseMonitor';

interface SensorControlPanelProps {
  degradation: DegradationSettings;
  onChangeDegradation: (newSettings: DegradationSettings) => void;
  activeScenarioId: string;
  onSelectScenario: (scenario: ScenarioDefinition) => void;
  activeDomain: OperationalDomain;
  onSelectDomain: (domain: OperationalDomain) => void;
}

export const SensorControlPanel: React.FC<SensorControlPanelProps> = ({
  degradation,
  onChangeDegradation,
  activeScenarioId,
  onSelectScenario,
  activeDomain,
  onSelectDomain,
}) => {
  const handleSpectrumChange = (spectrum: SensorSpectrum) => {
    let flirPalette = degradation.flirPalette;
    if (spectrum === 'flir_white' && degradation.flirPalette === 'black_hot') {
      flirPalette = 'white_hot';
    } else if (spectrum === 'flir_black') {
      flirPalette = 'black_hot';
    }
    onChangeDegradation({ ...degradation, spectrum, flirPalette });
  };

  const updateSetting = <K extends keyof DegradationSettings>(key: K, value: DegradationSettings[K]) => {
    onChangeDegradation({ ...degradation, [key]: value });
  };

  const applyStressPreset = (preset: 'nominal' | 'fog_stress' | 'jitter_rough' | 'night_covert') => {
    switch (preset) {
      case 'nominal':
        onChangeDegradation({
          ...degradation,
          spectrum: 'eo_day',
          fogDensity: 0.05,
          marineHaze: 0.1,
          jitterRms: 0.5,
          luxLevel: 800,
        });
        break;
      case 'fog_stress':
        onChangeDegradation({
          ...degradation,
          spectrum: 'flir_white',
          fogDensity: 0.85,
          marineHaze: 0.7,
          jitterRms: 2.5,
          luxLevel: 50,
        });
        break;
      case 'jitter_rough':
        onChangeDegradation({
          ...degradation,
          spectrum: 'eo_day',
          fogDensity: 0.15,
          marineHaze: 0.3,
          jitterRms: 6.8,
          luxLevel: 600,
        });
        break;
      case 'night_covert':
        onChangeDegradation({
          ...degradation,
          spectrum: 'nvg_night',
          fogDensity: 0.2,
          marineHaze: 0.25,
          jitterRms: 1.8,
          luxLevel: 0.5,
        });
        break;
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-[#090e1b] border border-slate-800 rounded-lg text-slate-200 text-xs font-sans">
      {/* 1. Operational Domain & Scenario */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            Operational Domain & Mission
          </label>
        </div>

        {/* Domain Segmented Control */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded border border-slate-800 mb-2.5">
          {(['maritime', 'aerial', 'joint'] as OperationalDomain[]).map(domain => (
            <button
              key={domain}
              onClick={() => {
                onSelectDomain(domain);
                const firstScenario = MISSION_SCENARIOS.find(s => s.domain === domain) || MISSION_SCENARIOS[0];
                onSelectScenario(firstScenario);
              }}
              className={`py-1.5 text-[11px] font-medium rounded transition-colors capitalize ${
                activeDomain === domain
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {domain}
            </button>
          ))}
        </div>

        {/* Scenario Selector Dropdown */}
        <select
          value={activeScenarioId}
          onChange={e => {
            const sc = MISSION_SCENARIOS.find(s => s.id === e.target.value);
            if (sc) {
              onSelectScenario(sc);
              if (sc.defaultDegradation) {
                onChangeDegradation({ ...degradation, ...sc.defaultDegradation });
              }
            }
          }}
          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
        >
          {MISSION_SCENARIOS.map(sc => (
            <option key={sc.id} value={sc.id}>
              {sc.name}
            </option>
          ))}
        </select>
      </div>

      {/* 2. Multi-Spectral Sensor Selection */}
      <div className="pt-3 border-t border-slate-800">
        <label className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-2 flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          Optical & Thermal Spectrum
        </label>
        
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleSpectrumChange('eo_day')}
            className={`px-2.5 py-2 text-left rounded border transition-colors ${
              degradation.spectrum === 'eo_day'
                ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 font-semibold'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-[11px] font-bold">Daylight EO</div>
            <div className="text-[10px] text-slate-400 font-mono">400-700nm Optical</div>
          </button>

          <button
            onClick={() => handleSpectrumChange('flir_white')}
            className={`px-2.5 py-2 text-left rounded border transition-colors ${
              degradation.spectrum === 'flir_white'
                ? 'bg-amber-950/60 border-amber-500 text-amber-200 font-semibold'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-[11px] font-bold">FLIR White-Hot</div>
            <div className="text-[10px] text-slate-400 font-mono">8-14μm LWIR</div>
          </button>

          <button
            onClick={() => handleSpectrumChange('flir_black')}
            className={`px-2.5 py-2 text-left rounded border transition-colors ${
              degradation.spectrum === 'flir_black'
                ? 'bg-amber-950/60 border-amber-500 text-amber-200 font-semibold'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-[11px] font-bold">FLIR Black-Hot</div>
            <div className="text-[10px] text-slate-400 font-mono">Inverse Thermal</div>
          </button>

          <button
            onClick={() => handleSpectrumChange('nvg_night')}
            className={`px-2.5 py-2 text-left rounded border transition-colors ${
              degradation.spectrum === 'nvg_night'
                ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 font-semibold'
                : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-[11px] font-bold">StarLight NVG</div>
            <div className="text-[10px] text-slate-400 font-mono">Gen-3 Phosphor</div>
          </button>
        </div>

        {/* FLIR Thermal Palette Switcher */}
        <div className="mt-2.5 p-2 bg-slate-950/70 border border-slate-800 rounded">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
              <Palette className="w-3 h-3 text-amber-400" />
              Thermal Palette
            </span>
            <span className="text-[10px] text-amber-300 font-mono uppercase font-semibold">
              {degradation.flirPalette.replace('_', '-')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
            <button
              onClick={() => {
                onChangeDegradation({
                  ...degradation,
                  spectrum: 'flir_white',
                  flirPalette: 'white_hot',
                });
              }}
              className={`p-1.5 rounded transition-all flex flex-col items-center gap-1 border ${
                degradation.flirPalette === 'white_hot' && degradation.spectrum.startsWith('flir')
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 font-bold shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="w-full h-1.5 rounded-sm bg-gradient-to-r from-slate-950 via-slate-500 to-white" />
              <span>White-Hot</span>
            </button>

            <button
              onClick={() => {
                onChangeDegradation({
                  ...degradation,
                  spectrum: 'flir_black',
                  flirPalette: 'black_hot',
                });
              }}
              className={`p-1.5 rounded transition-all flex flex-col items-center gap-1 border ${
                degradation.flirPalette === 'black_hot' && degradation.spectrum.startsWith('flir')
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 font-bold shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="w-full h-1.5 rounded-sm bg-gradient-to-r from-white via-slate-500 to-slate-950" />
              <span>Black-Hot</span>
            </button>

            <button
              onClick={() => {
                onChangeDegradation({
                  ...degradation,
                  spectrum: 'flir_white',
                  flirPalette: 'ironbow',
                });
              }}
              className={`p-1.5 rounded transition-all flex flex-col items-center gap-1 border ${
                degradation.flirPalette === 'ironbow' && degradation.spectrum.startsWith('flir')
                  ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 font-bold shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="w-full h-1.5 rounded-sm bg-gradient-to-r from-[#03002e] via-[#9d174d] via-[#ea580c] to-[#fef08a]" />
              <span>Ironbow</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2.5 Infrared Intensity Distribution & Gain Tuning Widget */}
      <div className="pt-3 border-t border-slate-800">
        <InfraredIntensityWidget
          degradation={degradation}
          onChangeDegradation={onChangeDegradation}
        />
      </div>

      {/* 3. Environmental Degradation Controls */}
      <div className="pt-3 border-t border-slate-800 space-y-3">
        <label className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
          <Cloud className="w-3.5 h-3.5 text-cyan-400" />
          Degraded Environment Ingestion
        </label>

        {/* Fog Density Slider */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1">
            <span>Advection Fog Density</span>
            <span className="text-cyan-300 font-bold">{Math.round(degradation.fogDensity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={degradation.fogDensity}
            onChange={e => updateSetting('fogDensity', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Marine Haze Slider */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1">
            <span>Atmospheric Sea Haze</span>
            <span className="text-cyan-300 font-bold">{Math.round(degradation.marineHaze * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={degradation.marineHaze}
            onChange={e => updateSetting('marineHaze', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
        </div>

        {/* Camera Jitter RMS Slider & Jitter Compensation Toggle */}
        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1">
              <span>Gimbal Jitter RMS (Vibration)</span>
              <span className="text-amber-300 font-bold">{degradation.jitterRms.toFixed(1)} px</span>
            </div>
            <input
              type="range"
              min="0"
              max="8"
              step="0.2"
              value={degradation.jitterRms}
              onChange={e => updateSetting('jitterRms', parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Jitter Compensation Toggle */}
          <div className="p-2 rounded bg-slate-950/80 border border-slate-800/90 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              <Shield className={`w-3.5 h-3.5 ${degradation.enableJitterCompensation ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <span className="text-slate-200 font-medium block leading-tight">Jitter Compensation</span>
                <span className="text-[10px] text-slate-400 font-mono block">
                  {degradation.enableJitterCompensation
                    ? `Kalman noise R inflated (+${Math.pow(degradation.jitterRms * 1.8, 2).toFixed(1)} px²)`
                    : 'Static R (uncompensated)'}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={degradation.enableJitterCompensation}
                onChange={e => updateSetting('enableJitterCompensation', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        {/* Illumination Lux Slider */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1">
            <span>Ambient Illumination</span>
            <span className="text-slate-300 font-bold font-mono">
              {degradation.luxLevel < 5 ? `${degradation.luxLevel.toFixed(1)} Lux (Night)` : `${Math.round(degradation.luxLevel)} Lux`}
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1000"
            step="10"
            value={degradation.luxLevel}
            onChange={e => updateSetting('luxLevel', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-300"
          />
        </div>
      </div>

      {/* 3.5 Real-Time Signal-to-Noise Ratio (SNR) Monitor */}
      <div className="pt-3 border-t border-slate-800">
        <SignalToNoiseMonitor degradation={degradation} />
      </div>

      {/* 4. Degradation Stress Test Quick Buttons */}
      <div className="pt-3 border-t border-slate-800">
        <label className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-2 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          Tactical Stress Presets
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => applyStressPreset('nominal')}
            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-[11px] text-slate-300 hover:text-white transition-colors"
          >
            Clear Optical
          </button>
          <button
            onClick={() => applyStressPreset('fog_stress')}
            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-[11px] text-amber-300 hover:text-amber-200 transition-colors"
          >
            Heavy Fog Drop
          </button>
          <button
            onClick={() => applyStressPreset('jitter_rough')}
            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-[11px] text-slate-300 hover:text-white transition-colors"
          >
            High Sea Jitter
          </button>
          <button
            onClick={() => applyStressPreset('night_covert')}
            className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded text-[11px] text-emerald-300 hover:text-emerald-200 transition-colors"
          >
            Night Starlight
          </button>
        </div>
      </div>

      {/* 5. HUD Display Overlays */}
      <div className="pt-3 border-t border-slate-800">
        <label className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-2 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          HUD Telemetry Overlays
        </label>
        <div className="space-y-1.5">
          <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white" title="Draw 2-second predicted path vectors and projected target envelope using Kalman Filter velocity estimation">
            <span>2s Predicted Path Vectors (Kalman)</span>
            <input
              type="checkbox"
              checked={degradation.enableKalmanVectorOverlay}
              onChange={e => updateSetting('enableKalmanVectorOverlay', e.target.checked)}
              className="accent-cyan-500 rounded"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
            <span>2-Sigma Covariance Ellipse</span>
            <input
              type="checkbox"
              checked={degradation.enableCovarianceEllipse}
              onChange={e => updateSetting('enableCovarianceEllipse', e.target.checked)}
              className="accent-cyan-500 rounded"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
            <span>Optical Flow Feature Tracks</span>
            <input
              type="checkbox"
              checked={degradation.enableOpticalFlowOverlay}
              onChange={e => updateSetting('enableOpticalFlowOverlay', e.target.checked)}
              className="accent-cyan-500 rounded"
            />
          </label>
          <label className="flex items-center justify-between cursor-pointer text-slate-300 hover:text-white">
            <span>Heads-Up Flight Ladder & Reticle</span>
            <input
              type="checkbox"
              checked={degradation.enableHorizonHud}
              onChange={e => updateSetting('enableHorizonHud', e.target.checked)}
              className="accent-cyan-500 rounded"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

/**
 * AEGIS-EDGE: GNSS-Denied Edge Computer Vision & Target Tracking System
 * Master Application Controller & Tactical Dashboard
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TopNavigation } from './components/TopNavigation';
import { OpticalViewport } from './components/OpticalViewport';
import { SensorControlPanel } from './components/SensorControlPanel';
import { TacticalTrackTable } from './components/TacticalTrackTable';
import { EdgeProfilerPanel } from './components/EdgeProfilerPanel';
import { DeadReckoningPanel } from './components/DeadReckoningPanel';
import { TargetDetailModal } from './components/TargetDetailModal';
import { ExportPipelineModal } from './components/ExportPipelineModal';

import {
  OperationalDomain,
  DegradationSettings,
  Tracklet,
  Detection,
  ScenarioDefinition,
  DeadReckoningTelemetry,
  OpticalFlowPoint,
  HardwareDevice,
  QuantizationPrecision,
} from './types/tactical';
import { ByteTracker } from './lib/bytetrack';
import { DeadReckoningEngine } from './lib/deadReckoning';
import { MISSION_SCENARIOS } from './lib/scenarios';

export default function App() {
  // Navigation & View Mode
  const [activeDomain, setActiveDomain] = useState<OperationalDomain>('maritime');
  const [activeTab, setActiveTab] = useState<'hud' | 'profiler' | 'navigation' | 'code'>('hud');

  // Edge Hardware & Precision Context
  const [activeDevice, setActiveDevice] = useState<HardwareDevice>('orin_nano');
  const [activePrecision, setActivePrecision] = useState<QuantizationPrecision>('INT8');

  // Scenario & Degradation Configuration
  const [currentScenario, setCurrentScenario] = useState<ScenarioDefinition>(MISSION_SCENARIOS[0]);
  const [degradation, setDegradation] = useState<DegradationSettings>({
    spectrum: MISSION_SCENARIOS[0].recommendedSpectrum,
    flirPalette: 'white_hot',
    fogDensity: MISSION_SCENARIOS[0].defaultDegradation.fogDensity ?? 0.15,
    marineHaze: MISSION_SCENARIOS[0].defaultDegradation.marineHaze ?? 0.25,
    jitterRms: MISSION_SCENARIOS[0].defaultDegradation.jitterRms ?? 1.2,
    luxLevel: MISSION_SCENARIOS[0].defaultDegradation.luxLevel ?? 0.2,
    glare: 0.1,
    enableOpticalFlowOverlay: true,
    enableKalmanVectorOverlay: true,
    enableCovarianceEllipse: true,
    enableHorizonHud: true,
    flirGain: 1.25,
    flirLevel: 0,
    flirAgcMode: 'plateau',
    flirHistogramEq: true,
    enableJitterCompensation: true,
  });

  // Tracking Engine & Odometry Engine References
  const byteTrackerRef = useRef<ByteTracker>(new ByteTracker());
  const deadReckoningRef = useRef<DeadReckoningEngine>(new DeadReckoningEngine());

  // Live Track & Telemetry State
  const [tracklets, setTracklets] = useState<Tracklet[]>([]);
  const [opticalFlowPoints, setOpticalFlowPoints] = useState<OpticalFlowPoint[]>([]);
  const [deadReckoningTelemetry, setDeadReckoningTelemetry] = useState<DeadReckoningTelemetry>(() =>
    deadReckoningRef.current.step(0.05, 1.2)
  );

  // Interaction State
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [modalTracklet, setModalTracklet] = useState<Tracklet | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);

  // Webcam Video Feed
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Reset trackers when scenario switches
  useEffect(() => {
    byteTrackerRef.current.reset();
    setSelectedTrackId(null);
  }, [currentScenario.id]);

  // Periodic Visual Odometry step
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const telem = deadReckoningRef.current.step(0.1, degradation.jitterRms);
      setDeadReckoningTelemetry(telem);
      setOpticalFlowPoints([...deadReckoningRef.current.getOpticalFlowPoints()]);
    }, 100);

    return () => clearInterval(interval);
  }, [isStreaming, degradation.jitterRms]);

  // Handle Detections Generated from Viewport -> Execute ByteTrack Association
  const handleDetectionsGenerated = useCallback(
    (detections: Detection[]) => {
      const updatedTracklets = byteTrackerRef.current.update(
        detections,
        Date.now(),
        degradation.jitterRms,
        degradation.enableJitterCompensation
      );
      setTracklets(updatedTracklets);
    },
    [degradation.jitterRms, degradation.enableJitterCompensation]
  );

  // Toggle Live Webcam Feed
  const handleToggleWebcam = async () => {
    if (isWebcamActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      setIsWebcamActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 960, height: 540 },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsWebcamActive(true);
      } catch (err) {
        console.warn('Camera access denied or unavailable in sandbox:', err);
        alert('Camera access unavailable in current environment; switching back to synthetic multi-spectral feeds.');
        setIsWebcamActive(false);
      }
    }
  };

  // Keyboard Shortcuts (Space: Freeze/Play, Esc: Clear Lock)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsStreaming(prev => !prev);
      } else if (e.code === 'Escape') {
        setSelectedTrackId(null);
        setModalTracklet(null);
        setIsExportModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#060a14] text-slate-100 overflow-hidden select-none">
      {/* Hidden Video element for webcam streaming */}
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      {/* Top Bar Navigation (3-Zone Contract) */}
      <TopNavigation
        activeDomain={activeDomain}
        onSelectDomain={domain => {
          setActiveDomain(domain);
          const matched = MISSION_SCENARIOS.find(s => s.domain === domain) || MISSION_SCENARIOS[0];
          setCurrentScenario(matched);
          if (matched.defaultDegradation) {
            setDegradation(prev => ({ ...prev, ...matched.defaultDegradation }));
          }
        }}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isStreaming={isStreaming}
        onToggleStreaming={() => setIsStreaming(prev => !prev)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        isWebcamActive={isWebcamActive}
        onToggleWebcam={handleToggleWebcam}
        activeDevice={activeDevice}
        onChangeDevice={setActiveDevice}
        precision={activePrecision}
      />

      {/* Main Workspace Viewport */}
      <main className="flex-1 min-h-0 p-3 overflow-hidden">
        {activeTab === 'hud' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
            {/* Left Column: Sensor & Degradation Controls (3 cols on lg) */}
            <div className="hidden lg:block lg:col-span-3 h-full overflow-y-auto">
              <SensorControlPanel
                degradation={degradation}
                onChangeDegradation={setDegradation}
                activeScenarioId={currentScenario.id}
                onSelectScenario={setCurrentScenario}
                activeDomain={activeDomain}
                onSelectDomain={domain => {
                  setActiveDomain(domain);
                  const matched = MISSION_SCENARIOS.find(s => s.domain === domain) || MISSION_SCENARIOS[0];
                  setCurrentScenario(matched);
                }}
              />
            </div>

            {/* Center Column: Optical Viewport Canvas & HUD (6 cols on lg) */}
            <div className="col-span-1 lg:col-span-6 h-full flex flex-col min-h-0">
              <OpticalViewport
                tracklets={tracklets}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                degradation={degradation}
                opticalFlowPoints={opticalFlowPoints}
                currentScenario={currentScenario}
                isStreaming={isStreaming}
                isWebcamActive={isWebcamActive}
                videoRef={videoRef}
                onDetectionsGenerated={handleDetectionsGenerated}
                activeDevice={activeDevice}
                onChangeDevice={setActiveDevice}
                precision={activePrecision}
                autoCenter={autoCenter}
                onToggleAutoCenter={() => setAutoCenter(prev => !prev)}
              />
            </div>

            {/* Right Column: Tactical Track Table & Contact Inventory (3 cols on lg) */}
            <div className="col-span-1 lg:col-span-3 h-full overflow-hidden flex flex-col">
              <TacticalTrackTable
                tracklets={tracklets}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onOpenTargetDetailModal={setModalTracklet}
                autoCenter={autoCenter}
                onToggleAutoCenter={() => setAutoCenter(prev => !prev)}
              />
            </div>
          </div>
        )}

        {/* Tab 2: TensorRT Edge Profiler Fullscreen Workspace */}
        {activeTab === 'profiler' && (
          <div className="h-full">
            <EdgeProfilerPanel
              onOpenExportModal={() => setIsExportModalOpen(true)}
              selectedDevice={activeDevice}
              onSelectDevice={setActiveDevice}
              selectedPrecision={activePrecision}
              onSelectPrecision={setActivePrecision}
            />
          </div>
        )}

        {/* Tab 3: GNSS-Denied Dead Reckoning Fullscreen Workspace */}
        {activeTab === 'navigation' && (
          <div className="h-full">
            <DeadReckoningPanel
              telemetry={deadReckoningTelemetry}
              onResetOdometry={() => {
                deadReckoningRef.current = new DeadReckoningEngine();
                setDeadReckoningTelemetry(deadReckoningRef.current.step(0.05, 1.0));
              }}
            />
          </div>
        )}
      </main>

      {/* Target Kinematic Dossier Modal */}
      {modalTracklet && (
        <TargetDetailModal
          tracklet={modalTracklet}
          onClose={() => setModalTracklet(null)}
          onToggleLock={id => {
            setSelectedTrackId(prev => (prev === id ? null : id));
            byteTrackerRef.current.setTrackLocked(id, selectedTrackId !== id);
          }}
        />
      )}

      {/* C++ TensorRT Export Pipeline Modal */}
      <ExportPipelineModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
}

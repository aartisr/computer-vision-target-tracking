/**
 * Edge Hardware Health Telemetry Simulation for Jetson & Raspberry Pi platforms
 */

import { HardwareDevice, QuantizationPrecision, EdgeHardwareHealth } from '../types/tactical';

export function calculateEdgeHealth(
  device: HardwareDevice,
  precision: QuantizationPrecision,
  isStreaming: boolean,
  timeSec: number = 0
): {
  health: EdgeHardwareHealth;
  rawTelemetrySnippet: string;
} {
  // Baseline parameters per device
  const baseSpecs = {
    orin_nano: {
      tdp: 15,
      idleWatts: 4.8,
      loadWattsFP32: 13.8,
      loadWattsFP16: 11.2,
      loadWattsINT8: 8.6,
      idleTemp: 38.0,
      loadTempFP32: 56.5,
      loadTempFP16: 48.0,
      loadTempINT8: 43.5,
      cpuLoad: 34,
      gpuLoad: 72,
      dlaLoad: 0,
      fanBaseRpm: 2100,
      powerMode: '15W SUPER',
      voltage: 12.08,
    },
    orin_agx: {
      tdp: 60,
      idleWatts: 9.5,
      loadWattsFP32: 38.2,
      loadWattsFP16: 24.5,
      loadWattsINT8: 16.4,
      idleTemp: 41.0,
      loadTempFP32: 62.0,
      loadTempFP16: 51.5,
      loadTempINT8: 46.0,
      cpuLoad: 28,
      gpuLoad: 64,
      dlaLoad: 68,
      fanBaseRpm: 2800,
      powerMode: '60W MAXN',
      voltage: 19.15,
    },
    rpi5_hailo: {
      tdp: 8.5,
      idleWatts: 3.2,
      loadWattsFP32: 7.8,
      loadWattsFP16: 6.2,
      loadWattsINT8: 4.9,
      idleTemp: 44.0,
      loadTempFP32: 63.5,
      loadTempFP16: 55.0,
      loadTempINT8: 49.5,
      cpuLoad: 46,
      gpuLoad: 22,
      dlaLoad: 84, // Hailo-8 NPU dataflow engine
      fanBaseRpm: 3200,
      powerMode: 'PCIe Gen 3.0 Hat',
      voltage: 5.12,
    },
    rpi5_cpu: {
      tdp: 12.0,
      idleWatts: 3.4,
      loadWattsFP32: 11.6,
      loadWattsFP16: 10.4,
      loadWattsINT8: 9.2,
      idleTemp: 46.0,
      loadTempFP32: 74.0,
      loadTempFP16: 71.0,
      loadTempINT8: 66.0,
      cpuLoad: 92,
      gpuLoad: 10,
      dlaLoad: 0,
      fanBaseRpm: 4600,
      powerMode: 'Full Core Load',
      voltage: 5.08,
    },
  }[device];

  // Dynamic subtle jitter based on time
  const jitterP = Math.sin(timeSec * 1.8) * 0.25 + Math.cos(timeSec * 3.1) * 0.15;
  const jitterT = Math.sin(timeSec * 0.8) * 0.4;
  const jitterC = Math.sin(timeSec * 2.4) * 2.5;

  let targetWatts = isStreaming
    ? (precision === 'INT8'
        ? baseSpecs.loadWattsINT8
        : precision === 'FP16'
        ? baseSpecs.loadWattsFP16
        : baseSpecs.loadWattsFP32)
    : baseSpecs.idleWatts;
  targetWatts = Math.max(1.0, parseFloat((targetWatts + jitterP).toFixed(1)));

  let targetTemp = isStreaming
    ? (precision === 'INT8'
        ? baseSpecs.loadTempINT8
        : precision === 'FP16'
        ? baseSpecs.loadTempFP16
        : baseSpecs.loadTempFP32)
    : baseSpecs.idleTemp;
  targetTemp = parseFloat((targetTemp + jitterT).toFixed(1));

  let cpuUtil = isStreaming ? Math.min(100, Math.max(5, Math.round(baseSpecs.cpuLoad + jitterC))) : 8;
  let gpuUtil = isStreaming ? baseSpecs.gpuLoad : 5;

  const currentA = parseFloat((targetWatts / baseSpecs.voltage).toFixed(2));
  const fanRpm = Math.round(baseSpecs.fanBaseRpm + (targetTemp > 50 ? (targetTemp - 50) * 80 : 0));

  let throttleStatus: 'NOMINAL' | 'WARNING' | 'THROTTLED' = 'NOMINAL';
  if (targetTemp >= 75) throttleStatus = 'THROTTLED';
  else if (targetTemp >= 65) throttleStatus = 'WARNING';

  const health: EdgeHardwareHealth = {
    device,
    gpuTempC: targetTemp,
    cpuTempC: parseFloat((targetTemp - 1.5).toFixed(1)),
    powerWatts: targetWatts,
    maxPowerWatts: baseSpecs.tdp,
    cpuUtilPercent: cpuUtil,
    gpuUtilPercent: gpuUtil,
    dlaUtilPercent: baseSpecs.dlaLoad,
    fanRpm,
    throttleStatus,
    powerMode: baseSpecs.powerMode,
    voltageV: baseSpecs.voltage,
    currentA,
  };

  // Generate authentic diagnostic log
  let rawTelemetrySnippet = '';
  if (device.startsWith('orin')) {
    const milliWatts = Math.round(targetWatts * 1000);
    rawTelemetrySnippet = `[tegrastats] RAM ${Math.round(targetWatts * 140)}/7624MB CPU [${cpuUtil}%@1510,${Math.max(10, cpuUtil - 4)}%@1510,${cpuUtil}%@1510] EMC 64% GR3D_FREQ ${gpuUtil}%@624 VDD_IN ${milliWatts}mW/${baseSpecs.tdp * 1000}mW tj@${targetTemp}C soc0@${(targetTemp - 1.2).toFixed(1)}C fan@${fanRpm}RPM NVPM: ${baseSpecs.powerMode}`;
  } else {
    rawTelemetrySnippet = `[vcgencmd] temp=${targetTemp}'C volt=${baseSpecs.voltage}V arm_freq=2400MHz hailo_npu=${baseSpecs.dlaLoad}% throttled=${throttleStatus === 'NOMINAL' ? '0x0' : '0x20000'} fan_rpm=${fanRpm}`;
  }

  return { health, rawTelemetrySnippet };
}

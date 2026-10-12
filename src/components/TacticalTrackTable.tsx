import React, { useState } from 'react';
import { Tracklet } from '../types/tactical';
import { Target, Search, Lock, Unlock, ShieldAlert, Crosshair, ChevronRight } from 'lucide-react';

interface TacticalTrackTableProps {
  tracklets: Tracklet[];
  selectedTrackId: number | null;
  onSelectTrack: (id: number | null) => void;
  onOpenTargetDetailModal: (tracklet: Tracklet) => void;
  autoCenter?: boolean;
  onToggleAutoCenter?: () => void;
}

export const TacticalTrackTable: React.FC<TacticalTrackTableProps> = ({
  tracklets,
  selectedTrackId,
  onSelectTrack,
  onOpenTargetDetailModal,
  autoCenter = false,
  onToggleAutoCenter,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterState, setFilterState] = useState<'all' | 'confirmed' | 'tentative' | 'lost'>('all');

  const filteredTracklets = tracklets.filter(trk => {
    if (filterState !== 'all' && trk.state !== filterState) return false;
    if (searchQuery.trim() === '') return true;
    const query = searchQuery.toLowerCase();
    return (
      trk.class.toLowerCase().includes(query) ||
      `trk-${trk.id}`.includes(query) ||
      trk.category.toLowerCase().includes(query)
    );
  });

  const selectedTracklet = tracklets.find(t => t.id === selectedTrackId);

  return (
    <div className="flex flex-col h-full bg-[#090e1b] border border-slate-800 rounded-lg text-slate-200 text-xs overflow-hidden">
      {/* Table Header, Search & Target Auto-Center Control */}
      <div className="p-3 border-b border-slate-800/80 bg-[#0c1222]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-slate-100 tracking-wide uppercase text-[11px]">
              Active Contact Inventory ({tracklets.length})
            </span>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded border border-slate-800 text-[10px]">
            {(['all', 'confirmed', 'tentative', 'lost'] as const).map(state => (
              <button
                key={state}
                onClick={() => setFilterState(state)}
                className={`px-2 py-0.5 font-medium rounded transition-colors capitalize ${
                  filterState === state
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {state}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mb-2.5">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by Track ID or Vessel/Aircraft Class..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Target Auto-Center Slew-to-Cue Gimbal Controller */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <Crosshair
              className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                autoCenter ? 'text-cyan-400 animate-pulse' : 'text-slate-500'
              }`}
            />
            <span className="font-semibold text-slate-200 text-[11px] truncate">
              Target Auto-Center
            </span>
            {autoCenter && (
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                  selectedTrackId
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {selectedTrackId ? `TRK-${String(selectedTrackId).padStart(2, '0')}` : 'STANDBY'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] font-mono font-medium ${
                autoCenter ? 'text-cyan-400' : 'text-slate-500'
              }`}
            >
              {autoCenter ? 'ACTIVE' : 'OFF'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={autoCenter}
              onClick={onToggleAutoCenter}
              title={
                autoCenter
                  ? 'Target Auto-Center is active: Viewport smoothly pans & zooms to center selected contact'
                  : 'Enable Target Auto-Center to keep selected target centered in frame'
              }
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none ${
                autoCenter
                  ? 'bg-cyan-500 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                  : 'bg-slate-800 border-slate-700 hover:border-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 shadow transition duration-200 ease-in-out mt-0.5 ${
                  autoCenter ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* High-Density Tactical Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] text-slate-400 font-mono tracking-wider">
              <th className="py-2 px-3">TRACK</th>
              <th className="py-2 px-3">CLASS</th>
              <th className="py-2 px-2 text-right">RANGE</th>
              <th className="py-2 px-2 text-right">SPEED</th>
              <th className="py-2 px-2 text-right">CONF</th>
              <th className="py-2 px-3 text-center">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
            {filteredTracklets.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                  No contacts matching filter criteria.
                </td>
              </tr>
            ) : (
              filteredTracklets.map(trk => {
                const isSelected = trk.id === selectedTrackId;
                const isConfirmed = trk.state === 'confirmed';
                const isLost = trk.state === 'lost';

                return (
                  <tr
                    key={trk.id}
                    onClick={() => onSelectTrack(isSelected ? null : trk.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/40 text-cyan-200 border-l-2 border-l-cyan-400'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    {/* Track ID */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${isSelected ? 'text-rose-400' : 'text-cyan-400'}`}>
                          TRK-{String(trk.id).padStart(2, '0')}
                        </span>
                        {isSelected && autoCenter && (
                          <span
                            title="Viewport auto-centered on this target"
                            className="px-1 py-0.2 rounded text-[8px] font-mono font-bold tracking-tight bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          >
                            CENTERED
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Class & Category */}
                    <td className="py-2 px-3">
                      <div className="font-sans font-medium text-slate-200 truncate max-w-[140px]">
                        {trk.class}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isLost ? (
                          <span className="text-slate-500">EKF Coasting</span>
                        ) : !isConfirmed ? (
                          <span className="text-amber-400">Tentative</span>
                        ) : (
                          <span className="text-emerald-400">Tracked</span>
                        )}
                      </div>
                    </td>

                    {/* Range in Meters */}
                    <td className="py-2 px-2 text-right tabular-nums text-slate-300">
                      {trk.rangeMeters}m
                    </td>

                    {/* Speed in Knots */}
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-400">
                      {trk.speedKnots}kt
                    </td>

                    {/* Confidence % */}
                    <td className="py-2 px-2 text-right tabular-nums text-cyan-300">
                      {Math.round(trk.confidence * 100)}%
                    </td>

                    {/* Lock / Inspect Actions */}
                    <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectTrack(isSelected ? null : trk.id)}
                          title={isSelected ? 'Unlock Target' : 'Lock Target on HUD'}
                          className={`p-1 rounded transition-colors ${
                            isSelected
                              ? 'text-rose-400 hover:bg-rose-950/40'
                              : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800'
                          }`}
                        >
                          {isSelected ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onOpenTargetDetailModal(trk)}
                          title="Inspect Telemetry & Intercept"
                          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Selected Target Intercept Vector Strip */}
      {selectedTracklet && (
        <div className="p-3 border-t border-slate-800 bg-[#0c1322] font-mono text-[11px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-cyan-300 flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-rose-400" />
              INTERCEPT VECTOR // TRK-{String(selectedTracklet.id).padStart(2, '0')}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleAutoCenter}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors flex items-center gap-1 ${
                  autoCenter
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/20'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800'
                }`}
                title="Toggle Target Auto-Center"
              >
                <Crosshair className={`w-3 h-3 ${autoCenter ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>AUTO-CENTER: {autoCenter ? 'ON' : 'OFF'}</span>
              </button>
              <button
                onClick={() => onOpenTargetDetailModal(selectedTracklet)}
                className="text-[10px] text-cyan-400 hover:underline"
              >
                Full Telemetry
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-slate-400">
            <div>
              HEADING: <strong className="text-white">{selectedTracklet.headingDeg}°</strong>
            </div>
            <div>
              BEARING: <strong className="text-white">{selectedTracklet.bearingDeg > 0 ? `+${selectedTracklet.bearingDeg}°` : `${selectedTracklet.bearingDeg}°`}</strong>
            </div>
            <div>
              COVARIANCE: <strong className="text-amber-400">{selectedTracklet.covariance.toFixed(1)}σ</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

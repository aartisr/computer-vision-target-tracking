import React, { useState } from 'react';
import { Tracklet } from '../types/tactical';
import { Target, Search, Lock, Unlock, ShieldAlert, Crosshair, ChevronRight } from 'lucide-react';

interface TacticalTrackTableProps {
  tracklets: Tracklet[];
  selectedTrackId: number | null;
  onSelectTrack: (id: number | null) => void;
  onOpenTargetDetailModal: (tracklet: Tracklet) => void;
}

export const TacticalTrackTable: React.FC<TacticalTrackTableProps> = ({
  tracklets,
  selectedTrackId,
  onSelectTrack,
  onOpenTargetDetailModal,
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
      {/* Table Header & Search */}
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
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by Track ID or Vessel/Aircraft Class..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
          />
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
                      <span className={`font-semibold ${isSelected ? 'text-rose-400' : 'text-cyan-400'}`}>
                        TRK-{String(trk.id).padStart(2, '0')}
                      </span>
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
            <button
              onClick={() => onOpenTargetDetailModal(selectedTracklet)}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              Full Telemetry
            </button>
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

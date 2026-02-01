import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { TimeTracker, TimeMarker } from '../../types/timeTracker';
import { fetchRandomTables } from '../../lib/api/randomTables';
import { rollOnTable } from '../../lib/game/randomTableUtils';
// import { RandomTableManager } from '../tools/RandomTableManager';
import { TextWithDice } from '../shared/TextWithDice';
import {
  Sun, Moon, Sunrise, Sunset,
  Flame, Bed, ChevronLeft, ChevronRight, Edit3, X,
  Circle, Square, ChevronsRight, ChevronDown, ChevronUp, Clock,
  Dices, Skull
} from 'lucide-react';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';

// --- TYPES & CONSTANTS ---

const SHIFTS = [
  { id: 1, label: 'Morning', sub: '(01-06)', icon: Sunrise, hours: [1, 2, 3, 4, 5, 6] },
  { id: 2, label: 'Day', sub: '(07-12)', icon: Sun, hours: [7, 8, 9, 10, 11, 12] },
  { id: 3, label: 'Evening', sub: '(13-18)', icon: Sunset, hours: [13, 14, 15, 16, 17, 18] },
  { id: 4, label: 'Night', sub: '(19-24)', icon: Moon, hours: [19, 20, 21, 22, 23, 24] },
];

const MARKER_TYPES: { value: TimeMarker; label: string; icon: any; color: string; bg: string }[] = [
  { value: null, label: 'Empty', icon: Square, color: 'text-gray-300', bg: 'bg-white' },
  { value: 'X', label: 'Passed', icon: X, color: 'text-gray-500', bg: 'bg-gray-100' },
  { value: 'R', label: 'Round Rest', icon: Circle, color: 'text-blue-600', bg: 'bg-blue-50' },
  { value: 'S', label: 'Stretch Rest', icon: Bed, color: 'text-green-600', bg: 'bg-green-50' },
  { value: 'T', label: 'Torch', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' },
  { value: 'L', label: 'Lantern', icon: Flame, color: 'text-yellow-600', bg: 'bg-yellow-50' },
];

// --- COMPONENT ---

export function TimeTrackerView({ partyId, onTabChange }: { partyId: string, onTabChange?: (tab: any) => void }) {
  const [tracker, setTracker] = useState<TimeTracker | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeShift, setActiveShift] = useState(1);
  const [expandedHour, setExpandedHour] = useState<number | null>(null);

  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [encounterResult, setEncounterResult] = useState<{ text: string, type: 'safe' | 'danger' } | null>(null);

  const { data: customTables } = useQuery({
    queryKey: ['randomTables', partyId],
    queryFn: () => fetchRandomTables(partyId),
  });

  // Auto-select first table if none selected
  useEffect(() => {
    if (customTables && customTables.length > 0 && !selectedTableId) {
      setSelectedTableId(customTables[0].id);
    }
  }, [customTables, selectedTableId]);

  // Fetch or Create Tracker
  useEffect(() => {
    const fetchTracker = async () => {
      const { data, error } = await (supabase
        .from('time_trackers') as any)
        .select('*')
        .eq('party_id', partyId)
        .maybeSingle();

      if (data) {
        setTracker(data as unknown as TimeTracker);
        setActiveShift((data as any).current_shift || 1);
        setLoading(false);
      } else if (!error) {
        const defaultState: any = {};
        for (let i = 1; i <= 24; i++) defaultState[i] = { stretches: [null, null, null, null], notes: '' };

        const { data: newData } = await (supabase
          .from('time_trackers') as any)
          .insert({ party_id: partyId, grid_state: defaultState } as any)
          .select()
          .single();

        if (newData) setTracker(newData as unknown as TimeTracker);
        setLoading(false);
      }
    };
    fetchTracker();
  }, [partyId]);

  const saveTracker = async (newTracker: TimeTracker) => {
    setTracker(newTracker);
    await (supabase.from('time_trackers') as any).update({
      grid_state: newTracker.grid_state,
      current_day: newTracker.current_day,
      current_shift: activeShift
    }).eq('id', newTracker.id);
  };

  const handleStretchClick = (hour: number, stretchIndex: number) => {
    if (!tracker) return;
    const currentHour = tracker.grid_state[hour] || { stretches: [null, null, null, null], notes: '' };
    const currentMarker = currentHour.stretches[stretchIndex];

    const currentMarkerIdx = MARKER_TYPES.findIndex(m => m.value === currentMarker);
    const nextMarkerIdx = (currentMarkerIdx + 1) % MARKER_TYPES.length;
    const nextMarker = MARKER_TYPES[nextMarkerIdx].value;

    const newStretches = [...currentHour.stretches] as [TimeMarker, TimeMarker, TimeMarker, TimeMarker];
    newStretches[stretchIndex] = nextMarker;

    saveTracker({ ...tracker, grid_state: { ...tracker.grid_state, [hour]: { ...currentHour, stretches: newStretches } } });
  };

  const handleNoteChange = (hour: number, note: string) => {
    if (!tracker) return;
    const currentHour = tracker.grid_state[hour] || { stretches: [null, null, null, null], notes: '' };
    setTracker({ ...tracker, grid_state: { ...tracker.grid_state, [hour]: { ...currentHour, notes: note } } });
  };

  const handleBlurNote = () => {
    if (tracker) saveTracker(tracker);
  };

  const handleDayChange = (delta: number) => {
    if (!tracker) return;
    const newDay = Math.max(1, tracker.current_day + delta);

    if (window.confirm(delta > 0 ? "Start a new day? This will clear the time grid." : "Go back a day? (Grid will reset)")) {
      const defaultState: any = {};
      for (let i = 1; i <= 24; i++) defaultState[i] = { stretches: [null, null, null, null], notes: '' };
      saveTracker({ ...tracker, current_day: newDay, current_shift: 1, grid_state: defaultState });
      setActiveShift(1);
    }
  };

  const handleCompleteHour = (hour: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tracker) return;
    const currentHour = tracker.grid_state[hour] || { stretches: [null, null, null, null], notes: '' };
    const newStretches = currentHour.stretches.map(s => s === null ? 'X' : s) as [TimeMarker, TimeMarker, TimeMarker, TimeMarker];
    saveTracker({ ...tracker, grid_state: { ...tracker.grid_state, [hour]: { ...currentHour, stretches: newStretches } } });
  };

  // --- RANDOM ENCOUNTER LOGIC ---
  const generateEncounter = () => {
    // 1. Try to find a custom table first
    console.log('Generating encounter from ID:', selectedTableId);

    const customTable = customTables?.find(t => t.id === selectedTableId);

    if (customTable) {
      const { roll, result } = rollOnTable(customTable);
      setEncounterResult({ text: `Encounter! (${customTable.name}) [Rolled ${roll}]: ${result}`, type: 'danger' });
    } else {
      setEncounterResult({ text: `Encounter triggered, but table not found. Please create or select a table.`, type: 'danger' });
    }
  };

  const performEncounterCheck = () => {
    // 1. Roll D12
    const check = Math.floor(Math.random() * 12) + 1;

    // Dragonbane Rule: Usually a 1 on D12 triggers an encounter
    if (check === 1) {
      generateEncounter();
    } else {
      setEncounterResult({ text: `Rolled ${check}. All is quiet.`, type: 'safe' });
    }
  };

  const addEncounterToNotes = (hour: number) => {
    if (!encounterResult || !tracker) return;
    const currentNotes = tracker.grid_state[hour]?.notes || '';
    const separator = currentNotes ? '; ' : '';
    const newNotes = `${currentNotes}${separator}${encounterResult.text}`;

    handleNoteChange(hour, newNotes);
    handleBlurNote(); // Save immediately
    setEncounterResult(null); // Clear result after adding
  };

  if (loading) return <LoadingSpinner />;
  if (!tracker) return <div className="p-4 text-center">No tracker found.</div>;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="secondary" size="sm" onClick={() => handleDayChange(-1)} disabled={tracker.current_day <= 1} icon={ChevronLeft}>Prev</Button>
          <div className="text-center">
            <h2 className="text-2xl font-serif font-bold text-gray-900 leading-none">Day {tracker.current_day}</h2>
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Time Tracker</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => handleDayChange(1)}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
        <div className="flex gap-2 text-xs bg-gray-50 p-2 rounded-lg border border-gray-100">
          <div className="flex items-center gap-1 text-gray-500"><X className="w-3 h-3" /> Passed</div>
          <div className="flex items-center gap-1 text-orange-500"><Flame className="w-3 h-3" /> Light</div>
          <div className="flex items-center gap-1 text-green-600"><Bed className="w-3 h-3" /> Rest</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-2">
        {SHIFTS.map(shift => {
          const isActive = activeShift === shift.id;
          return (
            <button
              key={shift.id}
              onClick={() => { setActiveShift(shift.id); setExpandedHour(null); }}
              className={`
                flex flex-col items-center justify-center p-2 rounded-xl transition-all border-2
                ${isActive
                  ? 'bg-white border-indigo-600 text-indigo-700 shadow-sm'
                  : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100'
                }
              `}
            >
              <shift.icon className={`w-5 h-5 mb-1 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
              <span className="text-sm font-bold">{shift.label}</span>
              <span className="text-[10px] opacity-70">{shift.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Active Shift View */}
      <div className="space-y-3">
        {SHIFTS.find(s => s.id === activeShift)?.hours.map(hour => {
          const data = tracker.grid_state[hour] || { stretches: [null, null, null, null], notes: '' };
          const isExpanded = expandedHour === hour;
          const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
          const completedStretches = data.stretches.filter(s => s !== null).length;

          return (
            <div key={hour} className={`bg-white border rounded-xl overflow-hidden transition-all ${isExpanded ? 'border-indigo-300 shadow-md' : 'border-gray-200 shadow-sm'}`}>

              {/* Summary Row */}
              <div
                className="flex items-center p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedHour(isExpanded ? null : hour)}
              >
                <div className="flex items-center gap-3 w-24 flex-shrink-0">
                  <Clock className={`w-5 h-5 ${isExpanded ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span className="font-mono font-bold text-gray-700">{hourLabel}</span>
                </div>

                {!isExpanded && (
                  <div className="flex gap-1 flex-1">
                    {data.stretches.map((m, i) => {
                      const type = MARKER_TYPES.find(t => t.value === m);
                      return (
                        <div key={i} className={`w-3 h-3 rounded-full border ${m ? type?.bg + ' border-transparent' : 'bg-gray-100 border-gray-300'}`} />
                      );
                    })}
                    {data.notes && <span className="ml-3 text-xs text-gray-400 truncate max-w-[150px] italic">{data.notes}</span>}
                  </div>
                )}

                {isExpanded && <div className="flex-1 font-medium text-sm text-indigo-900">Detailed Tracking</div>}

                <div className="flex items-center gap-2">
                  {completedStretches < 4 && (
                    <button
                      onClick={(e) => handleCompleteHour(hour, e)}
                      className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors"
                      title="Mark Hour Passed"
                    >
                      <ChevronsRight size={18} />
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </div>

              {/* Detailed View */}
              {isExpanded && (
                <div className="p-4 border-t border-gray-100 bg-gray-50/50 animate-in slide-in-from-top-2 fade-in duration-200">

                  {/* Stretches */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {data.stretches.map((val, idx) => {
                      const marker = MARKER_TYPES.find(m => m.value === val) || MARKER_TYPES[0];
                      const MarkerIcon = marker.icon;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleStretchClick(hour, idx)}
                          className={`
                                       h-14 rounded-lg border-2 flex flex-col items-center justify-center transition-all shadow-sm
                                       ${val ? `border-${marker.color.split('-')[1]}-200 ${marker.bg}` : 'bg-white border-dashed border-gray-300 hover:border-indigo-400 hover:bg-white'}
                                    `}
                        >
                          <MarkerIcon className={`w-5 h-5 ${marker.color}`} />
                          <span className="text-[10px] font-bold mt-1 text-gray-600 uppercase">
                            {val ? (marker.label === 'Passed' ? 'Passed' : marker.value) : `${(idx * 15)}m`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Random Encounter Section */}
                  <div className="mb-4 bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                        <Skull size={14} /> Random Encounter
                      </h4>
                      <div className="flex items-center gap-2">
                        {customTables && customTables.length > 0 ? (
                          <select
                            value={selectedTableId}
                            onChange={(e) => setSelectedTableId(e.target.value)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-gray-50 max-w-[150px]"
                          >
                            {customTables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => onTabChange && onTabChange('tables')}
                          >
                            + Create Table
                          </Button>
                        )}
                      </div>
                    </div>

                    {!customTables || customTables.length === 0 ? (
                      <div className="text-center p-3 bg-gray-50 rounded text-sm text-gray-500 italic">
                        No encounter tables found. Create one to use this feature.
                      </div>
                    ) : !encounterResult ? (
                      <div className="flex gap-2">
                        {(() => {
                          const selectedTable = customTables?.find(t => t.id === selectedTableId);
                          const isCustom = !!selectedTable;
                          const label = isCustom ? `Roll ${selectedTable.die_type.toUpperCase()}` : 'Check (D12)';

                          return (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 justify-center"
                              onClick={isCustom ? generateEncounter : performEncounterCheck}
                              title={isCustom ? "Roll on the selected table" : "Roll a D12 (1 in 12 chance of encounter)"}
                            >
                              <Dices className="w-4 h-4 mr-2" /> {label}
                            </Button>
                          );
                        })()}
                        {/* 
                           Optional: Keep a probability check button if needed, 
                           but user requested the main button to update. 
                        */}
                      </div>
                    ) : (
                      <div className={`p-2 rounded text-sm mb-2 ${encounterResult.type === 'danger' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                        <p className="font-bold mb-1">{encounterResult.type === 'danger' ? '⚠️ Encounter Triggered!' : '✅ Clear'}</p>
                        <p><TextWithDice text={encounterResult.text} contextLabel="Encounter" /></p>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" className="h-6 px-2 text-[10px]" variant="primary" onClick={() => addEncounterToNotes(hour)}>Add to Notes</Button>
                          <Button size="sm" className="h-6 px-2 text-[10px]" variant="ghost" onClick={() => setEncounterResult(null)}>Dismiss</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="relative">
                    <Edit3 className="absolute top-3 left-3 w-4 h-4 text-gray-400" />
                    <textarea
                      value={data.notes}
                      onChange={(e) => handleNoteChange(hour, e.target.value)}
                      onBlur={handleBlurNote}
                      placeholder="Notes..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

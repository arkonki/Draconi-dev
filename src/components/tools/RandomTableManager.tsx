import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRandomTables, createRandomTable, updateRandomTable, deleteRandomTable } from '../../lib/api/randomTables';
import { RandomTable, RandomTableRow } from '../../types/randomTable';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { Plus, Trash2, Edit3, Save, X, Dices, Search } from 'lucide-react';
import { rollOnTable } from '../../lib/game/randomTableUtils';

interface RandomTableManagerProps {
    partyId: string;
    allowedCategoryKeywords?: string[];
}

const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd66', 'd100'];

export function RandomTableManager({ partyId, allowedCategoryKeywords = [] }: RandomTableManagerProps) {
    const queryClient = useQueryClient();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [testResult, setTestResult] = useState<{ roll: number, result: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

    const { data: tables, isLoading } = useQuery({
        queryKey: ['randomTables', partyId],
        queryFn: () => fetchRandomTables(partyId),
    });

    const normalizedCategoryKeywords = useMemo(
        () => allowedCategoryKeywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean),
        [allowedCategoryKeywords]
    );

    const visibleTables = useMemo(() => {
        if (!tables || normalizedCategoryKeywords.length === 0) return tables || [];
        return tables.filter((table) => {
            const category = (table.category || '').toLowerCase();
            return normalizedCategoryKeywords.some((keyword) => category.includes(keyword));
        });
    }, [tables, normalizedCategoryKeywords]);

    const categoryOptions = useMemo(() => {
        const categorySet = new Set<string>();
        visibleTables.forEach((table) => {
            const category = (table.category || 'Uncategorized').trim() || 'Uncategorized';
            categorySet.add(category);
        });
        return Array.from(categorySet).sort((a, b) => a.localeCompare(b));
    }, [visibleTables]);

    useEffect(() => {
        if (selectedCategoryFilter !== 'all' && !categoryOptions.includes(selectedCategoryFilter)) {
            setSelectedCategoryFilter('all');
        }
    }, [categoryOptions, selectedCategoryFilter]);

    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    const filteredTables = useMemo(() => {
        return visibleTables.filter((table) => {
            if (editingId === table.id) return true;

            const category = (table.category || 'Uncategorized').trim() || 'Uncategorized';
            const matchesCategory = selectedCategoryFilter === 'all' || category === selectedCategoryFilter;
            if (!matchesCategory) return false;

            if (!normalizedSearchTerm) return true;

            const searchableValues = [
                table.name,
                table.category,
                table.die_type,
                ...table.rows.map((row) => row.result),
            ];

            return searchableValues.some((value) => (value || '').toLowerCase().includes(normalizedSearchTerm));
        });
    }, [visibleTables, selectedCategoryFilter, normalizedSearchTerm, editingId]);

    const hasActiveClientFilters = normalizedSearchTerm.length > 0 || selectedCategoryFilter !== 'all';

    const createMutation = useMutation({
        mutationFn: createRandomTable,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['randomTables'] });
            setIsCreating(false);
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, updates }: { id: string, updates: Partial<RandomTable> }) => updateRandomTable(id, updates),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['randomTables'] });
            setEditingId(null);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: deleteRandomTable,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['randomTables'] })
    });

    if (isLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-stone-200">
                <div>
                    <h3 className="text-xl font-bold font-serif text-stone-900">Roll Tables</h3>
                    <p className="text-sm text-stone-500">Manage custom encounter and loot tables.</p>
                </div>
                {!isCreating && !editingId && (
                    <Button onClick={() => setIsCreating(true)} icon={Plus} variant="primary">New Table</Button>
                )}
            </div>

            {isCreating && (
                <TableEditor
                    partyId={partyId}
                    onSave={(data) => createMutation.mutate(data)}
                    onCancel={() => setIsCreating(false)}
                />
            )}

            <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="relative md:col-span-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by name, category, die type, or result..."
                            className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                    </div>
                    <select
                        value={selectedCategoryFilter}
                        onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                        className="w-full p-2 border border-stone-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                        <option value="all">All Categories</option>
                        {categoryOptions.map((category) => (
                            <option key={category} value={category}>{category}</option>
                        ))}
                    </select>
                </div>
                <div className="mt-2 flex justify-between items-center">
                    <span className="text-xs text-stone-500">{filteredTables.length} of {visibleTables.length} table{visibleTables.length === 1 ? '' : 's'}</span>
                    {hasActiveClientFilters && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                setSearchTerm('');
                                setSelectedCategoryFilter('all');
                            }}
                        >
                            Clear Filters
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTables.map(table => (
                    <div key={table.id} className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                        {editingId === table.id ? (
                            <TableEditor
                                initialData={table}
                                partyId={partyId}
                                onSave={(data) => updateMutation.mutate({ id: table.id, updates: data })}
                                onCancel={() => setEditingId(null)}
                            />
                        ) : (
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 className="font-bold text-stone-800 text-lg">{table.name}</h4>
                                        <div className="flex gap-2 text-xs font-bold uppercase tracking-wider text-stone-500">
                                            <span className="bg-stone-100 px-2 py-0.5 rounded">{table.die_type.toUpperCase()}</span>
                                            <span className="bg-stone-100 px-2 py-0.5 rounded">{table.category}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => setEditingId(table.id)} icon={Edit3} />
                                        <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(table.id)} icon={Trash2} className="text-red-500 hover:text-red-700 hover:bg-red-50" />
                                    </div>
                                </div>

                                {/* Preview first few rows */}
                                <div className="text-sm text-stone-600 bg-stone-50 p-2 rounded border border-stone-100 mb-3 space-y-1">
                                    {table.rows.slice(0, 3).map((row, i) => (
                                        <div key={i} className="flex gap-2">
                                            <span className="font-mono font-bold w-12 text-right text-stone-400 shrink-0">
                                                {row.min === row.max ? row.min : `${row.min}-${row.max}`}
                                            </span>
                                            <span className="truncate">{row.result}</span>
                                        </div>
                                    ))}
                                    {table.rows.length > 3 && <div className="text-xs text-stone-400 italic text-center">+ {table.rows.length - 3} more...</div>}
                                </div>

                                <div className="flex justify-between items-center border-t border-stone-100 pt-3">
                                    <span className="text-xs text-stone-400">{table.rows.length} entries</span>
                                    <Button size="sm" variant="secondary" icon={Dices} onClick={() => {
                                        const res = rollOnTable(table);
                                        setTestResult({ roll: res.roll, result: `${table.name}: ${res.result}` });
                                    }}>Test Roll</Button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {(filteredTables.length === 0) && !isCreating && (
                <div className="text-center py-12 bg-stone-50 rounded-xl border border-dashed border-stone-300">
                    <Dices className="mx-auto h-12 w-12 text-stone-300 mb-3" />
                    <h3 className="text-lg font-medium text-stone-900">No matching tables</h3>
                    <p className="text-stone-500 mb-4 max-w-sm mx-auto">
                        {visibleTables.length === 0 && normalizedCategoryKeywords.length > 0
                            ? `No tables found for category filter: ${normalizedCategoryKeywords.join(', ')}.`
                            : hasActiveClientFilters
                                ? 'No tables match your current search/filter selection.'
                                : 'Create your first random encounter table to start rolling dynamic events for your party.'}
                    </p>
                    {hasActiveClientFilters && visibleTables.length > 0 && (
                        <div className="mb-3">
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedCategoryFilter('all');
                                }}
                            >
                                Reset Search & Filters
                            </Button>
                        </div>
                    )}
                    <Button onClick={() => setIsCreating(true)} variant="primary" icon={Plus}>Create Table</Button>
                </div>
            )}

            {/* Test Result Toast */}
            {testResult && (
                <div className="fixed bottom-6 right-6 bg-stone-900 text-white p-4 rounded-lg shadow-xl z-50 animate-in slide-in-from-bottom-5 fade-in max-w-sm">
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            <div className="text-xs text-stone-400 font-bold uppercase mb-1">Rolled {testResult.roll}</div>
                            <div className="font-medium">{testResult.result}</div>
                        </div>
                        <button onClick={() => setTestResult(null)}><X size={16} /></button>
                    </div>
                </div>
            )}
        </div>
    );
}

type RandomTableEditorPayload = Omit<RandomTable, 'id' | 'created_at' | 'updated_at'>;

function TableEditor({ initialData, partyId, onSave, onCancel }: { initialData?: RandomTable, partyId: string, onSave: (data: RandomTableEditorPayload) => void, onCancel: () => void }) {
    const [name, setName] = useState(initialData?.name || '');
    const [category, setCategory] = useState(initialData?.category || 'General');
    const [dieType, setDieType] = useState<RandomTable['die_type']>(initialData?.die_type || 'd6');
    const [rows, setRows] = useState<RandomTableRow[]>(initialData?.rows || [{ min: 1, max: 1, result: '' }]);

    const handleAddRow = () => {
        const lastRow = rows[rows.length - 1];
        let nextMin = 1;
        if (lastRow) {
            nextMin = lastRow.max + 1;
        }
        setRows([...rows, { min: nextMin, max: nextMin, result: '' }]);
    };

    const updateRow = (index: number, updates: Partial<RandomTableRow>) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], ...updates };
        setRows(newRows);
    };

    const removeRow = (index: number) => {
        setRows(rows.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        if (!name) return alert("Name is required");
        onSave({
            party_id: partyId,
            name,
            category,
            die_type: dieType,
            rows: rows.sort((a, b) => a.min - b.min) // Sort by range
        });
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-lg border-2 border-indigo-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-1">
                    <label htmlFor="random-table-name" className="block text-xs font-bold text-stone-500 uppercase mb-1">Table Name</label>
                    <input id="random-table-name" className="w-full p-2 border rounded-md" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Forest Encounters" />
                </div>
                <div>
                    <label htmlFor="random-table-category" className="block text-xs font-bold text-stone-500 uppercase mb-1">Category</label>
                    <input id="random-table-category" className="w-full p-2 border rounded-md" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Forest" />
                </div>
                <div>
                    <label htmlFor="random-table-die-type" className="block text-xs font-bold text-stone-500 uppercase mb-1">Die Type</label>
                    <select id="random-table-die-type" className="w-full p-2 border rounded-md" value={dieType} onChange={e => setDieType(e.target.value as RandomTable['die_type'])}>
                        {DIE_TYPES.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                    </select>
                </div>
            </div>

            <div className="mb-4 bg-stone-50 p-3 rounded-lg border border-stone-200">
                <div className="flex justify-between items-center mb-2">
                    <h5 className="font-bold text-sm text-stone-700">Outcomes</h5>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {rows.map((row, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                            <div className="flex items-center gap-1 w-24 shrink-0">
                                <input
                                    type="number"
                                    className="w-full p-1 text-center text-sm border rounded"
                                    value={row.min}
                                    onChange={e => updateRow(idx, { min: parseInt(e.target.value) })}
                                />
                                <span className="text-stone-400">-</span>
                                <input
                                    type="number"
                                    className="w-full p-1 text-center text-sm border rounded"
                                    value={row.max}
                                    onChange={e => updateRow(idx, { max: parseInt(e.target.value) })}
                                />
                            </div>
                            <input
                                className="flex-grow p-1 text-sm border rounded"
                                value={row.result}
                                onChange={e => updateRow(idx, { result: e.target.value })}
                                placeholder="Result..."
                            />
                            <button onClick={() => removeRow(idx)} className="text-stone-400 hover:text-red-500"><Trash2 size={16} /></button>
                        </div>
                    ))}
                </div>
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={handleAddRow} icon={Plus}>Add Row</Button>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button variant="primary" onClick={handleSave} icon={Save}>Save Table</Button>
            </div>
        </div>
    );
}

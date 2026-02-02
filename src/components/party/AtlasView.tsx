import React, { useState, useRef, useEffect } from 'react';
import { Map as MapIcon, Settings, MousePointer2, Pencil, Move, Upload, Loader2, Trash2, Check, ZoomIn, ZoomOut, Maximize, Minimize, Crosshair, Eraser, ChevronDown, User, StickyNote, MapPin, Flag, Link as LinkIcon, Edit2, Eye } from 'lucide-react';
import { Button } from '../shared/Button';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { supabase } from '../../lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PartyMap, MapPin as MapPinType, MapDrawing } from '../../types/atlas';
import { useAuth } from '../../contexts/AuthContext';

interface AtlasViewProps {
    partyId: string;
    isDM: boolean;
}

const STORAGE_LIMIT_MB = 20;
const STORAGE_LIMIT_BYTES = STORAGE_LIMIT_MB * 1024 * 1024;

function GridOverlay({ gridType, gridSize, gridOpacity, gridColor = '#000000', gridOffsetX = 0, gridOffsetY = 0, gridRotation = 0, width, height }: {
    gridType: 'none' | 'square' | 'hex';
    gridSize: number;
    gridOpacity: number;
    gridColor?: string;
    gridOffsetX?: number;
    gridOffsetY?: number;
    gridRotation?: number;
    width: number;
    height: number;
}) {
    if (gridType === 'none' || gridSize <= 5) return null;

    if (gridType === 'square') {
        const size = gridSize || 50;
        return (
            <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none z-10" style={{ opacity: gridOpacity }}>
                <defs>
                    <pattern
                        id="square-grid"
                        x={gridOffsetX}
                        y={gridOffsetY}
                        width={size}
                        height={size}
                        patternUnits="userSpaceOnUse"
                        patternTransform={`rotate(${gridRotation} ${gridOffsetX} ${gridOffsetY})`}
                    >
                        <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke={gridColor} strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#square-grid)" />
            </svg>
        );
    }

    if (gridType === 'hex') {
        const s = gridSize || 30;
        const w = s * Math.sqrt(3);
        const h = s * 3;

        return (
            <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none z-10" style={{ opacity: gridOpacity }}>
                <defs>
                    <pattern
                        id="hex-grid"
                        x={gridOffsetX}
                        y={gridOffsetY}
                        width={w}
                        height={h}
                        patternUnits="userSpaceOnUse"
                        patternTransform={`rotate(${gridRotation} ${gridOffsetX} ${gridOffsetY})`}
                    >
                        <path
                            d={`M ${w / 2} 0 L ${w} ${s * 0.5} V ${s * 1.5} L ${w / 2} ${s * 2} L 0 ${s * 1.5} V ${s * 0.5} Z M ${w / 2} ${s * 2} V ${s * 3}`}
                            fill="none"
                            stroke={gridColor}
                            strokeWidth="1"
                        />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hex-grid)" />
            </svg>
        );
    }

    return null;
}

function GridAlignmentGuide({ gridType, gridSize, gridRotation, gridColor, mousePos }: {
    gridType: 'none' | 'square' | 'hex';
    gridSize: number;
    gridRotation: number;
    gridColor: string;
    mousePos: { x: number; y: number } | null;
}) {
    if (!mousePos || gridType === 'none') return null;

    const size = gridSize || 50;
    const color = gridColor || '#4f46e5';

    if (gridType === 'square') {
        return (
            <div
                className="absolute pointer-events-none z-40"
                style={{
                    left: mousePos.x,
                    top: mousePos.y,
                    transform: `translate(-50%, -50%) rotate(${gridRotation}deg)`,
                }}
            >
                <div
                    className="grid grid-cols-3 gap-0 border-2 border-dashed border-indigo-500 rounded-sm"
                    style={{ width: size * 3, height: size * 3 }}
                >
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className="border border-indigo-400/50" style={{ width: size, height: size }} />
                    ))}
                </div>
            </div>
        );
    }

    if (gridType === 'hex') {
        const s = gridSize || 30;
        const w = s * Math.sqrt(3);
        const hexPath = `M ${w / 2} 0 L ${w} ${s * 0.5} V ${s * 1.5} L ${w / 2} ${s * 2} L 0 ${s * 1.5} V ${s * 0.5} Z`;

        const offsets = [
            { dx: 0, dy: 0 },
            { dx: w / 2, dy: 1.5 * s },
            { dx: w, dy: 0 },
            { dx: w / 2, dy: -1.5 * s },
            { dx: -w / 2, dy: -1.5 * s },
            { dx: -w, dy: 0 },
            { dx: -w / 2, dy: 1.5 * s },
        ];

        return (
            <svg
                width={w * 3}
                height={s * 6}
                className="absolute pointer-events-none z-40 overflow-visible"
                style={{
                    left: mousePos.x,
                    top: mousePos.y,
                    transform: `translate(-50%, -50%) rotate(${gridRotation}deg)`,
                }}
            >
                <g transform={`translate(${w}, ${s * 2})`}>
                    {offsets.map((off, i) => (
                        <path
                            key={i}
                            d={hexPath}
                            transform={`translate(${off.dx - w / 2}, ${off.dy - s})`}
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            strokeDasharray="4 2"
                        />
                    ))}
                </g>
            </svg>
        );
    }

    return null;
}

function MapDrawingLayer({ drawings, currentPath, width, height, isEraser, onDrawingClick }: {
    drawings: MapDrawing[];
    currentPath: { x: number; y: number }[] | null;
    width: number;
    height: number;
    isEraser?: boolean;
    onDrawingClick?: (id: string) => void;
}) {
    return (
        <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none select-none overflow-visible z-20">
            {drawings.map((draw) => (
                <polyline
                    key={draw.id}
                    points={draw.points.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={draw.color}
                    strokeWidth={draw.thickness + (isEraser ? 4 : 0)} // Increase hit area in eraser mode
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={isEraser ? "cursor-crosshair hover:opacity-50 transition-opacity" : ""}
                    pointerEvents={isEraser ? "visibleStroke" : "none"}
                    onClick={(e) => {
                        if (isEraser && onDrawingClick) {
                            e.stopPropagation();
                            onDrawingClick(draw.id);
                        }
                    }}
                />
            ))}
            {currentPath && (
                <polyline
                    points={currentPath.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 2"
                />
            )}
        </svg>
    );
}

function MapPinLayer({ pins, onPinClick, onPinMouseDown, width, height }: {
    pins: MapPinType[];
    onPinClick: (pin: MapPinType) => void;
    onPinMouseDown: (pin: MapPinType, e: React.MouseEvent) => void;
    width: number;
    height: number;
}) {
    return (
        <div
            className="absolute top-0 left-0 pointer-events-none z-30 overflow-visible"
            style={{ width, height }}
        >
            {pins.map((pin) => (
                <div
                    key={pin.id}
                    className="absolute pointer-events-auto cursor-pointer group"
                    style={{
                        left: pin.x,
                        top: pin.y,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 40
                    }}
                    onClick={(e) => { e.stopPropagation(); onPinClick(pin); }}
                    onMouseDown={(e) => onPinMouseDown(pin, e)}
                >
                    <div className="relative">
                        {pin.type === 'character' ? (
                            <div className="w-10 h-10 rounded-full border-2 border-white shadow-xl overflow-hidden bg-indigo-500 flex items-center justify-center">
                                <User className="text-white" size={20} />
                            </div>
                        ) : pin.type === 'note' ? (
                            <div className="bg-yellow-100 p-1 rounded shadow-md border border-yellow-200">
                                <StickyNote size={16} className="text-yellow-700" />
                            </div>
                        ) : pin.type === 'player_start' ? (
                            <div className="bg-green-100 p-1 rounded-full shadow-md border border-green-200 animate-bounce">
                                <Flag size={16} className="text-green-700" fill="currentColor" />
                            </div>
                        ) : (
                            <div className="text-red-500 drop-shadow-lg scale-125">
                                <MapPin size={24} fill="currentColor" stroke="white" strokeWidth={1} />
                            </div>
                        )}
                        {pin.label && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-1.5 py-0.5 bg-black/75 backdrop-blur-sm text-white text-[8px] font-bold rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                {pin.label}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function PinDetailsSidebar({ pin, onClose, onUpdate, onDelete, isDM, partyId }: {
    pin: MapPinType;
    onClose: () => void;
    onUpdate: (updates: Partial<MapPinType>) => void;
    onDelete: () => void;
    isDM: boolean;
    partyId: string;
}) {
    const [linkCopied, setLinkCopied] = React.useState(false);
    const [isEditingDesc, setIsEditingDesc] = React.useState(false);

    const handleCopyLink = () => {
        if (!pin.note_id) return;
        const url = `${window.location.origin}/adventure-party/${partyId}?noteId=${pin.note_id}`;
        navigator.clipboard.writeText(url).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        });
    };
    return (
        <div
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-0 right-0 w-80 h-full bg-white border-l shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300"
        >
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-2">
                    <div className={pin.type === 'location' ? 'text-red-500' : 'text-indigo-600'}>
                        {pin.type === 'character' ? <User size={18} /> : pin.type === 'note' ? <StickyNote size={18} /> : <MapPin size={18} />}
                    </div>
                    <h3 className="font-bold text-sm truncate max-w-[180px]">{pin.label || 'Untitled Pin'}</h3>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors">
                    <ChevronDown className="rotate-90" size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Label</label>
                        <input
                            type="text"
                            defaultValue={pin.label || ''}
                            onBlur={(e) => {
                                if (e.target.value !== pin.label) {
                                    onUpdate({ label: e.target.value });
                                }
                            }}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            placeholder="Enter pin title..."
                            readOnly={!isDM && pin.type === 'location'}
                            key={pin.id + '_label'} // Forces re-render only if pin ID changes (different pin)
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Lore / Notes</label>
                            <div className="flex items-center gap-2">
                                {pin.note_id && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={LinkIcon}
                                        onClick={handleCopyLink}
                                        title={linkCopied ? "Copied!" : "Copy link to party note"}
                                        className={`h-6 px-1.5 text-[10px] ${linkCopied ? "text-green-600 bg-green-50" : "text-indigo-600 bg-indigo-50"}`}
                                    >
                                        {linkCopied ? "Copied!" : "Copy Link"}
                                    </Button>
                                )}
                                <button
                                    onClick={() => setIsEditingDesc(!isEditingDesc)}
                                    className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                                    title={isEditingDesc ? "View Preview" : "Edit Description"}
                                >
                                    {isEditingDesc ? <Eye size={14} /> : <Edit2 size={14} />}
                                </button>
                            </div>
                        </div>

                        {isEditingDesc ? (
                            <textarea
                                defaultValue={pin.description || ''}
                                onBlur={(e) => {
                                    if (e.target.value !== pin.description) {
                                        onUpdate({ description: e.target.value });
                                    }
                                    setIsEditingDesc(false);
                                }}
                                rows={8}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                                placeholder="Add details, lore, or reminders..."
                                readOnly={!isDM && pin.type === 'location'}
                                key={pin.id + '_desc_edit'}
                                autoFocus
                            />
                        ) : (
                            <div
                                onClick={() => isDM && setIsEditingDesc(true)}
                                className={`min-h-[100px] p-1 rounded-lg transition-all ${isDM ? 'cursor-pointer hover:bg-gray-50/50' : ''}`}
                            >
                                {pin.description ? (
                                    <MarkdownRenderer content={pin.description} className="prose-sm" />
                                ) : (
                                    <p className="text-sm text-gray-400 italic p-3">No description yet.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {isDM && (
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Type</label>
                            <div className="grid grid-cols-3 gap-1">
                                {(['location', 'character', 'note'] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => onUpdate({ type: t })}
                                        className={`py-1.5 text-[10px] font-bold rounded-md border transition-all uppercase ${pin.type === t ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {isDM && (
                <div className="p-4 border-t bg-gray-50">
                    <button
                        onClick={onDelete}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-red-500 font-bold text-xs hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                    >
                        <Trash2 size={14} />
                        Delete Pin
                    </button>
                </div>
            )}
        </div>
    );
}

function MapLegend({ pins, onPinClick }: { pins: MapPinType[]; onPinClick: (pin: MapPinType) => void }) {
    const locations = pins.filter(p => p.type === 'location');
    const characters = pins.filter(p => p.type === 'character');
    const notes = pins.filter(p => p.type === 'note');

    const PinList = ({ items, title, icon: Icon, color }: { items: MapPinType[], title: string, icon: any, color: string }) => (
        items.length > 0 && (
            <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                    <Icon size={12} className={color} />
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</h4>
                </div>
                <div className="space-y-1">
                    {items.map(pin => (
                        <button
                            key={pin.id}
                            onClick={() => onPinClick(pin)}
                            className="w-full flex items-center gap-3 p-2 hover:bg-indigo-50 rounded-lg text-left transition-all group"
                        >
                            <div className={`w-1.5 h-1.5 rounded-full ${color.replace('text-', 'bg-')} opacity-40 group-hover:opacity-100 transition-opacity`} />
                            <span className="text-xs font-medium text-gray-700 truncate">{pin.label || 'Untitled Pin'}</span>
                        </button>
                    ))}
                </div>
            </div>
        )
    );

    return (
        <div className="absolute top-0 left-0 w-64 h-full bg-white/95 backdrop-blur-md border-r shadow-2xl z-40 flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b flex items-center gap-2 bg-gray-50/50">
                <MapIcon size={18} className="text-indigo-600" />
                <h3 className="font-black text-xs uppercase tracking-tighter">Map Legend / Explorer</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
                <PinList items={locations} title="Locations" icon={MapPin} color="text-red-500" />
                <PinList items={characters} title="Characters" icon={User} color="text-indigo-500" />
                <PinList items={notes} title="Notes" icon={StickyNote} color="text-yellow-600" />

                {pins.length === 0 && (
                    <div className="text-center py-12 px-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <MapPin size={24} className="text-gray-300" />
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-loose">No markers found on the map</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function MapContextMenu({ x, y, onSelectTool, onClose }: {
    x: number;
    y: number;
    onSelectTool: (tool: 'select' | 'pin' | 'draw') => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const handleOutsideClick = () => onClose();
        window.addEventListener('mousedown', handleOutsideClick);
        return () => window.removeEventListener('mousedown', handleOutsideClick);
    }, [onClose]);

    return (
        <div
            className="fixed z-[100] w-48 bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl rounded-xl p-1.5 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: x, top: y }}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 py-1 mb-1 border-b border-slate-100/50">Quick Tools</div>
            <div className="space-y-0.5">
                <button
                    onClick={() => { onSelectTool('select'); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all group"
                >
                    <div className="p-1.5 bg-slate-100 group-hover:bg-indigo-100 rounded-md transition-colors text-slate-500 group-hover:text-indigo-600">
                        <MousePointer2 size={14} />
                    </div>
                    Select & Move
                </button>
                <button
                    onClick={() => { onSelectTool('draw'); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all group"
                >
                    <div className="p-1.5 bg-slate-100 group-hover:bg-indigo-100 rounded-md transition-colors text-slate-500 group-hover:text-indigo-600">
                        <Pencil size={14} />
                    </div>
                    Drawing Tool
                </button>
                <button
                    onClick={() => { onSelectTool('pin'); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-all group"
                >
                    <div className="p-1.5 bg-slate-100 group-hover:bg-indigo-100 rounded-md transition-colors text-slate-500 group-hover:text-indigo-600">
                        <MapPin size={14} />
                    </div>
                    Drop Pin marker
                </button>
            </div>
        </div>
    );
}

export function AtlasView({ partyId, isDM }: AtlasViewProps) {
    const { user } = useAuth();
    const [activeTool, setActiveTool] = useState<'select' | 'pin' | 'draw'>('select');
    const [drawMode, setDrawMode] = useState<'pencil' | 'eraser' | 'shape'>('pencil');
    const [pinType, setPinType] = useState<'location' | 'character' | 'note' | 'player_start'>('location');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [isCalibrating, setIsCalibrating] = useState(false);
    const [isMovingGridTool, setIsMovingGridTool] = useState(false);
    const [isDraggingGrid, setIsDraggingGrid] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [calibrationOrigin, setCalibrationOrigin] = useState<{ x: number, y: number } | null>(null);
    const [guidePos, setGuidePos] = useState<{ x: number, y: number } | null>(null);

    // Pin Dragging State
    const [draggedPinId, setDraggedPinId] = useState<string | null>(null);

    const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[] | null>(null);
    const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
    const [isLegendOpen, setIsLegendOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [touchDistance, setTouchDistance] = useState<number | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [mapName, setMapName] = useState('');
    const [isGridSettingsOpen, setIsGridSettingsOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            rootRef.current?.requestFullscreen().catch(err => {
                console.error("Error attempting to enable fullscreen:", err);
            });
        } else {
            document.exitFullscreen();
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);



    const queryClient = useQueryClient();

    // --- Wheel/Zoom Helper ---
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelRaw = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                setZoom(prev => Math.min(Math.max(0.2, prev + delta), 4));
            }
        };

        container.addEventListener('wheel', handleWheelRaw, { passive: false });
        return () => container.removeEventListener('wheel', handleWheelRaw);
    }, []);

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    // --- Data Fetching ---
    const { data: maps = [], isLoading: isLoadingMaps } = useQuery({
        queryKey: ['party-maps', partyId],
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('party_maps') as any)
                .select('*')
                .eq('party_id', partyId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as PartyMap[];
        }
    });

    const activeMap = maps.find(m => m.is_active) || maps[0];

    const { data: pins = [] } = useQuery({
        queryKey: ['map-pins', activeMap?.id],
        enabled: !!activeMap?.id,
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('party_map_pins') as any)
                .select('*')
                .eq('map_id', activeMap!.id);
            if (error) throw error;
            return data as MapPinType[];
        }
    });

    // Auto-focus on Player Start Pin


    const { data: drawings = [] } = useQuery({
        queryKey: ['map-drawings', activeMap?.id],
        enabled: !!activeMap?.id,
        queryFn: async () => {
            const { data, error } = await (supabase
                .from('party_map_drawings') as any)
                .select('*')
                .eq('map_id', activeMap!.id);
            if (error) throw error;
            return data as MapDrawing[];
        }
    });




    // Auto-focus on Player Start Pin
    // Use a ref to ensure we only focus once per map load/refreshSession, not every time a pin is added
    const hasFocusedMapRef = useRef<string | null>(null);

    useEffect(() => {
        // Reset focus flag when map changes
        if (activeMap?.id && hasFocusedMapRef.current !== activeMap.id) {
            hasFocusedMapRef.current = null;
        }
    }, [activeMap?.id]);

    // Focus Pin Helper
    const focusOnPin = (pin: MapPinType, retryCount = 0) => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;

        // Wait for layout paint/resize if needed, or run immediately if ready
        setTimeout(() => {
            if (!container) return; // double check check after timeout

            // If the container isn't scrollable yet (image loading?), wait and retry
            // We retry up to 5 times (total ~1.5s)
            if ((container.scrollWidth <= container.clientWidth || container.scrollHeight <= container.clientHeight) && retryCount < 5) {
                focusOnPin(pin, retryCount + 1);
                return;
            }

            const scrollX = (pin.x * zoom) - (container.clientWidth / 2);
            const scrollY = (pin.y * zoom) - (container.clientHeight / 2);

            container.scrollTo({
                left: Math.max(0, scrollX),
                top: Math.max(0, scrollY),
                behavior: 'smooth'
            });
        }, 200 + (retryCount * 100));
    };

    useEffect(() => {
        if (!pins.length || !activeMap || !imageSize.width) return;

        // If we have already focused for this map ID, don't do it again
        if (hasFocusedMapRef.current === activeMap.id) return;

        const startPin = pins.find(p => p.type === 'player_start');
        if (startPin && scrollContainerRef.current) {
            // Mark immediately to prevent race conditions or loops
            hasFocusedMapRef.current = activeMap.id;

            // Trigger focus
            // We increase timeout for the initial load slightly to ensure image render
            setTimeout(() => focusOnPin(startPin), 200);
        }
    }, [activeMap?.id, pins, imageSize.width]); // Intentionally checking 'pins' object to react to load, but guarded by ref

    const selectedPin = pins.find(p => p.id === selectedPinId);

    // Real-time subscription
    useEffect(() => {
        if (!activeMap?.id) return;

        const channel = supabase
            .channel(`map-changes-${activeMap.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'party_map_pins', filter: `map_id=eq.${activeMap.id}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['map-pins', activeMap.id] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'party_map_drawings', filter: `map_id=eq.${activeMap.id}` }, () => {
                queryClient.invalidateQueries({ queryKey: ['map-drawings', activeMap.id] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeMap?.id, queryClient]);

    // Force refetch pins if maps refetch (sanity check for syncing)
    useEffect(() => {
        if (activeMap?.id) {
            queryClient.invalidateQueries({ queryKey: ['map-pins', activeMap.id] });
        }
    }, [maps, queryClient, activeMap?.id]);

    // --- Grid Logic ---
    const [localGrid, setLocalGrid] = useState<Partial<PartyMap>>({});

    // Computed grid for rendering (ActiveMap + Local Overrides)
    const displayGrid = activeMap ? { ...activeMap, ...localGrid } : localGrid;

    // 2. Clear overrides when switching maps
    useEffect(() => {
        // Only clear if we are NOT currently saving. 
        // If we are saving, the map reference might change due to invalidation, but we want to keep our local state until the save settles.
        if (!isSavingGrid) {
            setLocalGrid({});
        }
    }, [activeMap?.id]);

    // --- Mutations ---
    const setActiveMapMutation = useMutation({
        mutationFn: async (mapId: string) => {
            // First, set all maps of this party to inactive
            await (supabase.from('party_maps') as any).update({ is_active: false } as any).eq('party_id', partyId);
            // Then set the selected one to active
            const { error } = await (supabase.from('party_maps') as any).update({ is_active: true } as any).eq('id', mapId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['party-maps', partyId] });
        }
    });

    const deleteMapMutation = useMutation({
        mutationFn: async (map: PartyMap) => {
            if (!confirm(`Are you sure you want to delete "${map.name}"? This will also remove the image file.`)) return;

            // 1. Delete from storage if it's a supabase URL
            if (map.image_url?.includes('storage/v1/object/public/images/Atlas/')) {
                const path = map.image_url.split('Atlas/')[1];
                await supabase.storage.from('images').remove([`Atlas/${path}`]);
            }

            // 2. Delete from DB
            const { error } = await (supabase.from('party_maps') as any).delete().eq('id', map.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['party-maps', partyId] });
        }
    });

    // 3. Debounced Save
    // Only save if we have overrides (localGrid has keys)
    const [isSavingGrid, setIsSavingGrid] = useState(false);

    const updateMapGridMutation = useMutation({
        mutationFn: async (updates: Partial<PartyMap>) => {
            if (!activeMap) return;
            setIsSavingGrid(true);
            const { error } = await (supabase.from('party_maps') as any).update(updates).eq('id', activeMap.id);
            if (error) throw error;
        },
        onSuccess: () => {
            // Do NOT invalidate here immediately to avoid UI "jump"
            // Instead, let the user keep editing with their local state
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['party-maps', partyId] });
                setIsSavingGrid(false);
            }, 1000);
        },
        onError: (err: any) => {
            console.error("Failed to save map settings:", err);
            setIsSavingGrid(false);
        }
    });

    useEffect(() => {
        if (!isDM || !activeMap || Object.keys(localGrid).length === 0) return;

        const timer = setTimeout(() => {
            updateMapGridMutation.mutate(localGrid);
        }, 1000);

        return () => clearTimeout(timer);
    }, [localGrid, isDM, activeMap?.id]);

    const createPinMutation = useMutation({
        mutationFn: async (pin: Partial<MapPinType>) => {
            let noteId = null;

            // Auto-create Party Note for 'note' type pins
            if (pin.type === 'note' && user) {
                const { data: note, error: noteError } = await (supabase
                    .from('notes') as any)
                    .insert([{
                        title: pin.label || 'New Map Note',
                        content: pin.description || '',
                        category: 'Atlas',
                        party_id: partyId,
                        user_id: user.id,
                        updated_at: new Date().toISOString()
                    }])
                    .select()
                    .single();

                if (noteError) {
                    console.error("Failed to create linked note:", noteError);
                } else {
                    noteId = note.id;
                }
            }

            // If this is a player start pin, remove any existing ones first
            // We use a robust sequential check to enforce the Singleton constraint
            if (pin.type === 'player_start') {
                // First, check if any exist (optional debugging)
                // Then delete ALL of them for this map
                const { error: deleteError } = await (supabase
                    .from('party_map_pins') as any)
                    .delete({ count: 'exact' })
                    .eq('map_id', pin.map_id)
                    .eq('type', 'player_start');

                if (deleteError) {
                    console.error("Failed to clear previous start location:", deleteError);
                    throw new Error("Could not clear previous start pin"); // Abort insert if delete fails
                }
            }

            const { error } = await (supabase
                .from('party_map_pins') as any)
                .insert([{ ...pin, note_id: noteId }]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['map-pins', activeMap?.id] });
        }
    });

    const updatePinMutation = useMutation({
        mutationFn: async ({ id, updates, noteId }: { id: string; updates: Partial<MapPinType>; noteId?: string | null }) => {
            // 1. Update Pin
            const { error } = await (supabase
                .from('party_map_pins') as any)
                .update(updates)
                .eq('id', id);
            if (error) throw error;

            // 2. Sync Linked Note
            if (noteId && (updates.label !== undefined || updates.description !== undefined)) {
                const noteUpdates: any = { updated_at: new Date().toISOString() };
                if (updates.label !== undefined) noteUpdates.title = updates.label;
                if (updates.description !== undefined) noteUpdates.content = updates.description;

                const { error: noteError } = await (supabase
                    .from('notes') as any)
                    .update(noteUpdates)
                    .eq('id', noteId);

                if (noteError) console.error("Failed to sync note:", noteError);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['map-pins', activeMap?.id] });
        }
    });

    const createDrawingMutation = useMutation({
        mutationFn: async (drawing: Partial<MapDrawing>) => {
            const { error } = await (supabase
                .from('party_map_drawings') as any)
                .insert([drawing]);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['map-drawings', activeMap?.id] });
        }
    });

    const deleteDrawingMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase
                .from('party_map_drawings') as any)
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['map-drawings', activeMap?.id] });
        }
    });

    const deletePinMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await (supabase
                .from('party_map_pins') as any)
                .delete()
                .eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['map-pins', activeMap?.id] });
            setSelectedPinId(null);
        }
    });

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        setImageSize({ width: naturalWidth, height: naturalHeight });
    };

    // --- Interaction Handlers ---
    const handlePinMouseDown = (pin: MapPinType, e: React.MouseEvent) => {
        if (activeTool !== 'select') return;

        // Restriction: Only DM can move 'location' pins
        if (!isDM && pin.type === 'location') return;

        e.stopPropagation(); // Prevent map drag
        setDraggedPinId(pin.id);
        setSelectedPinId(pin.id); // Select it too
        // We rely on relative movement in mouseMove, using the initial mouse position
        // Ideally we grab the offset from the pin center, but center-snap dragging is often easier.
    };

    const handleMapMouseDown = (e: React.MouseEvent) => {
        const rect = imgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mx = (e.clientX - rect.left) / zoom;
        const my = (e.clientY - rect.top) / zoom;

        // Clear selection when clicking map background (if not starting a drag on a pin)
        if (!draggedPinId && selectedPinId) setSelectedPinId(null);

        if (isCalibrating) {
            const origin = { x: Math.round(mx), y: Math.round(my) };
            setCalibrationOrigin(origin);
            setLocalGrid(prev => ({
                ...prev,
                grid_offset_x: origin.x,
                grid_offset_y: origin.y
            }));
            setIsDraggingGrid(true);
        } else if (isMovingGridTool) {
            setIsDraggingGrid(true);
            setDragStart({ x: e.clientX, y: e.clientY });
        } else if (activeTool === 'select') {
            // Pan logic could go here if we implemented panning. 
            // For now 'select' effectively acts as "do nothing but let me drag pins"
            // But if we clicked background, maybe we want to pan?
            // Since we handle pin mouse down separately, this is just background click.
        } else if (activeTool === 'draw') {
            if (drawMode === 'pencil') {
                setCurrentPath([{ x: mx, y: my }]);
            }
        } else if (activeTool === 'pin') {
            if (createPinMutation.isPending) return;

            createPinMutation.mutate({
                map_id: activeMap!.id,
                party_id: partyId,
                x: mx,
                y: my,
                type: pinType,
                label: pinType === 'location' ? 'New Location' : pinType === 'character' ? 'New Character' : pinType === 'player_start' ? 'Player Start' : 'New Note',
                color: pinType === 'character' ? '#4f46e5' : pinType === 'player_start' ? '#16a34a' : '#ef4444'
            });
        }
    };

    const handleMapMouseMove = (e: React.MouseEvent) => {
        const rect = imgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mx = (e.clientX - rect.left) / zoom;
        const my = (e.clientY - rect.top) / zoom;

        setGuidePos({ x: mx, y: my });

        if (isDraggingGrid && isCalibrating && calibrationOrigin) {
            const dx = mx - calibrationOrigin.x;
            const dy = my - calibrationOrigin.y;

            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 5) return; // Ignore micro-jitters

            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            setLocalGrid(prev => {
                let size = distance;
                if ((prev.grid_type || activeMap?.grid_type) === 'hex') {
                    // For hex, if we drag from top-center vertex to next vertex, dist is 's'.
                    size = distance;
                }

                return {
                    ...prev,
                    grid_size: Math.round(size),
                    grid_rotation: Math.round(angle)
                };
            });
        } else if (isDraggingGrid && isMovingGridTool) {
            const dx = (e.clientX - dragStart.x) / zoom;
            const dy = (e.clientY - dragStart.y) / zoom;

            setLocalGrid(prev => ({
                ...prev,
                grid_offset_x: ((prev.grid_offset_x !== undefined ? prev.grid_offset_x : activeMap?.grid_offset_x) || 0) + dx,
                grid_offset_y: ((prev.grid_offset_y !== undefined ? prev.grid_offset_y : activeMap?.grid_offset_y) || 0) + dy
            }));

            setDragStart({ x: e.clientX, y: e.clientY });
        } else if (activeTool === 'draw' && currentPath) {
            setCurrentPath(prev => [...(prev || []), { x: mx, y: my }]);
        } else if (draggedPinId && activeTool === 'select') {
            // Optimistic Dragging
            // We update the cache directly for smooth 60fps dragging without waiting for DB
            queryClient.setQueryData(['map-pins', activeMap?.id], (oldPins: MapPinType[] | undefined) => {
                if (!oldPins) return [];
                return oldPins.map(p =>
                    p.id === draggedPinId ? { ...p, x: mx, y: my } : p
                );
            });
        }
    };

    const handleMapMouseUp = () => {
        if (isDraggingGrid && isCalibrating) {
            setIsCalibrating(false);
            setCalibrationOrigin(null);
        }

        if (activeTool === 'draw' && currentPath && currentPath.length > 1) {
            createDrawingMutation.mutate({
                map_id: activeMap!.id,
                party_id: partyId,
                points: currentPath,
                color: '#4f46e5',
                thickness: 3
            });
            setCurrentPath(null);
        }

        if (draggedPinId) {
            // Finalize drag
            const pin = pins.find(p => p.id === draggedPinId);
            if (pin) {
                updatePinMutation.mutate({
                    id: pin.id,
                    updates: { x: pin.x, y: pin.y }
                });
            }
            setDraggedPinId(null);
        }
    };

    const handleMapMouseLeave = () => {
        setIsDraggingGrid(false);
        setGuidePos(null);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            setTouchDistance(dist);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && touchDistance !== null) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const delta = (dist - touchDistance) / 200;
            setZoom(prev => Math.min(Math.max(0.2, prev + delta), 4));
            setTouchDistance(dist);
        }
    };

    const handleTouchEnd = () => {
        setTouchDistance(null);
    };

    // --- Storage Helper ---
    const checkStorageLimit = async (newFileSize: number): Promise<boolean> => {
        const { data: files, error } = await supabase.storage
            .from('images')
            .list(`Atlas/${partyId}`);

        if (error) return true; // Fail safe

        const currentTotal = files.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
        return (currentTotal + newFileSize) <= STORAGE_LIMIT_BYTES;
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !isDM) return;
        setPendingFile(file);
        setMapName(file.name.split('.')[0]);
    };

    const handleFileUpload = async () => {
        if (!pendingFile || !isDM || !mapName.trim()) return;

        setUploadError(null);
        setIsUploading(true);

        try {
            // 1. Quota Check
            const isWithinLimit = await checkStorageLimit(pendingFile.size);
            if (!isWithinLimit) {
                throw new Error(`Storage limit reached. Your party has a ${STORAGE_LIMIT_MB}MB quota for maps.`);
            }

            // 2. Upload to Storage
            const fileExt = pendingFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
            const filePath = `Atlas/${partyId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(filePath, pendingFile);

            if (uploadError) throw uploadError;

            // 3. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('images')
                .getPublicUrl(filePath);

            // 4. Create DB Entry
            const { error: dbError } = await (supabase.from('party_maps') as any).insert([{
                party_id: partyId,
                name: mapName.trim(),
                image_url: publicUrl,
                is_active: true
            } as any]);

            if (dbError) throw dbError;

            // 5. Success
            await queryClient.invalidateQueries({ queryKey: ['party-maps', partyId] });
            setPendingFile(null);
            setMapName('');
        } catch (err: any) {
            console.error('Upload failed:', err);
            setUploadError(err.message || 'Failed to upload map.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };



    return (
        <div ref={rootRef} className={`flex flex-col bg-slate-900/5 overflow-hidden border border-gray-200 shadow-sm relative group/app transition-all duration-300 ${isFullscreen ? 'h-screen w-screen rounded-none bg-slate-100' : 'h-[750px] rounded-xl'}`}>
            {isDM && (
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                />
            )}

            {/* --- MAP CANVAS --- */}
            <div
                ref={containerRef}
                className="flex-1 relative overflow-hidden bg-slate-100 cursor-crosshair select-none"
                onContextMenu={handleContextMenu}
                onMouseDown={handleMapMouseDown}
                onMouseMove={handleMapMouseMove}
                onMouseUp={handleMapMouseUp}
                onMouseLeave={handleMapMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >



                {isGridSettingsOpen && activeMap && (
                    <div
                        className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 z-[60] animate-in fade-in slide-in-from-top-2"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grid Configuration</h4>
                            {isSavingGrid && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 rounded-full animate-pulse">
                                    <div className="w-1 h-1 bg-indigo-600 rounded-full" />
                                    <span className="text-[7px] font-black text-indigo-600 uppercase">Saving...</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 mb-1.5 uppercase">Type</label>
                                <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
                                    {(['none', 'square', 'hex'] as const).map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setLocalGrid(prev => ({ ...prev, grid_type: t }))}
                                            className={`px-2 py-1.5 text-[10px] font-bold rounded-md transition-all uppercase ${displayGrid.grid_type === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {displayGrid.grid_type !== 'none' && (
                                <>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setIsMovingGridTool(!isMovingGridTool);
                                                if (isCalibrating) setIsCalibrating(false);
                                            }}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-[10px] font-bold transition-all ${isMovingGridTool ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            <Move size={12} />
                                            {isMovingGridTool ? 'Moving Grid...' : 'Move Grid'}
                                        </button>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase">Size</label>
                                            <span className="text-[10px] font-mono text-indigo-600">{displayGrid.grid_size}px</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="5"
                                            max="1000"
                                            value={displayGrid.grid_size || 50}
                                            onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_size: parseInt(e.target.value) }))}
                                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>

                                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Crosshair size={12} className="text-indigo-600" />
                                                <h5 className="text-[10px] font-bold text-indigo-900 uppercase">Calibration</h5>
                                            </div>
                                            {!isCalibrating ? (
                                                <button
                                                    onClick={() => {
                                                        setIsCalibrating(true);
                                                        setIsMovingGridTool(false);
                                                    }}
                                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 underline"
                                                >
                                                    Start
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => { setIsCalibrating(false); }}
                                                    className="text-[10px] font-bold text-red-600 hover:text-red-700 underline"
                                                >
                                                    Stop
                                                </button>
                                            )}
                                        </div>

                                        {isCalibrating && (
                                            <div className="space-y-2">
                                                <div className={`flex items-center gap-2 p-2 rounded-lg bg-indigo-100 border border-indigo-200`}>
                                                    <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">!</div>
                                                    <p className="text-[10px] text-indigo-900 font-bold">Click and Drag on the map to define a single grid cell.</p>
                                                </div>
                                                <p className="text-[9px] text-indigo-700/70 px-1 italic">The grid will automatically align to your starting point and scale to your finish point.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase">Opacity</label>
                                            <span className="text-[10px] font-mono text-indigo-600">{Math.round((displayGrid.grid_opacity || 0) * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={displayGrid.grid_opacity || 0.5}
                                            onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_opacity: parseFloat(e.target.value) }))}
                                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Offset X</label>
                                            <input
                                                type="number"
                                                value={displayGrid.grid_offset_x || 0}
                                                onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_offset_x: parseInt(e.target.value) }))}
                                                className="w-full px-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Offset Y</label>
                                            <input
                                                type="number"
                                                value={displayGrid.grid_offset_y || 0}
                                                onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_offset_y: parseInt(e.target.value) }))}
                                                className="w-full px-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase">Rotation</label>
                                            <div className="flex gap-2">
                                                <span className="text-[10px] font-mono text-indigo-600">{displayGrid.grid_rotation || 0}°</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setLocalGrid(prev => ({ ...prev, grid_rotation: ((prev.grid_rotation || 0) + 90) % 360 })); }}
                                                    className="text-[10px] font-bold text-indigo-600 hover:underline"
                                                >
                                                    +90°
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            step="1"
                                            value={displayGrid.grid_rotation || 0}
                                            onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_rotation: parseInt(e.target.value) }))}
                                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1.5">Color</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={displayGrid.grid_color || '#000000'}
                                                onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_color: e.target.value }))}
                                                className="w-8 h-8 rounded cursor-pointer border-none bg-transparent"
                                            />
                                            <input
                                                type="text"
                                                value={displayGrid.grid_color || '#000000'}
                                                onChange={(e) => setLocalGrid(prev => ({ ...prev, grid_color: e.target.value }))}
                                                className="flex-1 px-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md font-mono uppercase"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t">
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={isSavingGrid || Object.keys(localGrid).length === 0}
                                className="w-full py-1.5 text-[10px] mb-2"
                                onClick={() => updateMapGridMutation.mutate(localGrid)}
                            >
                                {isSavingGrid ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full py-1.5 text-[10px]"
                                onClick={() => setIsGridSettingsOpen(false)}
                            >
                                Close Settings
                            </Button>
                        </div>
                    </div>
                )}



                {/* Map Canvas Area */}

                {
                    activeMap?.image_url ? (
                        <div
                            ref={scrollContainerRef}
                            className="w-full h-full overflow-auto custom-scrollbar relative bg-slate-100"
                        >
                            <div
                                className="shadow-2xl origin-top-left absolute top-0 left-0"
                                onMouseDown={handleMapMouseDown}
                                onMouseMove={handleMapMouseMove}
                                onMouseUp={handleMapMouseUp}
                                onMouseLeave={handleMapMouseLeave}
                                style={{
                                    cursor: isCalibrating ? 'crosshair' : isMovingGridTool ? 'move' : 'default',
                                    transform: `scale(${zoom})`,
                                    width: imageSize.width || 'auto',
                                    height: imageSize.height || 'auto'
                                }}
                            >
                                <img
                                    ref={imgRef}
                                    src={activeMap.image_url}
                                    alt={activeMap.name}
                                    className="max-w-none select-none pointer-events-none"
                                    style={{ minWidth: '100%', minHeight: '100%', objectFit: 'contain' }}
                                    onLoad={handleImageLoad}
                                    draggable={false}
                                />
                                {imageSize.width > 0 && (
                                    <>
                                        <GridOverlay
                                            gridType={displayGrid.grid_type as any || 'none'}
                                            gridSize={displayGrid.grid_size || 50}
                                            gridOpacity={displayGrid.grid_opacity || 0.5}
                                            gridColor={displayGrid.grid_color}
                                            gridOffsetX={displayGrid.grid_offset_x}
                                            gridOffsetY={displayGrid.grid_offset_y}
                                            gridRotation={displayGrid.grid_rotation}
                                            width={imageSize.width}
                                            height={imageSize.height}
                                        />
                                        <MapDrawingLayer
                                            drawings={drawings}
                                            currentPath={currentPath}
                                            width={imageSize.width}
                                            height={imageSize.height}
                                            isEraser={activeTool === 'draw' && drawMode === 'eraser'}
                                            onDrawingClick={(id) => deleteDrawingMutation.mutate(id)}
                                        />
                                        <MapPinLayer
                                            pins={pins}
                                            onPinClick={(pin) => setSelectedPinId(pin.id)}
                                            onPinMouseDown={handlePinMouseDown}
                                            width={imageSize.width}
                                            height={imageSize.height}
                                        />
                                        {isCalibrating && calibrationOrigin && (
                                            <div
                                                className="absolute pointer-events-none z-50 border-t-2 border-indigo-500 origin-left"
                                                style={{
                                                    left: calibrationOrigin.x,
                                                    top: calibrationOrigin.y,
                                                    width: Math.sqrt(
                                                        Math.pow((guidePos?.x || 0) - calibrationOrigin.x, 2) +
                                                        Math.pow((guidePos?.y || 0) - calibrationOrigin.y, 2)
                                                    ),
                                                    transform: `rotate(${Math.atan2(
                                                        (guidePos?.y || 0) - calibrationOrigin.y,
                                                        (guidePos?.x || 0) - calibrationOrigin.x
                                                    )}rad)`
                                                }}
                                            >
                                                <div className="absolute right-0 top-0 w-2 h-2 bg-indigo-500 rounded-full -translate-y-1/2 translate-x-1/2 shadow-lg" />
                                            </div>
                                        )}
                                        {isCalibrating && !isDraggingGrid && (
                                            <GridAlignmentGuide
                                                gridType={localGrid.grid_type as any || 'none'}
                                                gridSize={localGrid.grid_size || 50}
                                                gridRotation={localGrid.grid_rotation || 0}
                                                gridColor={localGrid.grid_color || '#4f46e5'}
                                                mousePos={guidePos}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 space-y-4">
                            <MapIcon size={64} className="opacity-10" />
                            <div className="text-center max-w-xs px-6">
                                <p className="font-bold text-slate-400">No Active Map</p>
                                <p className="text-sm opacity-60 mt-1">
                                    {isDM
                                        ? "Upload a world map or tactical layout to begin navigating with your party."
                                        : "Ask your DM to upload a map for this adventure."}
                                </p>
                                {isDM && (
                                    <div className="mt-8 flex flex-col gap-3">
                                        <Button variant="primary" icon={Upload} onClick={() => fileInputRef.current?.click()}>
                                            Choose Image File
                                        </Button>
                                        <p className="text-[10px] text-slate-500">Max size 20MB per party. Supports PNG, JPG, WEBP.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {/* Floating Toolkit */}
                {
                    activeMap && (
                        <div
                            className="absolute top-6 left-1/2 -translate-x-1/2 z-40"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-1.5 flex items-center gap-1.5">
                                {/* Legend */}
                                <button
                                    onClick={() => setIsLegendOpen(!isLegendOpen)}
                                    className={`p-2 rounded-xl transition-all ${isLegendOpen ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
                                    title="Toggle Legend"
                                >
                                    <MapIcon size={18} />
                                </button>

                                {/* Map Selector */}
                                <div className="relative group">
                                    <button className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all min-w-[120px] justify-between">
                                        <span className="truncate max-w-[100px]">{activeMap?.name || 'Select Map'}</span>
                                        <ChevronDown size={14} className="text-slate-400" />
                                    </button>

                                    <div className="absolute top-full left-0 mt-2 w-64 bg-white/95 backdrop-blur-xl border border-slate-200/50 rounded-xl shadow-2xl py-2 z-50 invisible group-hover:visible transition-all opacity-0 group-hover:opacity-100 origin-top-left animate-in fade-in zoom-in-95">
                                        {maps.length === 0 ? (
                                            <div className="px-4 py-3 text-xs text-gray-400 text-center">No maps uploaded yet.</div>
                                        ) : (
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Your Maps</div>
                                                {maps.map(map => (
                                                    <div key={map.id} className="flex items-center justify-between px-3 py-2 hover:bg-indigo-50 cursor-pointer group/item transition-colors">
                                                        <button
                                                            onClick={() => setActiveMapMutation.mutate(map.id)}
                                                            className={`flex-1 text-left text-xs font-medium ${map.id === activeMap?.id ? 'text-indigo-600' : 'text-slate-600'}`}
                                                        >
                                                            {map.name}
                                                        </button>
                                                        {map.id === activeMap?.id && <Check size={14} className="text-indigo-600" />}
                                                        {isDM && map.id !== activeMap?.id && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); deleteMapMutation.mutate(map); }}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover/item:opacity-100 transition-all"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {isDM && (
                                            <div className="p-2 border-t mt-1">
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={isUploading}
                                                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-bold transition-colors"
                                                >
                                                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                    {isUploading ? 'Uploading...' : 'Upload New Map'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {isSavingGrid && (
                                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" title="Saving Grid..." />
                                )}

                                <div className="w-px h-6 bg-slate-200 mx-0.5" />

                                <button
                                    onClick={() => setActiveTool('select')}
                                    className={`p-2 rounded-xl transition-all ${activeTool === 'select' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
                                    title="Select & Move"
                                >
                                    <MousePointer2 size={18} />
                                </button>

                                <div className="w-px h-6 bg-slate-200 mx-0.5" />

                                <button
                                    onClick={() => setActiveTool('draw')}
                                    className={`p-2 rounded-xl transition-all ${activeTool === 'draw' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
                                    title="Draw Tool"
                                >
                                    <Pencil size={18} />
                                </button>

                                {activeTool === 'draw' && (
                                    <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200">
                                        <button
                                            onClick={() => setDrawMode('pencil')}
                                            className={`p-1.5 rounded-lg transition-all ${drawMode === 'pencil' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            onClick={() => setDrawMode('eraser')}
                                            className={`p-1.5 rounded-lg transition-all ${drawMode === 'eraser' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                        >
                                            <Eraser size={14} />
                                        </button>
                                    </div>
                                )}

                                <div className="w-px h-6 bg-slate-200 mx-0.5" />

                                <button
                                    onClick={() => setActiveTool('pin')}
                                    className={`p-2 rounded-xl transition-all ${activeTool === 'pin' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
                                    title="Pin Tool"
                                >
                                    <MapPin size={18} />
                                </button>

                                {activeTool === 'pin' && (
                                    <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-200">
                                        <button
                                            onClick={() => setPinType('location')}
                                            className={`p-1.5 rounded-lg transition-all ${pinType === 'location' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                            title="Location Pin"
                                        >
                                            <MapPin size={14} />
                                        </button>
                                        <button
                                            onClick={() => setPinType('character')}
                                            className={`p-1.5 rounded-lg transition-all ${pinType === 'character' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                            title="Character Token"
                                        >
                                            <User size={14} />
                                        </button>
                                        <button
                                            onClick={() => setPinType('note')}
                                            className={`p-1.5 rounded-lg transition-all ${pinType === 'note' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                            title="Note Pin"
                                        >
                                            <StickyNote size={14} />
                                        </button>
                                        {isDM && (
                                            <button
                                                onClick={() => setPinType('player_start')}
                                                className={`p-1.5 rounded-lg transition-all ${pinType === 'player_start' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                                                title="Player Start Location"
                                            >
                                                <Flag size={14} />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {isDM && (
                                    <>
                                        <div className="w-px h-6 bg-slate-200 mx-0.5" />

                                        <button
                                            onClick={() => setIsGridSettingsOpen(true)}
                                            className={`p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-all ${isGridSettingsOpen ? 'bg-slate-100' : ''}`}
                                            title="Grid Settings"
                                        >
                                            <Settings size={18} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                }

                {/* Explorer Legend */}
                {
                    isLegendOpen && (
                        <MapLegend
                            pins={pins}
                            onPinClick={(pin) => {
                                setSelectedPinId(pin.id);
                                focusOnPin(pin);
                            }}
                        />
                    )
                }

                {/* Pin Detail Sidebar */}
                {
                    selectedPin && (
                        <PinDetailsSidebar
                            pin={selectedPin}
                            isDM={isDM}
                            partyId={partyId}
                            onClose={() => setSelectedPinId(null)}
                            onUpdate={(updates) => updatePinMutation.mutate({ id: selectedPin.id, updates, noteId: selectedPin.note_id })}
                            onDelete={() => deletePinMutation.mutate(selectedPin.id)}
                        />
                    )
                }

                {/* ZOOM CONTROLS */}
                {
                    activeMap && (
                        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-50">
                            <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl flex flex-col p-1">
                                <button
                                    onClick={() => setZoom(prev => Math.min(prev + 0.2, 4))}
                                    className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                                    title="Zoom In"
                                >
                                    <ZoomIn size={18} />
                                </button>
                                <div className="h-[1px] bg-gray-200 mx-2" />
                                <button
                                    onClick={() => setZoom(1)}
                                    className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors flex flex-col items-center"
                                    title="Reset Zoom"
                                >
                                    <span className="text-[10px] font-bold">{Math.round(zoom * 100)}%</span>
                                    <Maximize size={12} className="mt-0.5 opacity-50" />
                                </button>
                                <div className="h-[1px] bg-gray-200 mx-2" />
                                <button
                                    onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.2))}
                                    className="p-2 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                                    title="Zoom Out"
                                >
                                    <ZoomOut size={18} />
                                </button>
                            </div>

                            <button
                                onClick={toggleFullscreen}
                                className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl flex items-center justify-center p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition-all font-bold"
                                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                            >
                                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                            </button>
                        </div>
                    )
                }

                {/* Context Menu */}
                {
                    contextMenu && (
                        <MapContextMenu
                            x={contextMenu.x}
                            y={contextMenu.y}
                            onSelectTool={setActiveTool}
                            onClose={() => setContextMenu(null)}
                        />
                    )
                }

                {/* Error State */}
                {
                    uploadError && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white rounded-lg text-xs font-bold shadow-xl animate-in fade-in slide-in-from-top-4">
                            {uploadError}
                            <button onClick={() => setUploadError(null)} className="ml-2 hover:opacity-70">×</button>
                        </div>
                    )
                }

                {/* Loading State Overlay */}
                {
                    isLoadingMaps && (
                        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-10">
                            <Loader2 size={32} className="text-white animate-spin opacity-50" />
                        </div>
                    )
                }

                <div className="absolute bottom-4 left-4 flex flex-col gap-2 pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[10px] font-mono border border-white/10 flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${activeMap ? 'bg-green-500' : 'bg-red-500'}`} />
                        {activeMap ? `COORD: ${Math.round(guidePos?.x || 0)}, ${Math.round(guidePos?.y || 0)}` : 'DISCONNECTED'}
                    </div>
                </div>
            </div>

            {/* Name Prompt Modal */}
            {
                pendingFile ? (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                        <Upload size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Name Your Map</h3>
                                        <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">New Map Upload</p>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-500 mb-6 flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <span className="font-bold text-gray-400">FILE:</span>
                                    <span className="truncate italic">{pendingFile.name}</span>
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Map Title</label>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={mapName}
                                            onChange={(e) => setMapName(e.target.value)}
                                            placeholder="e.g. World Map, Darkest Dungeon..."
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all shadow-sm"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && mapName.trim() && !isUploading) handleFileUpload();
                                                if (e.key === 'Escape') { setPendingFile(null); setMapName(''); }
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-8 flex gap-3">
                                    <Button
                                        variant="outline"
                                        className="flex-1 rounded-xl h-11"
                                        onClick={() => { setPendingFile(null); setMapName(''); }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="primary"
                                        className="flex-1 rounded-xl h-11 shadow-lg shadow-indigo-200"
                                        onClick={handleFileUpload}
                                        disabled={!mapName.trim() || isUploading}
                                        icon={isUploading ? Loader2 : Check}
                                    >
                                        {isUploading ? 'Uploading...' : 'Upload Map'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null
            }
        </div >
    );
}

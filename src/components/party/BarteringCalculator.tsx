

import { useState, useEffect } from 'react';
import { Coins, TrendingDown, TrendingUp, XCircle, Search, ChevronDown, Tag, Check } from 'lucide-react';
import { fetchItems, GameItem } from '../../lib/api/items';
import { parseCost } from '../../lib/equipment';

interface BarteringCalculatorProps {
    initialCost?: number;
    initialMode?: 'buying' | 'selling';
    initialCurrency?: string;
    onConfirm?: (finalPrice: number, unit: string) => void;
    confirmLabel?: string;
}

export function BarteringCalculator({ initialCost, initialMode = 'buying', initialCurrency = 'Coins', onConfirm, confirmLabel = 'Apply Trade' }: BarteringCalculatorProps) {
    const [basePrice, setBasePrice] = useState<number | ''>('');
    const [mode, setMode] = useState<'buying' | 'selling'>('buying');
    const [result, setResult] = useState<'none' | 'success' | 'dragon' | 'demon'>('none');

    // Sync with props
    useEffect(() => {
        if (initialCost !== undefined) setBasePrice(initialCost);
        if (initialMode) setMode(initialMode);
    }, [initialCost, initialMode]);

    // Item Search State
    const [items, setItems] = useState<GameItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [currencyUnit, setCurrencyUnit] = useState<string>(initialCurrency);

    // Load items on mount
    useEffect(() => {
        fetchItems().then(data => setItems(data || []));
    }, []);

    const filteredItems = searchQuery
        ? items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
        : [];

    const handleSelectItem = (item: GameItem) => {
        setSearchQuery(item.name);
        setIsSearchOpen(false);

        // Parse Cost
        if (item.cost) {
            const { gold, silver, copper } = parseCost(item.cost);

            // Heuristic: Convert to highest relevant unit for user convenience
            if (gold > 0) {
                setBasePrice(gold + (silver / 10) + (copper / 100));
                setCurrencyUnit('Gold');
            } else if (silver > 0) {
                setBasePrice(silver + (copper / 10));
                setCurrencyUnit('Silver');
            } else if (copper > 0) {
                setBasePrice(copper);
                setCurrencyUnit('Copper');
            } else {
                setBasePrice(0);
                setCurrencyUnit('Coins');
            }
        }
    };

    // Helper to round to 2 decimals (nearest copper)
    const roundToTwo = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

    const calculatePrice = () => {
        if (typeof basePrice !== 'number') return 0;

        if (result === 'demon') return null; // Refused

        switch (result) {
            case 'success':
                // Buying: Price goes down 20% (Example: 100 -> 80)
                // Selling: Price goes up 20% (Example: 100 -> 120)
                return mode === 'buying' ? basePrice * 0.8 : basePrice * 1.2;
            case 'dragon':
                // Dragon: Halved or Doubled
                // Buying: Halved (Good for buyer) -> 0.5
                // Selling: Doubled (Good for seller) -> 2.0
                return mode === 'buying' ? basePrice * 0.5 : basePrice * 2.0;
            default:
                return basePrice;
        }
    };

    const finalPrice = calculatePrice();
    const roundedFinal = finalPrice !== null ? roundToTwo(finalPrice) : 0;

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative z-20">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1">Item Lookup (Optional)</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={14} className="text-gray-400" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onFocus={() => setIsSearchOpen(true)}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsSearchOpen(true);
                        }}
                        className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                        placeholder="Search for item to find price..."
                    />
                    {searchQuery && (
                        <button
                            onClick={() => { setSearchQuery(''); setBasePrice(''); setIsSearchOpen(false); }}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            <XCircle size={14} />
                        </button>
                    )}
                </div>

                {/* Dropdown Results */}
                {isSearchOpen && searchQuery && filteredItems.length > 0 && (
                    <div className="absolute mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-sm overflow-auto border border-gray-200 divide-y divide-gray-100">
                        {filteredItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => handleSelectItem(item)}
                                className="w-full text-left px-4 py-2 hover:bg-indigo-50 flex justify-between items-center group transition-colors"
                            >
                                <div className="flex flex-col">
                                    <span className="font-bold text-gray-800">{item.name}</span>
                                    <span className="text-[10px] text-gray-400 uppercase">{item.category}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 font-mono group-hover:bg-white group-hover:text-indigo-600">
                                        {item.cost || 'N/A'}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Input: Base Price */}
            <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Base Price & Unit</label>
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Tag size={16} className="text-gray-400" />
                        </div>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={basePrice}
                            onChange={(e) => setBasePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-400 focus:outline-none focus:placeholder-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm transition duration-150 ease-in-out font-mono font-bold text-gray-800"
                            placeholder="0"
                        />
                    </div>

                    <button
                        onClick={() => typeof basePrice === 'number' && setBasePrice(basePrice / 2)}
                        className="px-3 py-2 bg-white border border-gray-300 rounded-md text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors whitespace-nowrap"
                        title="Half Price (Selling used items)"
                    >
                        ½ Price
                    </button>

                    <div className="relative w-1/3">
                        <select
                            value={currencyUnit}
                            onChange={(e) => setCurrencyUnit(e.target.value)}
                            className="block w-full pl-2 pr-8 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-bold text-gray-600 focus:ring-indigo-500 focus:border-indigo-500 appearance-none"
                        >
                            <option value="Coins">Coins</option>
                            <option value="Gold">Gold</option>
                            <option value="Silver">Silver</option>
                            <option value="Copper">Copper</option>
                        </select>
                        <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-gray-500">
                            <ChevronDown size={14} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Input: Mode (Buying/Selling) */}
            <div className="flex bg-gray-100/50 p-1 rounded-lg border border-gray-200">
                <button
                    onClick={() => setMode('buying')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'buying'
                        ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100'
                        : 'text-gray-500 hover:bg-gray-200/50'
                        }`}
                >
                    Buying
                </button>
                <button
                    onClick={() => setMode('selling')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-bold rounded-md transition-all ${mode === 'selling'
                        ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100'
                        : 'text-gray-500 hover:bg-gray-200/50'
                        }`}
                >
                    Selling
                </button>
            </div>

            {/* Input: Roll Result */}
            <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Bartering Roll</label>
                <div className="grid grid-cols-3 gap-2">
                    <button
                        onClick={() => setResult(result === 'success' ? 'none' : 'success')}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${result === 'success'
                            ? 'bg-green-50 border-green-200 text-green-800 ring-1 ring-green-300'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                    >
                        <span className="text-xs font-bold">Success</span>
                        <span className="text-[10px] text-gray-500">+/- 20%</span>
                    </button>

                    <button
                        onClick={() => setResult(result === 'dragon' ? 'none' : 'dragon')}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${result === 'dragon'
                            ? 'bg-green-100 border-green-300 text-green-900 ring-1 ring-green-400'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                    >
                        <span className="text-xs font-bold">Dragon</span>
                        <span className="text-[10px] text-gray-500">x2 or ½</span>
                    </button>

                    <button
                        onClick={() => setResult(result === 'demon' ? 'none' : 'demon')}
                        className={`flex flex-col items-center justify-center p-2 rounded-lg border text-center transition-all ${result === 'demon'
                            ? 'bg-red-50 border-red-200 text-red-800 ring-1 ring-red-300'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                    >
                        <span className="text-xs font-bold">Demon</span>
                        <span className="text-[10px] text-gray-500">Refuse</span>
                    </button>
                </div>
            </div>

            {/* Output: Result */}
            <div className={`mt-4 rounded-lg p-4 flex items-center justify-between border ${result === 'demon'
                ? 'bg-red-50 border-red-100 text-red-900'
                : result === 'none'
                    ? 'bg-gray-50 border-gray-200 text-gray-500'
                    : 'bg-indigo-50 border-indigo-100 text-gray-900'
                }`}>
                <div className="flex flex-col">
                    <span className="text-xs uppercase font-bold opacity-70">
                        {result === 'demon' ? 'Trade Status' : 'Final Price'}
                    </span>
                    <span className="text-xl font-bold font-mono">
                        {result === 'demon' ? 'Refused' : roundedFinal}
                    </span>
                    {result !== 'none' && result !== 'demon' && typeof basePrice === 'number' && (
                        <span className="text-xs mt-1 flex items-center gap-1">
                            {finalPrice && finalPrice < basePrice ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                            {roundToTwo(Math.abs(finalPrice! - basePrice))} ({Math.round(((finalPrice! - basePrice) / basePrice) * 100)}%)
                        </span>
                    )}
                </div>

                {result !== 'demon' && (
                    <Coins size={24} className="opacity-20" />
                )}
                {result === 'demon' && (
                    <XCircle size={24} className="text-red-400" />
                )}
            </div>

            {onConfirm && finalPrice !== null && result !== 'demon' && (
                <div className="pt-2">
                    <button
                        onClick={() => onConfirm(roundedFinal, currencyUnit)}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors"
                    >
                        <Check size={18} />
                        {confirmLabel} ({roundedFinal} {currencyUnit})
                    </button>
                    <p className="text-xs text-center text-gray-400 mt-2">
                        This will remove the selected items and add {roundedFinal} {currencyUnit} to the party stash.
                    </p>
                </div>
            )}
        </div>
    );
}

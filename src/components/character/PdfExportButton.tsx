import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Character } from '../../types/character';
import { fetchItems, GameItem } from '../../lib/api/items';

const GAME_ITEMS_QUERY = {
  queryKey: ['gameItems'] as const,
  queryFn: fetchItems,
  staleTime: 1000 * 60 * 10
};

export const PdfExportButton = ({ character, variant = 'default' }: { character: Character; variant?: 'default' | 'menu' }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      // Load heavy PDF modules and fetch item metadata only when export is requested.
      const [{ pdf }, { DragonbanePdfDocument }, allItems] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./CharacterSheetPdf'),
        queryClient.ensureQueryData<GameItem[]>(GAME_ITEMS_QUERY),
      ]);

      const blob = await pdf(
        <DragonbanePdfDocument character={character} allItems={allItems} />
      ).toBlob();
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${character.name.replace(/\s+/g, '_')}_Dragonbane.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); 
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Could not generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button 
      type="button"
      role={variant === 'menu' ? 'menuitem' : undefined}
      onClick={handleDownload}
      disabled={isGenerating}
      className={variant === 'menu'
        ? 'group flex min-h-12 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-bold text-stone-700 transition-colors hover:border-[#d4c5a3] hover:bg-[#f0e6d2] hover:text-[#1a472a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a472a] disabled:opacity-70'
        : 'flex h-12 w-14 flex-col items-center justify-center rounded border border-[#4a8a62] bg-[#2c5e3f] text-[#e8d5b5] shadow-sm transition-colors hover:bg-[#3a7a52] active:bg-[#1a472a] touch-manipulation disabled:opacity-70 md:h-14 md:w-16'}
    >
      {variant === 'menu' ? (
        <>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-100 text-[#1a472a] transition-colors group-hover:bg-[#1a472a] group-hover:text-[#e8d5b5]">
            {isGenerating ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
          </span>
          <span>{isGenerating ? 'Creating PDF…' : 'Export character PDF'}</span>
        </>
      ) : (
        <>
          {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
          <span className="mt-1 text-[9px] font-bold uppercase md:text-[10px]">PDF</span>
        </>
      )}
    </button>
  );
};

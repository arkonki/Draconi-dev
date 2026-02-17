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

export const PdfExportButton = ({ character }: { character: Character }) => {
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
      onClick={handleDownload}
      disabled={isGenerating}
      className="flex flex-col items-center justify-center w-14 h-12 md:w-16 md:h-14 bg-[#2c5e3f] hover:bg-[#3a7a52] active:bg-[#1a472a] rounded border border-[#4a8a62] text-[#e8d5b5] transition-colors shadow-sm touch-manipulation disabled:opacity-70"
    >
      {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
      <span className="text-[9px] md:text-[10px] uppercase font-bold mt-1">PDF</span>
    </button>
  );
};

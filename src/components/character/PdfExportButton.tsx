import React, { useState } from 'react'; // Added { useState }
import { pdf } from '@react-pdf/renderer';
import { Download, Loader2 } from 'lucide-react';
import { Character } from '../../types/character';
import { DragonbanePdfDocument } from './CharacterSheetPdf'; // Ensure this path matches where you saved the document component

export const PdfExportButton = ({ character }: { character: Character }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      // 1. Generate PDF Blob
      const blob = await pdf(<DragonbanePdfDocument character={character} />).toBlob();
      
      // 2. Create Download Link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${character.name.replace(/\s+/g, '_')}_Dragonbane.pdf`;
      
      // 3. Trigger Download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url); // Cleanup
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
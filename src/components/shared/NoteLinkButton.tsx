import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface NoteLinkButtonProps {
    noteId: string;
    partyId?: string;
    title?: string;
    className?: string;
}

export function NoteLinkButton({ noteId, partyId, title: initialTitle, className = '' }: NoteLinkButtonProps) {
    const navigate = useNavigate();
    const [, setSearchParams] = useSearchParams();

    // Fetch note title if not provided
    const { data: fetchedTitle, isLoading } = useQuery({
        queryKey: ['note-title', noteId],
        queryFn: async () => {
            if (initialTitle) return initialTitle;
            const { data, error } = await supabase
                .from('notes')
                .select('title')
                .eq('id', noteId)
                .single();
            
            if (error) throw error;
            return data.title;
        },
        enabled: !!noteId && !initialTitle,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const displayTitle = initialTitle || fetchedTitle || 'View Note';

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // If we are already on the party page, just update the search params
        if (partyId && window.location.pathname.includes(`/adventure-party/${partyId}`)) {
            setSearchParams({ noteId });
        } else if (partyId) {
            // Otherwise navigate to the party page with the noteId
            navigate(`/adventure-party/${partyId}?noteId=${noteId}`);
        } else {
            // Fallback for global notes page if needed
            navigate(`/notes?noteId=${noteId}`);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors group/note-btn font-sans font-medium text-sm no-underline my-1 disabled:opacity-70 ${className}`}
        >
            {isLoading ? (
                <Loader2 size={16} className="text-indigo-400 animate-spin" />
            ) : (
                <FileText size={16} className="text-indigo-500" />
            )}
            <span className="truncate max-w-[200px]">{displayTitle}</span>
            {!isLoading && <ExternalLink size={12} className="opacity-0 group-hover/note-btn:opacity-50 transition-opacity" />}
        </button>
    );
}

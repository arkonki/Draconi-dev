import React from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface NoteLinkButtonProps {
    noteId: string;
    partyId?: string;
    title?: string;
    className?: string;
}

export function NoteLinkButton({ noteId, partyId, title, className = '' }: NoteLinkButtonProps) {
    const navigate = useNavigate();
    const [_, setSearchParams] = useSearchParams();

    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // If we are already on the party page, just update the search params
        if (window.location.pathname.includes(`/adventure-party/${partyId}`)) {
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
            className={`inline-flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors group/note-btn font-sans font-medium text-sm no-underline my-1 ${className}`}
        >
            <FileText size={16} className="text-indigo-500" />
            <span className="truncate max-w-[200px]">{title || 'View Note'}</span>
            <ExternalLink size={12} className="opacity-0 group-hover/note-btn:opacity-50 transition-opacity" />
        </button>
    );
}

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, MessageSquare, Loader2, ArrowDown, FileText, Smile, Bold, Italic, Code, Hand, Book, Trash2, ExternalLink } from 'lucide-react';
import { useAuth } from '../../contexts/useAuth';
// 1. Import deleteMessage
import { getPartyMessages, sendMessage, deleteMessage, Message } from '../../lib/api/chat';
import { supabase } from '../../lib/supabase';
import { Button } from '../shared/Button';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MessageContent } from './MessageContent';
import type { Character } from '../../types/character';

// ... (RPG_EMOJIS and getAvatarColor helper remain the same) ...
const RPG_EMOJIS = ["⚔️", "🛡️", "🏹", "🪄", "🎲", "📜", "💰", "💀", "🐉", "🧙‍♂️", "🧝", "🍺", "🍖", "🔥", "✨", "❤️", "👍", "👎"];

const getAvatarColor = (userId: string) => {
  const colors = [ 'bg-red-100 text-red-700', 'bg-green-100 text-green-700', 'bg-blue-100 text-blue-700', 'bg-yellow-100 text-yellow-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700', 'bg-orange-100 text-orange-700', ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

interface PartyChatProps {
  partyId: string;
  members: Character[]; 
}

export function PartyChat({ partyId, members }: PartyChatProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setSearchParams] = useSearchParams();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', partyId],
    queryFn: () => getPartyMessages(partyId),
  });

  // --- REALTIME SUBSCRIPTION (INSERT & DELETE) ---
  useEffect(() => {
    const channel = supabase.channel(`chat:${partyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `party_id=eq.${partyId}` }, (payload) => {
          const incoming = payload.new as Message;
          if (incoming.content.includes(`<<<POKE:${user?.id}>>>`)) triggerShake();

          queryClient.setQueryData(['messages', partyId], (oldData: Message[] = []) => {
            if (oldData.find(msg => msg.id === incoming.id)) return oldData;
            return [...oldData, incoming];
          });
      })
      // 2. LISTEN FOR DELETES
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          const deletedId = payload.old.id;
          queryClient.setQueryData(['messages', partyId], (oldData: Message[] = []) => {
            return oldData.filter(msg => msg.id !== deletedId);
          });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [partyId, queryClient, user?.id]);

  // ... (triggerShake, scrollToBottom, handleScroll logic remains the same) ...
  const triggerShake = () => { setIsShaking(true); setTimeout(() => setIsShaking(false), 500); };
  const scrollToBottom = (smooth = true) => { messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' }); setShowScrollButton(false); };
  useEffect(() => { scrollToBottom(); }, [messages.length]);
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200);
  };

  // --- ACTIONS ---
  
  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm("Delete this message?")) return;
    try {
      // Optimistic delete from UI
      queryClient.setQueryData(['messages', partyId], (oldData: Message[] = []) => oldData.filter(m => m.id !== messageId));
      await deleteMessage(messageId);
    } catch (error) {
      console.error("Failed to delete", error);
      queryClient.invalidateQueries({ queryKey: ['messages', partyId] }); // Revert on fail
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    
    const content = newMessage;
    let finalContent = content;

    // Poke Logic
    if (content.startsWith('/poke ')) {
      const targetName = content.substring(6).toLowerCase();
      const targetMember = members.find(m => m.name.toLowerCase().includes(targetName));
      if (targetMember) {
        finalContent = `<<<POKE:${targetMember.user_id}>>> 👉 Poked ${targetMember.name}!`;
      } else {
        alert(`Could not find member "${targetName}"`);
        return;
      }
    }

    setNewMessage(''); 
    setShowEmojiPicker(false);
    setIsSending(true);

    try {
      const sentMessage = await sendMessage(partyId, user.id, finalContent);
      queryClient.setQueryData(['messages', partyId], (oldData: Message[] = []) => { return [...oldData, sentMessage]; });
      scrollToBottom();
    } catch (error) {
      console.error('Failed to send message', error);
      setNewMessage(content); 
    } finally {
      setIsSending(false);
    }
  };

  const insertText = (text: string, wrap: boolean = false) => {
    if (!inputRef.current) return;
    const start = inputRef.current.selectionStart || 0;
    const end = inputRef.current.selectionEnd || 0;
    const currentVal = newMessage;
    const newVal = wrap 
      ? currentVal.substring(0, start) + text + currentVal.substring(start, end) + text + currentVal.substring(end)
      : currentVal.substring(0, start) + text + currentVal.substring(end);
    setNewMessage(newVal);
    inputRef.current.focus();
  };

  // --- NAVIGATION HELPERS ---
  const openSharedNote = (noteId: string) => { setSearchParams({ noteId: noteId }); };
  
  // 3. Open Compendium Entry (Deep Link)
  const openCompendiumEntry = (entryId: string) => {
    navigate(`/compendium?entryId=${entryId}`);
  };

  const getSenderInfo = (userId: string) => {
    if (userId === user?.id) return { name: 'You', initials: 'ME' };
    const member = members.find(m => m.user_id === userId || m.id === userId); 
    const name = member?.name || 'Unknown';
    const initials = name.substring(0, 2).toUpperCase();
    return { name, initials };
  };

  if (isLoading) return <div className="h-64 flex items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className={`flex flex-col h-[calc(100vh-14rem)] min-h-[500px] bg-gray-50 rounded-xl overflow-hidden border border-gray-200 shadow-inner relative ${isShaking ? 'animate-shake' : ''}`}>
      
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar z-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <div className="bg-white p-4 rounded-full shadow-sm mb-3"><MessageSquare className="w-8 h-8 text-indigo-200" /></div>
            <p className="font-medium text-gray-500">No messages yet.</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.user_id === user?.id;
            const prevMsg = messages[index - 1];
            const isSameUser = prevMsg && prevMsg.user_id === msg.user_id;
            const isNearTime = prevMsg && (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() < 5 * 60 * 1000);
            const shouldGroup = isSameUser && isNearTime;
            const { name, initials } = getSenderInfo(msg.user_id);
            const avatarColor = getAvatarColor(msg.user_id);

            // --- CONTENT PARSING ---
            const noteMatch = msg.content.match(/<<<NOTE:([^:]+):([^>]+)>>>/);
            // 4. PARSE COMPENDIUM TAG
            const compendiumMatch = msg.content.match(/<<<COMPENDIUM:([^:]+):([^>]+)>>>/);
            const pokeMatch = msg.content.match(/<<<POKE:([^>]+)>>>/);
            
            const isEmote = msg.content.startsWith('/me ');
            const isRoll = msg.content.startsWith('🎲');
            
            let displayContent = msg.content;
            if (noteMatch) displayContent = msg.content.replace(/<<<NOTE:[^>]+>>>/, '').trim();
            if (compendiumMatch) displayContent = msg.content.replace(/<<<COMPENDIUM:[^>]+>>>/, '').trim();
            if (pokeMatch) displayContent = msg.content.replace(/<<<POKE:[^>]+>>>/, '').trim();
            if (isEmote) displayContent = msg.content.substring(4);

            return (
              <div key={msg.id} className={`flex gap-3 ${shouldGroup ? 'mt-1' : 'mt-4'} ${isMe ? 'flex-row-reverse' : 'flex-row'} group`}>
                <div className="flex-shrink-0 w-8 flex flex-col items-center">
                  {!shouldGroup && !isMe ? (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${avatarColor}`}>{initials}</div>
                  ) : <div className="w-8" />}
                </div>

                <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {!shouldGroup && !isMe && <span className="text-[11px] font-semibold text-gray-500 mb-1 ml-1">{name}</span>}

                  <div className={`
                    px-4 py-2.5 text-[15px] shadow-sm break-words relative transition-all
                    ${isRoll || noteMatch || compendiumMatch || pokeMatch
                       ? 'bg-white border-l-4 border-indigo-500 text-gray-800 rounded-lg w-full' 
                       : isMe 
                         ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' 
                         : 'bg-white text-gray-800 border border-gray-100 rounded-2xl rounded-tl-sm'
                    }
                    ${isEmote ? 'italic font-serif bg-amber-50 text-amber-900 border border-amber-200 rounded-lg w-full' : ''}
                  `}>
                    
                    {/* Note Button */}
                    {noteMatch && (
                      <button onClick={() => openSharedNote(noteMatch[1])} className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg p-2 mb-2 w-full text-left transition-colors">
                        <div className="bg-white p-1.5 rounded-md border border-indigo-100 shadow-sm"><FileText size={16} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Shared Note</div>
                          <div className="font-semibold text-sm truncate">{noteMatch[2]}</div>
                        </div>
                      </button>
                    )}

                    {/* 5. COMPENDIUM CARD */}
                    {compendiumMatch && (
                      <button onClick={() => openCompendiumEntry(compendiumMatch[1])} className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg p-2 mb-2 w-full text-left transition-colors group/card">
                        <div className="bg-white p-1.5 rounded-md border border-emerald-100 shadow-sm"><Book size={16} className="text-emerald-600"/></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Compendium</div>
                          <div className="font-semibold text-sm truncate">{compendiumMatch[2]}</div>
                        </div>
                        <ExternalLink size={12} className="opacity-0 group-hover/card:opacity-50" />
                      </button>
                    )}

                    {/* Poke Icon */}
                    {pokeMatch && (
                       <div className="flex items-center gap-2 font-bold text-indigo-600 mb-1">
                          <Hand size={16} className="animate-pulse" /> POKE
                       </div>
                    )}

                    <div className={pokeMatch ? 'text-gray-500 text-sm' : ''}>
                        {isEmote && <span className="opacity-50 not-italic mr-1 select-none">*</span>}
                        <MessageContent content={displayContent} />
                    </div>
                  </div>
                  
                  {/* Footer Line: Time & Delete */}
                  <div className={`flex items-center gap-2 mt-1 mx-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                     {!shouldGroup && <span className="text-[9px] text-gray-300">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                     
                     {/* 6. DELETE BUTTON (Only for my messages) */}
                     {isMe && (
                        <button 
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-0.5"
                          title="Delete message"
                        >
                          <Trash2 size={10} />
                        </button>
                     )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {showScrollButton && (
        <button onClick={() => scrollToBottom()} className="absolute bottom-24 right-6 bg-white border border-gray-200 shadow-lg p-2 rounded-full text-indigo-600 hover:bg-gray-50 transition-all animate-bounce z-10"><ArrowDown className="w-5 h-5" /></button>
      )}

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-3 sm:p-4 z-20">
        <div className="flex items-center gap-2 mb-2 px-1">
           <button type="button" onClick={() => insertText('**', true)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded" title="Bold"><Bold size={16}/></button>
           <button type="button" onClick={() => insertText('*', true)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded" title="Italic"><Italic size={16}/></button>
           <button type="button" onClick={() => insertText('`', true)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded" title="Code"><Code size={16}/></button>
           <div className="w-px h-4 bg-gray-200 mx-1"></div>
           <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-1.5 hover:bg-gray-100 rounded ${showEmojiPicker ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400 hover:text-indigo-600'}`} title="Emoji"><Smile size={16}/></button>
           <div className="flex-1"></div>
           <div className="text-[10px] text-gray-400 hidden sm:block">/poke @name to poke</div>
        </div>

        {showEmojiPicker && (
          <div className="absolute bottom-20 left-4 bg-white border border-gray-200 shadow-xl rounded-lg p-3 grid grid-cols-6 gap-2 w-64 animate-in slide-in-from-bottom-2 z-50">
             {RPG_EMOJIS.map(e => (
               <button key={e} type="button" onClick={() => insertText(e)} className="text-xl hover:bg-gray-100 rounded p-1 transition-colors">{e}</button>
             ))}
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-end gap-2 relative">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Message..."
              disabled={isSending}
              className="w-full text-base border border-gray-300 rounded-2xl pl-4 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:bg-gray-100 transition-all shadow-sm"
            />
          </div>
          <Button type="submit" disabled={!newMessage.trim() || isSending} variant="primary" className="rounded-full w-12 h-12 flex items-center justify-center p-0 flex-shrink-0 shadow-md">
            {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

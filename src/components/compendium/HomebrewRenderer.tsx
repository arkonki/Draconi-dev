import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkHomebrewery from '../../lib/remark-homebrewery'; 
import { Shield, Skull, Scroll, Flame, Diamond } from 'lucide-react';

interface MarkdownRendererProps { content: string; className?: string; }

// --- Custom Component Blocks ---

const MonsterBlock = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="my-6 md:my-8 border-y-[3px] border-teal-800 bg-[#f4f1ea] p-3 md:p-4 shadow-sm relative font-sans text-sm leading-relaxed text-gray-900 break-inside-avoid overflow-hidden rounded-sm">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-800 text-[#f4f1ea] px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-sm flex items-center gap-2 shadow-sm whitespace-nowrap z-10"><Skull size={10} className="text-teal-200" />Creature / NPC<Skull size={10} className="text-teal-200" /></div>
      <div className="prose prose-sm max-w-none 
        prose-h1:font-serif prose-h1:text-teal-900 prose-h1:border-b prose-h1:border-teal-800/20 prose-h1:pb-2 prose-h1:text-xl md:prose-h1:text-2xl prose-h1:mt-2
        prose-h2:text-teal-800 prose-h2:text-[10px] md:prose-h2:text-xs prose-h2:font-bold prose-h2:uppercase prose-h2:tracking-wider prose-h2:mt-4 prose-h2:mb-1
        prose-h3:text-teal-900 prose-h3:font-serif prose-h3:font-bold prose-h3:border-b prose-h3:border-teal-800/10 prose-h3:text-sm
        prose-strong:text-teal-900 prose-strong:font-bold prose-p:my-2 prose-p:text-gray-800 prose-p:leading-6 prose-li:my-0
        [&>table]:my-2 [&>table]:w-full [&>table]:text-[11px] md:[&>table]:text-xs [&>table>tbody>tr>td]:py-1 [&>table>tbody>tr>td]:border-b [&>table>tbody>tr>td]:border-teal-800/10
      ">{children}</div>
    </div>
  );
};

const SpellBlock = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="my-6 mx-0 md:mx-1 border border-teal-600/50 bg-white shadow-[3px_3px_0px_0px_rgba(15,118,110,0.15)] p-3 relative overflow-hidden break-inside-avoid rounded-sm">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 via-teal-600 to-teal-400" />
      <div className="absolute -bottom-4 -right-4 text-teal-50 opacity-10 rotate-12 pointer-events-none"><Flame size={80} className="md:w-24 md:h-24" /></div>
      <div className="relative z-10 prose prose-sm max-w-none prose-h1:font-serif prose-h1:text-teal-800 prose-h1:mb-2 prose-h1:text-lg md:prose-h1:text-xl prose-h1:mt-0 prose-p:text-gray-700 prose-strong:text-teal-700">{children}</div>
    </div>
  );
};

const NoteBlock = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="my-6 md:my-8 bg-[#e8e6d1] p-3 md:p-4 relative border-l-4 border-teal-700 shadow-inner rounded-r-sm break-inside-avoid">
      <div className="absolute -left-3.5 top-4 md:top-5 bg-teal-700 rounded-full p-1 md:p-1.5 text-[#e8e6d1] shadow-sm z-10"><Scroll size={12} className="md:w-3.5 md:h-3.5" /></div>
      <div className="prose prose-stone max-w-none font-serif italic text-gray-800 leading-relaxed text-sm md:text-base prose-p:mb-2 prose-h4:not-italic prose-h4:text-teal-800 prose-h4:uppercase prose-h4:text-xs prose-h4:font-bold prose-h4:tracking-widest prose-h4:mb-2">{children}</div>
    </div>
  );
};

// --- Main Renderer ---

export function HomebrewRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`phb font-serif text-gray-900 leading-relaxed w-full overflow-x-hidden ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHomebrewery]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ children }) => (<h1 className="text-2xl md:text-4xl font-extrabold text-teal-900 uppercase tracking-wide border-b-2 border-teal-900/30 pb-3 md:pb-4 mb-6 md:mb-8 mt-4 md:mt-6 text-center font-serif break-words">{children}</h1>),
          h2: ({ children }) => (<div className="flex items-center gap-2 md:gap-3 mt-6 md:mt-8 mb-3 md:mb-4 border-b border-teal-200 pb-1 break-inside-avoid"><Diamond size={8} className="text-teal-600 fill-teal-600 md:w-2.5 md:h-2.5 shrink-0" /><h2 className="text-lg md:text-xl font-bold text-teal-800 uppercase tracking-widest flex-1 font-sans break-words">{children}</h2><Diamond size={8} className="text-teal-600 fill-teal-600 md:w-2.5 md:h-2.5 shrink-0" /></div>),
          h3: ({ children }) => (<h3 className="text-base md:text-lg font-bold text-teal-900 uppercase mt-4 md:mt-6 mb-2 border-l-4 border-teal-500 pl-3 font-sans break-words">{children}</h3>),
          h4: ({ children }) => (<h4 className="text-sm md:text-base font-bold text-gray-800 mt-4 mb-1 font-sans">{children}</h4>),
          p: ({ children }) => <p className="mb-4 text-left md:text-justify leading-6 md:leading-7 text-sm md:text-[15px]">{children}</p>,
          hr: () => (<div className="my-8 md:my-10 flex items-center justify-center gap-4 opacity-60"><div className="h-px w-full bg-gradient-to-l from-teal-800 to-transparent" /><Shield size={16} className="text-teal-800 shrink-0 fill-teal-100 md:w-5 md:h-5" /><div className="h-px w-full bg-gradient-to-r from-teal-800 to-transparent" /></div>),
          blockquote: ({ children }) => (<blockquote className="border-l-4 border-teal-300 pl-4 italic text-gray-600 my-6 bg-gray-50/50 py-2 pr-2 text-sm md:text-base rounded-r-sm">{children}</blockquote>),
          
          // --- TABLES (Optimized for Mobile) ---
          table: ({ children }) => (
            <div className="my-4 w-full block overflow-x-auto max-w-full rounded-sm border border-teal-800/30 shadow-sm bg-white break-inside-avoid">
              <table className="w-full text-[11px] md:text-sm text-left min-w-[250px] border-collapse table-auto">{children}</table>
            </div>
          ),
          thead: ({ children }) => (<thead className="bg-[#dcd9c6] text-teal-900 font-bold uppercase text-[10px] md:text-xs tracking-wider border-b border-teal-800/20 font-sans">{children}</thead>),
          tbody: ({ children }) => <tbody className="divide-y divide-teal-800/10 font-sans">{children}</tbody>,
          tr: ({ children }) => <tr className="even:bg-[#f4f1ea] odd:bg-white hover:bg-teal-50 transition-colors">{children}</tr>,
          // Reduced padding from px-3 to px-1.5 for mobile
          th: ({ children }) => <th className="px-1.5 py-2 md:px-4 md:py-2.5 font-bold align-bottom">{children}</th>,
          td: ({ children }) => <td className="px-1.5 py-2 md:px-4 md:py-2 align-top text-gray-700">{children}</td>,

          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const type = match ? match[1] : '';
            const contentString = String(children).replace(/\n$/, '');
            if (!inline) {
              if (type === 'monster') return <MonsterBlock><ReactMarkdown remarkPlugins={[remarkGfm]}>{contentString}</ReactMarkdown></MonsterBlock>;
              if (type === 'spell') return <SpellBlock><ReactMarkdown remarkPlugins={[remarkGfm]}>{contentString}</ReactMarkdown></SpellBlock>;
              if (type === 'note') return <NoteBlock><ReactMarkdown remarkPlugins={[remarkGfm]}>{contentString}</ReactMarkdown></NoteBlock>;
            }
            return <code className={`${className} bg-gray-100 text-teal-800 px-1.5 py-0.5 rounded text-[0.8em] md:text-[0.9em] font-mono border border-gray-200 break-words`} {...props}>{children}</code>;
          },
          a: ({ children, href, ...props }) => {
            const isExternal = href?.startsWith('http');
            return (<a href={href} className="text-teal-700 font-bold hover:text-teal-900 hover:underline transition-colors" target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} {...props}>{children}</a>);
          },
          img: ({ src, alt }) => (<figure className="my-6 md:my-8 flex flex-col items-center"><img src={src} alt={alt} className="max-w-full h-auto max-h-[500px] object-contain rounded shadow-md border border-stone-200 bg-white p-1" loading="lazy" />{alt && <figcaption className="text-xs text-gray-500 mt-2 italic text-center">{alt}</figcaption>}</figure>)
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

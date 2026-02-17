import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkHomebrewery from '../../lib/remark-homebrewery';
import { Shield, Skull, Scroll, Flame, Diamond } from 'lucide-react';

interface MarkdownRendererProps { content: string; className?: string; }
type MarkdownChildrenProps = { children?: React.ReactNode };
type MarkdownCodeProps = React.ComponentPropsWithoutRef<'code'> & {
  className?: string;
  children?: React.ReactNode;
  inline?: boolean;
};

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

const NPCBlock = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="my-8 md:my-10 border-2 border-teal-700 bg-[#e6e2d3] p-4 md:p-6 shadow-md relative font-serif text-gray-900 rounded-sm w-full max-w-full">
      {/* Header Badge */}
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-teal-800 text-[#e6e2d3] px-4 py-1 text-xs font-bold uppercase tracking-[0.15em] border border-[#e6e2d3] shadow-md z-10 flex items-center gap-2 rounded-sm whitespace-nowrap">
        <Skull size={12} className="text-teal-200" />NPC Profile<Skull size={12} className="text-teal-200" />
      </div>

      <div className="prose prose-sm max-w-none break-words
        prose-h3:font-serif prose-h3:text-teal-900 prose-h3:text-center prose-h3:text-xl md:prose-h3:text-2xl prose-h3:font-bold prose-h3:uppercase prose-h3:tracking-widest prose-h3:border-b-2 prose-h3:border-teal-800/50 prose-h3:pb-2 prose-h3:mb-4 prose-h3:mt-2
        prose-strong:text-teal-900 prose-strong:font-bold
        prose-p:text-gray-900 prose-p:leading-6 prose-p:my-2
        
        /* Table Styling for Stats */
        [&>table]:w-full [&>table]:border-collapse [&>table]:my-4 [&>table]:bg-teal-900/5 [&>table]:rounded-sm [&>table]:table-fixed
        [&>table>thead>tr>th]:text-teal-900 [&>table>thead>tr>th]:p-2 [&>table>thead>tr>th]:uppercase [&>table>thead>tr>th]:text-[10px] [&>table>thead>tr>th]:tracking-wider
        [&>table>tbody>tr>td]:p-2 [&>table>tbody>tr>td]:text-center [&>table>tbody>tr>td]:text-sm [&>table>tbody>tr>td]:font-bold [&>table>tbody>tr>td]:border-t [&>table>tbody>tr>td]:border-teal-900/10 [&>table>tbody>tr>td]:break-words
        
        /* Stats row background */
        [&>p>strong]:text-teal-900
      ">{children}</div>

      {/* Decorative corners */}
      <div className="absolute top-1 left-1 w-2 h-2 border-l-2 border-t-2 border-teal-800 opacity-50"></div>
      <div className="absolute top-1 right-1 w-2 h-2 border-r-2 border-t-2 border-teal-800 opacity-50"></div>
      <div className="absolute bottom-1 left-1 w-2 h-2 border-l-2 border-b-2 border-teal-800 opacity-50"></div>
      <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-teal-800 opacity-50"></div>
    </div>
  );
};

const ItemBlock = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="my-6 md:my-8 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4 shadow-md rounded-lg relative overflow-hidden break-inside-avoid">
      <div className="absolute top-0 right-0 p-2 opacity-5"><Diamond size={64} className="text-amber-900" /></div>
      <div className="prose prose-sm max-w-none
         prose-h1:font-serif prose-h1:text-amber-900 prose-h1:text-lg prose-h1:border-b prose-h1:border-amber-900/20 prose-h1:pb-1
         prose-strong:text-amber-800 prose-p:text-amber-950/80
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

          code({ className, children, ...props }: MarkdownCodeProps) {
            const match = /language-(\w+)/.exec(className || '');
            const type = match ? match[1] : '';
            const contentString = String(children).replace(/\n$/, '');
            const isInline = !match;

            if (!isInline && match) {
              const nestedComponents: Record<string, ({ children }: MarkdownChildrenProps) => React.JSX.Element> = {
                table: ({ children }) => (
                  <div className="my-2 w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="border-b border-gray-300/20">{children}</thead>,
                tbody: ({ children }) => <tbody className="align-top">{children}</tbody>,
                tr: ({ children }) => <tr className="border-b border-gray-300/10">{children}</tr>,
                td: ({ children }) => <td className="p-1 align-top">{children}</td>,
                th: ({ children }) => <th className="p-1 font-bold text-[10px] uppercase opacity-70 align-bottom">{children}</th>,
                p: ({ children }) => <p className="mb-2 whitespace-normal break-words">{children}</p>
              };

              if (type === 'monster') return <MonsterBlock><ReactMarkdown remarkPlugins={[remarkGfm]} components={nestedComponents}>{contentString}</ReactMarkdown></MonsterBlock>;
              if (type === 'npc') return <NPCBlock><ReactMarkdown remarkPlugins={[remarkGfm]} components={nestedComponents}>{contentString}</ReactMarkdown></NPCBlock>;
              if (type === 'item') return <ItemBlock><ReactMarkdown remarkPlugins={[remarkGfm]} components={nestedComponents}>{contentString}</ReactMarkdown></ItemBlock>;
              if (type === 'spell') return <SpellBlock><ReactMarkdown remarkPlugins={[remarkGfm]} components={nestedComponents}>{contentString}</ReactMarkdown></SpellBlock>;
              if (type === 'note') return <NoteBlock><ReactMarkdown remarkPlugins={[remarkGfm]} components={nestedComponents}>{contentString}</ReactMarkdown></NoteBlock>;
            }
            return <code className={`${className} bg-gray-100 text-teal-800 px-1.5 py-0.5 rounded text-[0.8em] md:text-[0.9em] font-mono border border-gray-200 break-words`} {...props}>{children}</code>;
          },
          a: ({ children, href, ...props }) => {
            const isExternal = href?.startsWith('http');
            return (<a href={href} className="text-teal-700 font-bold hover:text-teal-900 hover:underline transition-colors" target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} {...props}>{children}</a>);
          },
          img: (props) => {
            const { src, alt, style, width, height } = props;
            const hasCustomStyle = style || width || height;

            if (hasCustomStyle) {
              return (
                <img
                  src={src as string}
                  alt={alt as string}
                  style={style}
                  width={width}
                  height={height}
                  className="rounded shadow-sm border border-stone-200 bg-white p-1 max-w-full"
                  loading="lazy"
                />
              );
            }

            return (
              <figure className="my-6 md:my-8 flex flex-col items-center break-inside-avoid">
                <img
                  src={src as string}
                  alt={alt as string}
                  className="max-w-full h-auto max-h-[500px] object-contain rounded shadow-md border border-stone-200 bg-white p-1"
                  loading="lazy"
                />
                {alt && <figcaption className="text-xs text-gray-500 mt-2 italic text-center">{alt}</figcaption>}
              </figure>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

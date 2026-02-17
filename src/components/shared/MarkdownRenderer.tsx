import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { NoteLinkButton } from './NoteLinkButton';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const NOTE_URL_PATTERN = /\/adventure-party\/([^/?#\s]+)\?noteId=([^&#\s]+)/;

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className="bg-amber-100 p-6 rounded-lg shadow-lg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        className={`prose prose-xl max-w-none font-cinzel ${className}`}
        components={{
          a: ({ children, href, ...props }) => {
            const noteMatch = href?.match(NOTE_URL_PATTERN);
            if (noteMatch) {
              return (
                <NoteLinkButton
                  partyId={noteMatch[1]}
                  noteId={noteMatch[2]}
                  title={String(children)}
                />
              );
            }
            return <a href={href} {...props}>{children}</a>;
          },
          h1: ({ children, ...props }) => (
            <h1 className="text-4xl font-bold text-brown-800 border-b-2 border-brown-500 pb-2 mb-4" {...props}>{children}</h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-3xl font-bold text-brown-700 border-b pb-2 mb-3" {...props}>{children}</h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-2xl font-bold text-brown-600 mb-2" {...props}>{children}</h3>
          ),
          table: ({ ...props }) => (
            <table className="border-collapse border border-brown-300 my-4" {...props} />
          ),
          th: ({ ...props }) => (
            <th className="border border-brown-300 px-4 py-2 bg-amber-200" {...props} />
          ),
          td: ({ ...props }) => (
            <td className="border border-brown-300 px-4 py-2" {...props} />
          ),
          blockquote: ({ ...props }) => (
            <blockquote className="border-l-4 border-amber-600 pl-4 my-4 italic bg-amber-50 py-2 pr-4" {...props} />
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className || !className.includes('language-');
            return isInline
              ? <code className="bg-amber-200 px-1 rounded" {...props}>{children}</code>
              : <code className="block bg-amber-200 p-4 rounded my-4 overflow-x-auto" {...props}>{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

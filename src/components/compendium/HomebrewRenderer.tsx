import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function HomebrewRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className="bg-amber-100 p-6 rounded-lg shadow-lg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        className={`prose prose-xl max-w-none font-cinzel ${className}`}
        components={{
          h1: ({node, ...props}) => (
            <h1 className="text-4xl font-bold text-brown-800 border-b-2 border-brown-500 pb-2 mb-4" {...props} />
          ),
          h2: ({node, ...props}) => (
            <h2 className="text-3xl font-bold text-brown-700 border-b pb-2 mb-3" {...props} />
          ),
          h3: ({node, ...props}) => (
            <h3 className="text-2xl font-bold text-brown-600 mb-2" {...props} />
          ),
          table: ({node, ...props}) => (
            <table className="border-collapse border border-brown-300 my-4" {...props} />
          ),
          th: ({node, ...props}) => (
            <th className="border border-brown-300 px-4 py-2 bg-amber-200" {...props} />
          ),
          td: ({node, ...props}) => (
            <td className="border border-brown-300 px-4 py-2" {...props} />
          ),
          blockquote: ({node, ...props}) => (
            <blockquote className="border-l-4 border-amber-600 pl-4 my-4 italic bg-amber-50 py-2 pr-4" {...props} />
          ),
          code: ({node, inline, ...props}) =>
            inline 
              ? <code className="bg-amber-200 px-1 rounded" {...props} />
              : <code className="block bg-amber-200 p-4 rounded my-4 overflow-x-auto" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

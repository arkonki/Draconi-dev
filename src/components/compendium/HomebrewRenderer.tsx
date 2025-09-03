import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import remarkHomebrewery from '../../lib/remark-homebrewery';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function HomebrewRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`phb ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHomebrewery]}
        rehypePlugins={[rehypeRaw]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

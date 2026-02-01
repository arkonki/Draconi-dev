import { NoteLinkButton } from '../shared/NoteLinkButton';

// Regex patterns
const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const NOTE_URL_PATTERN = /\/adventure-party\/([^/?#\s]+)\?noteId=([^&#\s]+)/;
const BOLD_REGEX = /\*\*(.*?)\*\*/g;
const ITALIC_REGEX = /\*(.*?)\*/g;
const CODE_REGEX = /`([^`]+)`/g;

export const MessageContent = ({ content }: { content: string }) => {
  // 1. Split by URL first to safely handle links
  const parts = content.split(URL_REGEX);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          const noteMatch = part.match(NOTE_URL_PATTERN);
          if (noteMatch) {
            return (
              <NoteLinkButton
                key={i}
                partyId={noteMatch[1]}
                noteId={noteMatch[2]}
                title="View Linked Note"
                className="mx-1"
              />
            );
          }

          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline hover:text-indigo-800 transition-colors break-all"
              onClick={(e) => e.stopPropagation()} // Prevent bubble click events
            >
              {part}
            </a>
          );
        }
        return <FormattedText key={i} text={part} />;
      })}
    </span>
  );
};

// Sub-component for Markdown (Bold/Italic/Code)
const FormattedText = ({ text }: { text: string }) => {
  // Simple parser: Split by code, then bold, then italic
  // Note: This is a basic implementation. For nested markdown, a library is better.

  const splitCode = text.split(CODE_REGEX);

  return (
    <>
      {splitCode.map((chunk, i) => {
        // Even indices are normal text (or bold/italic), Odd are code
        if (i % 2 === 1) {
          return <code key={i} className="bg-black/20 px-1 rounded font-mono text-xs">{chunk}</code>;
        }

        const splitBold = chunk.split(BOLD_REGEX);
        return (
          <span key={i}>
            {splitBold.map((subChunk, j) => {
              if (j % 2 === 1) return <strong key={j} className="font-bold">{subChunk}</strong>;

              const splitItalic = subChunk.split(ITALIC_REGEX);
              return (
                <span key={j}>
                  {splitItalic.map((bit, k) => (
                    k % 2 === 1 ? <em key={k} className="italic">{bit}</em> : bit
                  ))}
                </span>
              );
            })}
          </span>
        );
      })}
    </>
  );
};

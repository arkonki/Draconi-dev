import React from 'react';
import { Dices } from 'lucide-react';
import { useDice } from '../dice/useDice';

export const TextWithDice = ({ text, bold = false, contextLabel }: { text: string, bold?: boolean, contextLabel?: string }) => {
    const { toggleDiceRoller } = useDice();
    if (!text) return null;

    // Matches D6, 2D6, D6+1, 2D8, 1d20, etc. including within parens like (D12)
    const diceRegex = /(\b\d*[dD](?:4|6|8|10|12|20|66|100)(?:\s*[+-]\s*\d+)?\b)/g;

    const parts = text.split(diceRegex);

    return (
        <span className={bold ? "font-bold" : ""}>
            {parts.map((part, index) => {
                if (part.match(diceRegex)) {
                    const cleanFormula = part.toLowerCase().replace(/\s/g, '');
                    return (
                        <button
                            key={index}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleDiceRoller?.({ dice: cleanFormula, label: `${contextLabel || 'Roll'}: ${part}` });
                            }}
                            className={`
                inline-flex items-center justify-center font-bold px-1.5 py-0.5 rounded mx-0.5 text-xs transition-colors cursor-pointer select-none
                ${bold
                                    ? 'bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200'
                                    : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200'
                                }
              `}
                            title={`Roll ${part}`}
                        >
                            <Dices size={10} className="mr-1" />
                            {part}
                        </button>
                    );
                }
                return <span key={index}>{part}</span>;
            })}
        </span>
    );
};

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoloWriteResult } from '../../lib/api/solo';
import { OracleActionResult } from './SoloDashboard';

function writeResult(roll: Record<string, unknown>, notice?: string): SoloWriteResult {
  return {
    success: true,
    campaign_revision: 12,
    event_ids: ['event-1'],
    summary: 'The oracle answered.',
    state_excerpt: { roll, ...(notice ? { notice } : {}) },
  };
}

describe('Solo oracle action results', () => {
  it('keeps the Fortune answer and roll visible until Done is selected', () => {
    const onDone = vi.fn();
    render(
      <OracleActionResult
        action="fortune"
        onDone={onDone}
        result={writeResult({
          id: 'roll-1',
          purpose: 'Fortune: Is the bridge safe?',
          source: 'server',
          expression: '2d6',
          dice: [2, 6],
          keptIndices: [1],
          keptValues: [6],
          result: {
            question: 'Is the bridge safe?',
            value: 'Yes, and',
            extreme: true,
          },
          campaignRevision: 12,
          createdAt: '2026-09-07T12:00:00.000Z',
        })}
      />,
    );

    expect(screen.getByText('Yes, and')).toBeInTheDocument();
    expect(screen.getByText('“Is the bridge safe?”')).toBeInTheDocument();
    expect(screen.getByText('Extreme result')).toBeInTheDocument();
    expect(screen.getByText(/Rolled:/)).toHaveTextContent('2, 6');
    expect(screen.getByText('Kept result: 6')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows the Inspiration phrase, column results, dice, and table notice', () => {
    render(
      <OracleActionResult
        action="inspiration"
        onDone={vi.fn()}
        result={writeResult({
          id: 'roll-2',
          purpose: 'Inspiration: action, thing',
          source: 'server',
          expression: '2d20',
          dice: [4, 17],
          keptIndices: [0, 1],
          keptValues: [4, 17],
          result: {
            phrase: 'Discover Lantern',
            results: [
              { column: 'action', keyword: 'Discover', roll: 4 },
              { column: 'thing', keyword: 'Lantern', roll: 17 },
            ],
          },
          campaignRevision: 12,
          createdAt: '2026-09-07T12:00:00.000Z',
        }, 'This uses the generic Draconi inspiration table.')}
      />,
    );

    expect(screen.getByText('Discover Lantern')).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
    expect(screen.getByText('Lantern')).toBeInTheDocument();
    expect(screen.getByText('D20: 4')).toBeInTheDocument();
    expect(screen.getByText('D20: 17')).toBeInTheDocument();
    expect(screen.getByText('This uses the generic Draconi inspiration table.')).toBeInTheDocument();
  });
});

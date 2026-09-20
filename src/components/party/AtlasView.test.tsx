import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapPin } from '../../types/atlas';
import { MapLegend } from './AtlasView';

const makePin = (overrides: Partial<MapPin>): MapPin => ({
  id: 'pin-1',
  map_id: 'map-1',
  party_id: 'party-1',
  label: 'Drakmar Pass',
  description: null,
  icon: null,
  x: 120,
  y: 240,
  type: 'note',
  character_id: null,
  note_id: 'note-1',
  color: null,
  created_at: '2026-09-20T00:00:00.000Z',
  updated_at: '2026-09-20T00:00:00.000Z',
  ...overrides,
});

describe('Atlas map legend', () => {
  it('opens the exact note or location selected in the explorer', () => {
    const note = makePin({ id: 'note-pin', type: 'note' });
    const location = makePin({ id: 'location-pin', type: 'location', label: 'Smithy', note_id: null });
    const onPinClick = vi.fn();

    render(<MapLegend pins={[location, note]} onPinClick={onPinClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Drakmar Pass from map legend' }));
    expect(onPinClick).toHaveBeenLastCalledWith(note);

    fireEvent.click(screen.getByRole('button', { name: 'Open Smithy from map legend' }));
    expect(onPinClick).toHaveBeenLastCalledWith(location);
  });
});

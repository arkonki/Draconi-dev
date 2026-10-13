import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TableScalePanel } from './TableScalePanel';
import type { PartyMap } from '../../types/atlas';

const map = (overrides: Partial<PartyMap> = {}): PartyMap => ({
  id: 'm1', party_id: 'p', name: 'Cave', image_url: '/cave.png', grid_type: 'none', grid_size: 50, grid_opacity: 0.3,
  grid_offset_x: 0, grid_offset_y: 0, grid_color: '#fff', grid_rotation: 0, is_active: false, created_at: '', updated_at: '', ...overrides,
});

const setup = (overrides: Partial<React.ComponentProps<typeof TableScalePanel>> = {}) => {
  const props = { map: map(), measuredPixels: null, saving: false, error: null, onPreview: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...overrides };
  render(<TableScalePanel {...props} />);
  return props;
};

describe('TableScalePanel', () => {
  it('starts from the map’s current scale, falling back to its grid', () => {
    setup({ map: map({ grid_type: 'square', grid_size: 70 }) });
    expect(screen.getByLabelText('Pixels per square')).toHaveValue(70);
    expect(screen.getByLabelText('Metres per square')).toHaveValue(1.5);
  });

  it('turns a measured line into pixels per square', () => {
    setup({ measuredPixels: 840 });
    fireEvent.change(screen.getByLabelText('Squares the line covers'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(screen.getByLabelText('Pixels per square')).toHaveValue(84);
  });

  it('saves the numbers, and whether to draw a grid', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Pixels per square'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Metres per square'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save scale' }));
    expect(props.onSave).toHaveBeenCalledWith({ cell: 120, metres: 2 }, true);
  });

  it('will not save nonsense, and previews valid numbers as they are typed', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Pixels per square'), { target: { value: '2' } });
    expect(screen.getByRole('button', { name: 'Save scale' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Pixels per square'), { target: { value: '90' } });
    expect(screen.getByRole('button', { name: 'Save scale' })).toBeEnabled();
    expect(props.onPreview).toHaveBeenLastCalledWith({ cell: 90, metres: 1.5 });
  });

  it('only offers to forget a scale that was saved', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Forget scale' })).toBeDisabled();
  });

  it('forgets a saved scale', () => {
    const props = setup({ map: map({ scale_px_per_square: 80, scale_metres_per_square: 1 }) });
    fireEvent.click(screen.getByRole('button', { name: 'Forget scale' }));
    expect(props.onReset).toHaveBeenCalled();
  });
});

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeroicAbilitiesView } from './HeroicAbilitiesView';
import { AccessibleDialog } from '../shared/AccessibleDialog';

vi.mock('../../stores/characterSheetStore', () => ({
  useCharacterSheetStore: () => ({
    character: { heroic_abilities: ['Robust'], attributes: { WIL: 12 }, current_wp: 12 },
    allHeroicAbilities: [{ id: 'robust', name: 'Robust', description: 'Extra resilience.', activation_type: 'passive', willpower_cost: 0 }],
    isLoading: false,
    error: null,
    updateCharacterData: vi.fn(),
    isSaving: false,
    setActiveStatusMessage: vi.fn(),
  }),
}));

describe('heroic ability details from an embedded sheet', () => {
  it('opens above the sheet, handles Escape independently, and restores focus to the ability', async () => {
    const closeSheet = vi.fn();
    render(<AccessibleDialog title="Party character sheet" onClose={closeSheet}><HeroicAbilitiesView /></AccessibleDialog>);
    const sheet = screen.getByRole('dialog', { name: 'Party character sheet' });
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Close dialog' })).toHaveFocus());
    const ability = screen.getByRole('button', { name: /Robust Passive/ });
    ability.focus();
    fireEvent.click(ability);
    const details = screen.getByRole('dialog', { name: 'Robust' });
    expect(sheet).not.toContainElement(details);
    expect(Number(details.parentElement?.style.zIndex)).toBeGreaterThan(Number(sheet.parentElement?.style.zIndex));
    await waitFor(() => expect(within(details).getByRole('button', { name: 'Close dialog' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Robust' })).not.toBeInTheDocument();
    expect(closeSheet).not.toHaveBeenCalled();
    await waitFor(() => expect(ability).toHaveFocus());
  });
});

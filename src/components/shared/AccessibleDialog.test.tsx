import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessibleDialog } from './AccessibleDialog';

describe('AccessibleDialog', () => {
  it('announces itself as a modal and closes with Escape', async () => {
    const onClose = vi.fn();
    render(
      <AccessibleDialog onClose={onClose} title="Character options" description="Choose an action">
        <button type="button">First action</button>
      </AccessibleDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Character options' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab focus and restores focus to the opener', async () => {
    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <AccessibleDialog onClose={() => undefined} title="Focus test" showCloseButton={false}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </AccessibleDialog>,
    );

    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    unmount();
    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
  });

  it('can delegate scrolling to an embedded document view', () => {
    render(
      <AccessibleDialog onClose={() => undefined} title="Embedded sheet" bodyScrollable={false}>
        <div data-testid="embedded-content">Sheet</div>
      </AccessibleDialog>,
    );

    const content = screen.getByTestId('embedded-content');
    expect(content.parentElement).toHaveClass('overflow-hidden');
    expect(content.parentElement).not.toHaveClass('overflow-y-auto');
  });

  it('only lets the topmost nested dialog respond to Escape', () => {
    const closeBase = vi.fn();
    const closeNested = vi.fn();
    render(
      <>
        <AccessibleDialog onClose={closeBase} title="Base dialog">
          <button type="button">Base action</button>
        </AccessibleDialog>
        <AccessibleDialog onClose={closeNested} title="Nested dialog" layer="nested">
          <button type="button">Nested action</button>
        </AccessibleDialog>
      </>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeNested).toHaveBeenCalledTimes(1);
    expect(closeBase).not.toHaveBeenCalled();
  });
});

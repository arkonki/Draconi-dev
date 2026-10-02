import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('escapes transformed and clipped sheet containers with correctly layered nested dialogs', async () => {
    const closeBase = vi.fn();
    const closeNested = vi.fn();
    const { container } = render(
      <div style={{ overflow: 'hidden', transform: 'translateY(10px)' }}>
        <AccessibleDialog onClose={closeBase} title="Party character">
          <div style={{ overflow: 'hidden' }}>
            <AccessibleDialog onClose={closeNested} title="Character inventory" showCloseButton={false}>
              <button type="button">Inventory action</button>
            </AccessibleDialog>
          </div>
        </AccessibleDialog>
      </div>,
    );
    const base = screen.getByRole('dialog', { name: 'Party character' });
    const nested = screen.getByRole('dialog', { name: 'Character inventory' });
    expect(container).not.toContainElement(base);
    expect(base).not.toContainElement(nested);
    expect(Number(nested.parentElement?.style.zIndex)).toBeGreaterThan(Number(base.parentElement?.style.zIndex));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inventory action' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeNested).toHaveBeenCalledOnce();
    expect(closeBase).not.toHaveBeenCalled();
  });

  it('keeps focus and scroll position on live rerenders and uses the latest close callback', async () => {
    const oldClose = vi.fn();
    const newClose = vi.fn();
    const content = <><button type="button">First</button><button type="button">Focused sheet control</button></>;
    const { rerender } = render(<AccessibleDialog onClose={oldClose} title="Live sheet">{content}</AccessibleDialog>);
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus());
    const control = screen.getByRole('button', { name: 'Focused sheet control' });
    control.focus();
    const focus = vi.spyOn(control, 'focus');
    const closeFocus = vi.spyOn(within(dialog).getByRole('button', { name: 'Close dialog' }), 'focus');
    rerender(<AccessibleDialog onClose={newClose} title="Live sheet">{content}</AccessibleDialog>);
    // Let initial-focus timers run; a live update must not schedule another.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(control).toHaveFocus();
    expect(focus).not.toHaveBeenCalled();
    expect(closeFocus).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(newClose).toHaveBeenCalledOnce();
    expect(oldClose).not.toHaveBeenCalled();
  });
});

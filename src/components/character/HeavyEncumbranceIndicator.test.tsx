import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeavyEncumbranceIndicator } from './HeavyEncumbranceIndicator';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('heavy movement rules', () => {
  it('shows the rules on keyboard focus and dismisses with Escape', () => {
    render(<HeavyEncumbranceIndicator load={8} capacity={6} />);
    const trigger = screen.getByRole('button', { name: /Over-encumbered/ });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toHaveTextContent('Load 8 / 6');
    expect(tooltip).toHaveTextContent('make a STR roll whenever you want to move in a round of combat or walk for a shift of travel');
    expect(tooltip).toHaveTextContent('drop what you are carrying or stay where you are');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('supports tapping and puts the panel outside clipped banners within a narrow viewport', () => {
    vi.stubGlobal('innerWidth', 320);
    render(<div style={{ clipPath: 'polygon(0 0,100% 0,100% 100%)' }}><HeavyEncumbranceIndicator load={7} capacity={6} /></div>);
    fireEvent.click(screen.getByRole('button', { name: /Over-encumbered/ }));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip.style.left).toBe('12px');
    expect(tooltip.style.width).toBe('296px');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps the hover panel open while moving from the badge to its rules', () => {
    vi.useFakeTimers();
    render(<HeavyEncumbranceIndicator load={7} capacity={6} />);
    const trigger = screen.getByRole('button', { name: /Over-encumbered/ });
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole('tooltip');
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(tooltip);
    act(() => vi.advanceTimersByTime(150));
    expect(tooltip).toBeInTheDocument();
    fireEvent.mouseLeave(tooltip);
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('repositions without flashing when the enclosing sheet scrolls, then hides once its badge leaves view', () => {
    vi.useFakeTimers();
    render(<div data-dialog-scroll><HeavyEncumbranceIndicator load={7} capacity={6} /></div>);
    const trigger = screen.getByRole('button', { name: /Over-encumbered/ });
    const scroller = trigger.parentElement!;
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 500 } as DOMRect);
    const rect = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 200, bottom: 228, left: 100, height: 28 } as DOMRect);
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole('tooltip');
    rect.mockReturnValue({ top: 160, bottom: 188, left: 100, height: 28 } as DOMRect);
    fireEvent.scroll(scroller);
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByRole('tooltip')).toBe(tooltip);
    expect(tooltip.style.top).toBe('196px');
    rect.mockReturnValue({ top: 50, bottom: 78, left: 100, height: 28 } as DOMRect);
    fireEvent.scroll(scroller);
    act(() => vi.advanceTimersByTime(20));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatComposer } from './ChatComposer';
import type { PokeOption } from '../../lib/pokeTarget';

const people: PokeOption[] = [{ userId: 'u2', label: 'Brynja', detail: 'Ann · Player' }];

function Harness({ onSend = vi.fn(), onPoke = vi.fn(), initial = '' }) {
  const [value, setValue] = useState(initial);
  return <ChatComposer value={value} onChange={setValue} onSend={onSend} isSending={false} maxLength={4000} pokeOptions={people} onPoke={onPoke} />;
}

const box = () => screen.getByLabelText('Message') as HTMLTextAreaElement;

describe('chat composer', () => {
  it('wraps the selected words in bold and keeps them selected', () => {
    render(<Harness initial="hit the orc" />);
    box().setSelectionRange(4, 7);
    fireEvent.click(screen.getByLabelText('Bold'));
    expect(box().value).toBe('hit **the** orc');
    expect([box().selectionStart, box().selectionEnd]).toEqual([6, 9]);
  });

  it('formats with keyboard shortcuts', () => {
    render(<Harness initial="sly" />);
    box().setSelectionRange(0, 3);
    fireEvent.keyDown(box(), { key: 'i', ctrlKey: true });
    expect(box().value).toBe('*sly*');
  });

  it('sends on Enter and adds a line on Shift+Enter', () => {
    const onSend = vi.fn();
    render(<Harness initial="hello" onSend={onSend} />);
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('inserts an emoji at the cursor and closes the picker', () => {
    render(<Harness initial="ab" />);
    box().setSelectionRange(1, 1);
    fireEvent.click(screen.getByLabelText('Emoji'));
    fireEvent.click(screen.getByLabelText('Insert 🐉'));
    expect(box().value).toBe('a🐉b');
    expect(screen.queryByRole('dialog', { name: 'Pick an emoji' })).toBeNull();
  });

  it('closes the emoji picker on Escape', () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText('Emoji'));
    expect(screen.getByRole('dialog', { name: 'Pick an emoji' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Pick an emoji' })).toBeNull();
  });

  it('lists party members to poke and pokes the one clicked', () => {
    const onPoke = vi.fn();
    render(<Harness onPoke={onPoke} />);
    fireEvent.click(screen.getByLabelText('Poke someone'));
    fireEvent.click(screen.getByRole('menuitem', { name: /Brynja/ }));
    expect(onPoke).toHaveBeenCalledWith(people[0]);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

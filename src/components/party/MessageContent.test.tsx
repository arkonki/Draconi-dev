import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MessageContent } from './MessageContent';

const show = (content: string) => render(<MemoryRouter><MessageContent content={content} /></MemoryRouter>).container;

describe('message formatting', () => {
  it('shows bold, italic and code', () => {
    const view = show('A **big** and *sly* `d20`');
    expect(view.querySelector('strong')?.textContent).toBe('big');
    expect(view.querySelector('em')?.textContent).toBe('sly');
    expect(view.querySelector('code')?.textContent).toBe('d20');
  });

  it('keeps formatting that runs over a line break', () => {
    const view = show('the *sneaky\nsecond line* and **two\nlines**');
    expect(view.querySelector('em')?.textContent).toBe('sneaky\nsecond line');
    expect(view.querySelector('strong')?.textContent).toBe('two\nlines');
  });
});

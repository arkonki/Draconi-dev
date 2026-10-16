import { describe, expect, it } from 'vitest';
import { buildPortraitValue, parsePortrait, portraitImageUrl, portraitObjectPosition } from './portrait';

describe('portrait framing', () => {
  it('reads the old vertical-only form and the new one with a horizontal position', () => {
    expect(parsePortrait('/api/storage/public/images/p.jpg?pos=20')).toEqual({ url: '/api/storage/public/images/p.jpg', focus: { x: 50, y: 20 }, framed: true });
    expect(parsePortrait('https://x.test/p.jpg?pos=15&x=80')).toEqual({ url: 'https://x.test/p.jpg', focus: { x: 80, y: 15 }, framed: true });
    expect(parsePortrait('https://x.test/p.jpg')).toEqual({ url: 'https://x.test/p.jpg', focus: { x: 50, y: 50 }, framed: false });
    expect(parsePortrait(null)).toEqual({ url: '', focus: { x: 50, y: 50 }, framed: false });
  });

  it('keeps a query the address already had', () => {
    expect(parsePortrait('https://x.test/p.jpg?w=300?pos=10').url).toBe('https://x.test/p.jpg?w=300');
    expect(parsePortrait('https://x.test/p.jpg?w=300').framed).toBe(false);
  });

  it('writes a value that reads back the same, and stays plain when centred', () => {
    expect(buildPortraitValue('https://x.test/p.jpg', { x: 50, y: 50 })).toBe('https://x.test/p.jpg');
    expect(buildPortraitValue('https://x.test/p.jpg', { x: 50, y: 20 })).toBe('https://x.test/p.jpg?pos=20');
    expect(buildPortraitValue('https://x.test/p.jpg', { x: 30, y: 50 })).toBe('https://x.test/p.jpg?pos=50&x=30');
    const value = buildPortraitValue('https://x.test/p.jpg', { x: 30, y: 12 });
    expect(parsePortrait(value)).toEqual({ url: 'https://x.test/p.jpg', focus: { x: 30, y: 12 }, framed: true });
    expect(buildPortraitValue('u', { x: 400, y: -5 })).toBe('u?pos=0&x=100');
    // a centre chosen on purpose is kept, so a view that favours the top for unframed pictures does not override it
    expect(buildPortraitValue('u', { x: 50, y: 50 }, true)).toBe('u?pos=50');
    expect(portraitObjectPosition('u?pos=50', '50% 0%')).toBe('50% 50%');
  });

  it('gives the CSS position, with a fallback for portraits nobody framed', () => {
    expect(portraitObjectPosition('p.jpg?pos=20&x=70')).toBe('70% 20%');
    expect(portraitObjectPosition('p.jpg')).toBe('50% 50%');
    expect(portraitObjectPosition('p.jpg', '50% 0%')).toBe('50% 0%');
    expect(portraitObjectPosition('p.jpg?pos=50', '50% 0%')).toBe('50% 50%');
  });

  it('loads the picture without the framing, with the size variant', () => {
    const stored = `${window.location.origin}/api/storage/public/images/portraits/hero.png?pos=20&x=40`;
    expect(portraitImageUrl(stored, 'thumbnail')).toBe(`${window.location.origin}/api/storage/public/images/portraits/hero.png?variant=thumbnail`);
    expect(portraitImageUrl('https://x.test/p.jpg?pos=20', 'medium')).toBe('https://x.test/p.jpg');
    expect(portraitImageUrl('', 'medium')).toBe('');
  });
});

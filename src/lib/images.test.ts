import { describe, expect, it } from 'vitest';
import { localImageObjectPath, optimizedImageUrl } from './images';

describe('optimizedImageUrl', () => {
  it('adds a variant to same-origin stored images and preserves portrait position', () => {
    const original = `${window.location.origin}/api/storage/public/images/portraits/hero.png?pos=20`;
    expect(optimizedImageUrl(
      original,
      'thumbnail',
    )).toBe(`${original}&variant=thumbnail`);
  });

  it('does not rewrite external or empty URLs', () => {
    expect(optimizedImageUrl('https://images.example.com/hero.png', 'medium'))
      .toBe('https://images.example.com/hero.png');
    expect(optimizedImageUrl('', 'medium')).toBe('');
  });

  it('extracts a decoded same-origin storage object path', () => {
    const url = `${window.location.origin}/api/storage/public/images/Atlas/party/My%20Map.png?variant=large`;
    expect(localImageObjectPath(url)).toBe('Atlas/party/My Map.png');
    expect(localImageObjectPath('https://images.example.com/map.png')).toBeNull();
  });
});

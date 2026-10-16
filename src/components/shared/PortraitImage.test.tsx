import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortraitImage } from './PortraitImage';

describe('PortraitImage', () => {
  it('frames the picture as its owner chose and loads it without the framing', () => {
    render(<PortraitImage value="https://x.test/hero.jpg?pos=12&x=70" variant="thumbnail" alt="Hero" />);
    const image = screen.getByAltText('Hero');
    expect(image).toHaveAttribute('src', 'https://x.test/hero.jpg');
    expect(image.style.objectPosition).toBe('70% 12%');
  });

  it('uses the view\'s own position for a portrait nobody framed', () => {
    render(<PortraitImage value="https://x.test/hero.jpg" variant="medium" alt="Card" fallbackPosition="50% 0%" />);
    expect(screen.getByAltText('Card').style.objectPosition).toBe('50% 0%');
  });
});

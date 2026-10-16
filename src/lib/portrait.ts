import { optimizedImageUrl, type ImageVariant } from './images';

// A portrait is one text value: the image address, with where the picture is framed kept after it as
// `?pos=<vertical>` and `&x=<horizontal>` (percent, 50 is the middle), so no database change is needed. Every place that
// shows a portrait reads it through here, so the framing chosen in the character's bio is the framing everywhere: the
// character card, the party roster, the table, the projector.

export interface PortraitFocus {
  /** 0 is the left edge of the picture, 100 the right. */
  x: number;
  /** 0 is the top, 100 the bottom. */
  y: number;
}

export const CENTERED: PortraitFocus = { x: 50, y: 50 };

const FOCUS_SUFFIX = /\?pos=(\d{1,3})(?:&x=(\d{1,3}))?$/;
const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** The picture's address and its framing. `framed` is false when nobody has chosen one. */
export function parsePortrait(value: string | null | undefined): { url: string; focus: PortraitFocus; framed: boolean } {
  const text = String(value ?? '');
  const match = FOCUS_SUFFIX.exec(text);
  if (!match) return { url: text, focus: CENTERED, framed: false };
  return {
    url: text.slice(0, match.index),
    focus: { y: clampPercent(Number(match[1])), x: match[2] === undefined ? 50 : clampPercent(Number(match[2])) },
    framed: true,
  };
}

/**
 * The value to store: the address with its framing. A picture that is simply centred is left plain, unless `chosen` says
 * the owner picked the centre on purpose, which must not fall back to a view's own default (the card favours the top).
 */
export function buildPortraitValue(url: string, focus: PortraitFocus, chosen = false): string {
  const y = clampPercent(focus.y);
  const x = clampPercent(focus.x);
  if (y === 50 && x === 50 && !chosen) return url;
  return `${url}?pos=${y}${x === 50 ? '' : `&x=${x}`}`;
}

/** The CSS `object-position` for a stored portrait. `fallback` is used when no framing was chosen. */
export function portraitObjectPosition(value: string | null | undefined, fallback = '50% 50%'): string {
  const { focus, framed } = parsePortrait(value);
  return framed ? `${focus.x}% ${focus.y}%` : fallback;
}

/** The address to load for a stored portrait: the picture itself, without the framing that is only for display. */
export function portraitImageUrl(value: string | null | undefined, variant: ImageVariant): string {
  return optimizedImageUrl(parsePortrait(value).url, variant);
}

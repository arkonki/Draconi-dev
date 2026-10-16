import type { ImgHTMLAttributes } from 'react';
import type { ImageVariant } from '../../lib/images';
import { portraitImageUrl, portraitObjectPosition } from '../../lib/portrait';

interface PortraitImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** The portrait as stored on the character, with its framing. */
  value: string;
  variant: ImageVariant;
  /** Where to look when nobody chose a framing. */
  fallbackPosition?: string;
}

/** A character's portrait framed the way its owner chose, wherever it is shown. Give it `object-cover` and a size. */
export function PortraitImage({ value, variant, fallbackPosition, alt = '', style, ...rest }: PortraitImageProps) {
  return <img {...rest} alt={alt} src={portraitImageUrl(value, variant)} style={{ objectPosition: portraitObjectPosition(value, fallbackPosition), ...style }} />;
}

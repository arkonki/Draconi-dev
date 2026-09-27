export type ImageVariant = 'thumbnail' | 'medium' | 'large';

const LOCAL_IMAGE_PATH = '/api/storage/public/images/';

export function optimizedImageUrl(value: string | null | undefined, variant: ImageVariant): string {
  if (!value) return '';
  const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  try {
    const url = new URL(value, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.includes(LOCAL_IMAGE_PATH)) return value;
    url.searchParams.set('variant', variant);
    return url.toString();
  } catch {
    return value;
  }
}

export function localImageObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
  try {
    const url = new URL(value, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) return null;
    const markerIndex = url.pathname.indexOf(LOCAL_IMAGE_PATH);
    if (markerIndex === -1) return null;
    return url.pathname
      .slice(markerIndex + LOCAL_IMAGE_PATH.length)
      .split('/')
      .map(decodeURIComponent)
      .join('/');
  } catch {
    return null;
  }
}

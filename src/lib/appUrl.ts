export function getAppPath(path = '') {
  const basePath = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const relativePath = path.replace(/^\/+/, '');
  return `${basePath}${relativePath}`;
}

export function getAbsoluteAppUrl(path = '') {
  return new URL(getAppPath(path), window.location.origin).toString();
}

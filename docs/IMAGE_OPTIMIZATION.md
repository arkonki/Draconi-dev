# Image optimization and caching

Draconi stores the original uploaded image and creates three derived WebP variants:

| Variant | Maximum dimensions | Intended use |
| --- | --- | --- |
| `thumbnail` | 256 × 256 | cards, avatars, and grids |
| `medium` | 1280 × 1280 | portraits and previews |
| `large` | 2400 × 2400 | projector art and compendium content |

Request a variant by adding `?variant=thumbnail`, `?variant=medium`, or
`?variant=large` to a local public image URL. Existing query parameters are
preserved by the frontend image helper.

New uploads generate all variants immediately. Images uploaded before this
feature generate a requested variant on first use, so no migration is needed.
Atlas maps deliberately use the original image to preserve zoom detail.

## Caching

- Public image responses include `ETag`, `Last-Modified`, byte-range, and HEAD
  support, with a one-day browser freshness lifetime and seven-day stale reuse.
- The service worker keeps up to 250 local uploaded images for 30 days.
- Application JSON and live game state are not cached by the service worker.
- Built frontend assets continue to use Vite's content-hashed immutable files.

The service worker cache is disposable browser data. Server-side variants are
also derived data and are excluded from backups along with incomplete temporary
uploads. Restoring originals is sufficient; variants regenerate on demand.

## Resource limits

- `MAX_UPLOAD_BYTES` limits the streamed upload body (25 MB by default).
- `MAX_IMAGE_PIXELS` limits decoded image size (40 million pixels by default).
- Image transforms run one at a time with a bounded Sharp cache for predictable
  memory use on small self-hosted servers.

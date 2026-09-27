/** Synthetic captures only. All hosts use reserved example domains. No network I/O. */
export function createDemoCaptures() {
  const entry = (path, { bytes = 1200, duration = 100, status = 200, method = 'GET', mime = 'application/json' } = {}) => ({
    startedDateTime: '2026-01-01T12:00:00.000Z', time: duration,
    request: { method, url: path.startsWith('https://') ? path : `https://shop.example.com${path}`, httpVersion: 'HTTP/2', headers: [], queryString: [], cookies: [], headersSize: -1, bodySize: 0 },
    response: { status, statusText: status === 500 ? 'Internal Server Error' : 'OK', httpVersion: 'HTTP/2', headers: [], cookies: [], content: { size: bytes, mimeType: mime }, redirectURL: '', headersSize: -1, bodySize: bytes },
    cache: {}, timings: { send: 1, wait: Math.max(0, duration - 2), receive: 1 },
  });
  const capture = entries => ({ log: { version: '1.2', creator: { name: 'HarborDiff synthetic demo', version: '1.0' }, entries } });
  const before = capture([
    entry('/', { bytes: 9400, duration: 184, mime: 'text/html' }),
    entry('/assets/store.js', { bytes: 82000, duration: 230, mime: 'application/javascript' }),
    entry('/assets/store.css', { bytes: 7200, duration: 88, mime: 'text/css' }),
    entry('/images/summer-collection.webp', { bytes: 44000, duration: 240, mime: 'image/webp' }),
    entry('/api/products', { bytes: 8500, duration: 175 }),
    entry('/api/cart', { bytes: 760, duration: 140 }),
    entry('/api/search?q=linen', { bytes: 2600, duration: 180 }),
    entry('/legacy/recommendations.js', { bytes: 18000, duration: 150, mime: 'application/javascript' }),
    entry('/api/reviews', { bytes: 4000, duration: 120 }),
  ]);
  const after = capture([
    entry('/', { bytes: 9600, duration: 179, mime: 'text/html' }),
    entry('/assets/store.js', { bytes: 84000, duration: 238, mime: 'application/javascript' }),
    entry('/assets/store.css', { bytes: 7100, duration: 83, mime: 'text/css' }),
    entry('/images/summer-collection.webp', { bytes: 1244000, duration: 790, mime: 'image/webp' }),
    entry('/api/products', { bytes: 8500, duration: 170 }),
    entry('/api/products', { bytes: 8500, duration: 190 }),
    entry('/api/products', { bytes: 8500, duration: 185 }),
    entry('/api/products', { bytes: 8500, duration: 178 }),
    entry('/api/cart', { bytes: 280, duration: 820, status: 500 }),
    entry('/api/search?q=linen', { bytes: 2700, duration: 1260 }),
    entry('https://metrics.example.net/collect?session=synthetic-demo', { bytes: 420, duration: 215, method: 'POST' }),
    entry('/api/reviews', { bytes: -1, duration: -1 }),
  ]);
  return { before, after };
}

export const demoLabels = Object.freeze({ before: 'store-before.har', after: 'store-after.har' });

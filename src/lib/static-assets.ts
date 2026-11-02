const mediaTypes: Record<string, RegExp> = {
  js: /^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i,
  mjs: /^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i,
  css: /^text\/css(?:;|$)/i,
  json: /^application\/json(?:;|$)/i,
  svg: /^image\/svg\+xml(?:;|$)/i,
  png: /^image\/png(?:;|$)/i,
  webp: /^image\/webp(?:;|$)/i,
  jpg: /^image\/jpeg(?:;|$)/i,
  jpeg: /^image\/jpeg(?:;|$)/i,
  woff: /^(?:font\/woff|application\/font-woff)(?:;|$)/i,
  woff2: /^font\/woff2(?:;|$)/i
};

export async function staticAsset(request: Request, assets: Fetcher): Promise<Response> {
  const url = new URL(request.url);
  const extension = url.pathname.split('.').at(-1)?.toLowerCase() ?? '';
  const failure = (status: number) => new Response('Static asset unavailable', {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
  try {
    // Asset lookups must not inherit document-navigation or conditional headers.
    const response = await assets.fetch(new Request(url, { method: request.method, headers: { Accept: '*/*' } }));
    if (!response.ok) return failure(response.status === 404 ? 404 : 503);
    const type = response.headers.get('Content-Type') ?? '';
    if (/^text\/html(?:;|$)/i.test(type) || (mediaTypes[extension] && !mediaTypes[extension].test(type))) return failure(502);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(url.pathname) ? 'public, max-age=31536000, immutable' : 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return failure(503);
  }
}

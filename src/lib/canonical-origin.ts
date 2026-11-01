const legacyHostname = 'dubai-whatsapp-agent.kioiskio.dev';
const canonicalOrigin = 'https://sahar-agent.kioiskio.dev';

export function canonicalRedirect(request: Request, configuredOrigin?: string): Response | null {
  if (configuredOrigin?.replace(/\/$/, '') !== canonicalOrigin) return null;
  const target = new URL(request.url);
  if (target.hostname !== legacyHostname || !['GET', 'HEAD'].includes(request.method)) return null;
  // Existing provider callbacks and API clients keep their original endpoint.
  if (/^\/(?:api|webhook)(?:\/|$)/.test(target.pathname)) return null;
  target.protocol = 'https:';
  target.hostname = new URL(canonicalOrigin).hostname;
  target.port = '';
  return new Response(null, {
    status: 308,
    headers: { Location: target.href, 'Cache-Control': 'public, max-age=300' }
  });
}

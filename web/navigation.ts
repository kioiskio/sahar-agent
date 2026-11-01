const operatorPages = new Set(['/console/overview', '/console/orders', '/console/conversations', '/console/listings', '/console/settings', '/admin']);

export function safeReturnPath(value: string | null): string | null {
  if (!value || value.length > 180) return null;
  if (operatorPages.has(value) || value === '/workspace') return value;
  return /^\/workspace\/[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

export function loginPath(destination: string): string {
  const safe = safeReturnPath(destination);
  return safe ? '/login?next=' + encodeURIComponent(safe) : '/login';
}

export function afterSignIn(search: string, admin: boolean): string {
  const next = safeReturnPath(new URLSearchParams(search).get('next'));
  if (!next || (!admin && (next.startsWith('/console/') || next === '/admin'))) return '/workspace';
  return next;
}

export function checkoutFrom(url: string, destination: string): string {
  const checkout = new URL(url, window.location.origin);
  if (checkout.origin !== window.location.origin || !checkout.pathname.startsWith('/checkout/') || checkout.username || checkout.password) return url;
  const safe = safeReturnPath(destination);
  if (safe) checkout.searchParams.set('return_to', safe);
  return checkout.pathname + checkout.search;
}

export function checkoutReturn(orderId: string, search: string): string | null {
  const requested = safeReturnPath(new URLSearchParams(search).get('return_to'));
  if (requested) return requested;
  try { return safeReturnPath(sessionStorage.getItem('sahar.checkout.return:' + orderId)); }
  catch { return null; }
}

export function rememberCheckoutReturn(orderId: string, destination: string): void {
  const safe = safeReturnPath(destination);
  if (!safe) return;
  try { sessionStorage.setItem('sahar.checkout.return:' + orderId, safe); }
  catch { /* The explicit URL still provides a return destination without storage. */ }
}

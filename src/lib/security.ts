export function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function publicError(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof Error && /required|invalid|not found|cannot|too long|too large|accept|already|pending|closed|unsupported|must|only/i.test(error.message)) return error.message.slice(0, 300);
  return fallback;
}

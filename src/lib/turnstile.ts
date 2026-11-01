import { HTTPException } from 'hono/http-exception';

type TurnstileEnv = {
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_MODE?: string;
  APP_BASE_URL?: string;
};

export async function verifyTurnstile(env: TurnstileEnv, token: unknown, ip: string | undefined, requestUrl: string): Promise<void> {
  if (typeof token !== 'string' || token.length < 8 || token.length > 2048) throw new HTTPException(400, { message: 'Verification check is required' });
  const hostname = new URL(requestUrl).hostname;
  if (env.TURNSTILE_MODE === 'test' && hostname === 'test.local') {
    if (token !== 'turnstile-ok') throw new HTTPException(400, { message: 'Verification check failed' });
    return;
  }
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) throw new HTTPException(503, { message: 'Verification check is not configured' });
  let payload: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip })
    });
    payload = await response.json() as { success?: boolean; hostname?: string; action?: string };
  } catch {
    throw new HTTPException(503, { message: 'Verification check is unavailable' });
  }
  const allowedHost = new URL(env.APP_BASE_URL || requestUrl).hostname;
  if (!payload.success || payload.hostname !== allowedHost || (payload.action && payload.action !== 'login')) {
    throw new HTTPException(400, { message: 'Verification check failed' });
  }
}

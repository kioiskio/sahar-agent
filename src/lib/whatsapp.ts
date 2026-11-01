export type WhatsAppEnv = {
  CHANNEL_MODE?: string;
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_API_VERSION?: string;
};

export interface WhatsAppSender {
  sendText(waId: string, body: string): Promise<{ externalMessageId: string | null }>;
}

export class WhatsAppConfigurationError extends Error {}

export class MockWhatsAppSender implements WhatsAppSender {
  async sendText(_waId: string, _body: string): Promise<{ externalMessageId: string | null }> {
    return { externalMessageId: null };
  }
}

export class CloudWhatsAppSender implements WhatsAppSender {
  private readonly baseUrl: string;

  constructor(
    private readonly env: Pick<WhatsAppEnv, 'WHATSAPP_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID' | 'WHATSAPP_API_VERSION'>,
    private readonly fetcher: typeof fetch = fetch
  ) {
    const token = env.WHATSAPP_TOKEN?.trim();
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneNumberId) {
      throw new WhatsAppConfigurationError('WhatsApp Cloud API credentials are not configured');
    }
    const version = env.WHATSAPP_API_VERSION?.trim() || 'v23.0';
    if (!/^v\d+\.\d+$/.test(version)) {
      throw new WhatsAppConfigurationError('WhatsApp API version is invalid');
    }
    this.baseUrl = `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
  }

  async sendText(waId: string, body: string): Promise<{ externalMessageId: string | null }> {
    const response = await this.fetcher(this.baseUrl, {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: waId,
        type: 'text',
        text: { preview_url: false, body }
      })
    });

    if (!response.ok) {
      throw new Error(`WhatsApp Cloud API request failed with status ${response.status}`);
    }
    const payload = await response.json<{ messages?: Array<{ id?: unknown }> }>();
    const externalMessageId = payload.messages?.[0]?.id;
    return { externalMessageId: typeof externalMessageId === 'string' ? externalMessageId : null };
  }
}

export function createWhatsAppSender(env: WhatsAppEnv): WhatsAppSender {
  return env.CHANNEL_MODE?.trim().toLowerCase() === 'mock' ? new MockWhatsAppSender() : new CloudWhatsAppSender(env);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyWhatsAppSignature(rawBody: ArrayBuffer, signature: string | null | undefined, env: Pick<WhatsAppEnv, 'CHANNEL_MODE' | 'WHATSAPP_APP_SECRET'>): Promise<boolean> {
  if (env.CHANNEL_MODE?.trim().toLowerCase() === 'mock') return true;
  const secret = env.WHATSAPP_APP_SECRET?.trim();
  if (!secret || !signature) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, rawBody);
  return timingSafeEqual(signature, `sha256=${toHex(digest)}`);
}

export async function hashWhatsAppPayload(rawBody: ArrayBuffer): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', rawBody));
}

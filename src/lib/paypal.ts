export type PaymentCheckout = {
  providerOrderId: string;
  approvalUrl: string | null;
};

export interface PaymentProvider {
  createDepositOrder(input: { orderId: string; amountCents: number; currency: string; returnUrl: string; cancelUrl: string }): Promise<PaymentCheckout>;
  captureDepositOrder(providerOrderId: string): Promise<{ status: string }>;
}

export class MockPaymentProvider implements PaymentProvider {
  async createDepositOrder(input: { orderId: string; amountCents: number; currency: string; returnUrl: string; cancelUrl: string }): Promise<PaymentCheckout> {
    return { providerOrderId: `MOCK-${input.orderId}`, approvalUrl: null };
  }

  async captureDepositOrder(): Promise<{ status: string }> {
    return { status: 'COMPLETED' };
  }
}

export type PayPalEnvironment = {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_SECRET?: string;
  PAYPAL_MODE?: string;
  PAYPAL_WEBHOOK_ID?: string;
};

export type PayPalCaptureAmount = {
  currency_code: string;
  value: string;
};

export type PayPalCaptureDetails = {
  id: string;
  status: string;
  custom_id?: string;
  amount: PayPalCaptureAmount;
  supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
};

export type PayPalCaptureResult = {
  status: string;
  captures: PayPalCaptureDetails[];
};

export type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: unknown;
  [key: string]: unknown;
};

export type PayPalWebhookVerification = {
  verificationStatus: 'SUCCESS';
};

type PayPalLink = {
  rel?: string;
  href?: string;
};

type PayPalOrderResponse = {
  id?: string;
  status?: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    custom_id?: string;
    payments?: {
      captures?: PayPalCaptureDetails[];
    };
  }>;
};

type PayPalTokenResponse = {
  access_token?: string;
};

const REQUEST_TIMEOUT_MS = 15_000;
const ZERO_DECIMAL_CURRENCIES = new Set(['HUF', 'JPY', 'TWD']);

function getApiBaseUrl(env: PayPalEnvironment): string {
  if (env.PAYPAL_MODE === 'sandbox') return 'https://api-m.sandbox.paypal.com';
  if (env.PAYPAL_MODE === 'live') return 'https://api-m.paypal.com';
  throw new Error('PayPal mode must be explicitly configured as sandbox or live');
}

function getRequiredValue(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`PayPal configuration is missing: ${name}`);
  return value;
}

function formatMinorUnits(amountCents: number, currency: string): string {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('PayPal amount must be a positive integer in minor units');
  }

  const exponent = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
  const digits = amountCents.toString();
  if (exponent === 0) return digits;
  const whole = digits.length > exponent ? digits.slice(0, -exponent) : '0';
  const fraction = digits.padStart(exponent, '0').slice(-exponent);
  return `${whole}.${fraction}`;
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('PayPal returned an invalid response');
  }
}

async function readResponse(response: Response): Promise<unknown> {
  return parseJson(await response.text());
}

export class PayPalRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'PayPalRequestError'; }
}

function providerError(response: Response): Error {
  const requestId = response.headers.get('paypal-debug-id');
  const suffix = requestId ? `, request ID ${requestId}` : '';
  return new PayPalRequestError(response.status, `PayPal request failed with status ${response.status}${suffix}`);
}

async function fetchAccessToken(env: PayPalEnvironment, baseUrl: string): Promise<string> {
  const clientId = getRequiredValue(env.PAYPAL_CLIENT_ID, 'PAYPAL_CLIENT_ID');
  const secret = getRequiredValue(env.PAYPAL_SECRET, 'PAYPAL_SECRET');
  const credentials = btoa(`${clientId}:${secret}`);
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw providerError(response);

  const body = await readResponse(response) as PayPalTokenResponse;
  if (!body.access_token) throw new Error('PayPal OAuth response did not contain an access token');
  return body.access_token;
}

function getHeader(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim();
  if (!value) throw new Error(`PayPal webhook header is missing: ${name}`);
  return value;
}

export class PayPalPaymentProvider implements PaymentProvider {
  private readonly baseUrl: string;

  constructor(private readonly env: PayPalEnvironment) {
    this.baseUrl = getApiBaseUrl(env);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const accessToken = await fetchAccessToken(this.env, this.baseUrl);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init.headers
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw providerError(response);
    return await readResponse(response) as T;
  }

  async createDepositOrder(input: { orderId: string; amountCents: number; currency: string; returnUrl: string; cancelUrl: string; requestKey?: string }): Promise<PaymentCheckout> {
    const orderId = input.orderId.trim();
    if (!orderId) throw new Error('PayPal order ID is required');
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('PayPal currency must be a three-letter ISO code');

    const body = await this.request<PayPalOrderResponse>('/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': input.requestKey ?? `create-${orderId}` },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: orderId,
          amount: {
            currency_code: currency,
            value: formatMinorUnits(input.amountCents, currency)
          }
        }],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl
        }
      })
    });
    if (!body.id) throw new Error('PayPal order response did not contain an order ID');
    const approvalUrl = body.links?.find(link => link.rel === 'approve')?.href;
    if (!approvalUrl) throw new Error('PayPal order response did not contain an approval link');
    return { providerOrderId: body.id, approvalUrl };
  }

  async getOrder(providerOrderId: string): Promise<PayPalOrderResponse> {
    return this.request<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}`, { method: 'GET' });
  }

  async captureDepositOrder(providerOrderId: string): Promise<PayPalCaptureResult> {
    if (!providerOrderId.trim()) throw new Error('PayPal provider order ID is required');
    const body = await this.request<PayPalOrderResponse>(`/v2/checkout/orders/${encodeURIComponent(providerOrderId)}/capture`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `capture-${providerOrderId}`, Prefer: 'return=representation' }
    });
    if (!body.status || body.id !== providerOrderId) throw new Error('PayPal capture response did not match the provider order');
    const captures = body.purchase_units?.flatMap(unit => (unit.payments?.captures ?? []).map(capture => ({ ...capture, custom_id: capture.custom_id ?? unit.custom_id }))) ?? [];
    return { status: body.status, captures };
  }
}

export async function verifyPayPalWebhook(
  env: PayPalEnvironment,
  headers: Headers,
  rawBody: string,
  _event: PayPalWebhookEvent
): Promise<PayPalWebhookVerification> {
  const baseUrl = getApiBaseUrl(env);
  const accessToken = await fetchAccessToken(env, baseUrl);
  const verificationBody = JSON.stringify({
    auth_algo: getHeader(headers, 'paypal-auth-algo'),
    cert_url: getHeader(headers, 'paypal-cert-url'),
    transmission_id: getHeader(headers, 'paypal-transmission-id'),
    transmission_sig: getHeader(headers, 'paypal-transmission-sig'),
    transmission_time: getHeader(headers, 'paypal-transmission-time'),
    webhook_id: getRequiredValue(env.PAYPAL_WEBHOOK_ID, 'PAYPAL_WEBHOOK_ID')
  });
  const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: `${verificationBody.slice(0, -1)},"webhook_event":${rawBody}}`,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw providerError(response);

  const body = await readResponse(response) as { verification_status?: string };
  if (body.verification_status !== 'SUCCESS') throw new Error('PayPal webhook signature verification failed');
  return { verificationStatus: 'SUCCESS' };
}

import { Hono } from 'hono';
import type { Bindings } from '../index';
import { verifyWhatsAppSignature } from '../lib/whatsapp';
import { acceptWhatsAppWebhook } from '../services/conversation-jobs';
import type { WhatsAppWebhookPayload } from '../services/conversation-jobs';

const whatsapp = new Hono<{ Bindings: Bindings }>();

whatsapp.get('/', c => {
  const configuredToken = c.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const mode = c.req.query('hub.mode');
  const verifyToken = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  if (configuredToken && mode === 'subscribe' && verifyToken === configuredToken && challenge !== undefined) {
    return c.text(challenge);
  }
  return c.text('Forbidden', 403);
});

whatsapp.post('/', async c => {
  const rawBody = await c.req.raw.arrayBuffer();
  if (!(await verifyWhatsAppSignature(rawBody, c.req.header('X-Hub-Signature-256'), c.env))) {
    return c.text('Unauthorized', 401);
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as WhatsAppWebhookPayload;
  } catch {
    return c.text('Bad request', 400);
  }
  if (payload.object !== 'whatsapp_business_account') {
    return c.text('OK', 200);
  }

  try {
    const accepted = await acceptWhatsAppWebhook(c.env, payload, rawBody, c.req.header('X-WhatsApp-Event-Id'));
    if (!accepted.duplicate) {
      c.executionCtx.waitUntil(accepted.process());
    }
    return c.text('OK', 200);
  } catch {
    return c.text('Service unavailable', 503);
  }
});

export default whatsapp;

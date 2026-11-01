export type TelegramEnv = {
  TELEGRAM_BOT_TOKEN?: string;
};

export class TelegramDeliveryError extends Error {
  readonly permanent: boolean;
  readonly retryAfterSeconds?: number;

  constructor(message: string, permanent: boolean, retryAfterSeconds?: number) {
    super(message);
    this.name = 'TelegramDeliveryError';
    this.permanent = permanent;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

type TelegramResponse = {
  ok?: unknown;
  result?: {
    message_id?: unknown;
  };
  parameters?: {
    retry_after?: unknown;
  };
};

const REQUEST_TIMEOUT_MS = 10_000;

async function readJson(response: Response): Promise<TelegramResponse | undefined> {
  try {
    return await response.json() as TelegramResponse;
  } catch {
    return undefined;
  }
}

function retryAfterSeconds(body: TelegramResponse | undefined): number | undefined {
  const value = body?.parameters?.retry_after;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(3600, Math.max(1, Math.ceil(value)));
}

export class TelegramSender {
  private readonly token: string;

  constructor(env: TelegramEnv) {
    if (!env.TELEGRAM_BOT_TOKEN?.trim()) {
      throw new TelegramDeliveryError('Telegram bot token is required', true);
    }
    this.token = env.TELEGRAM_BOT_TOKEN;
  }

  async sendText(recipient: string, body: string): Promise<{ id: string }> {
    const match = typeof recipient === 'string' ? /^tg:([1-9][0-9]*)$/.exec(recipient) : null;
    if (!match) {
      throw new TelegramDeliveryError('Telegram recipient must be a positive numeric private chat ID with the tg: prefix', true);
    }
    if (typeof body !== 'string' || body.length === 0 || body.length > 4096) {
      throw new TelegramDeliveryError('Telegram message must be nonempty and at most 4096 UTF-16 code units', true);
    }

    const chatId = match[1];
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: body,
          link_preview_options: { is_disabled: true }
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch {
      throw new TelegramDeliveryError('Telegram request failed', false);
    }

    if (response.status === 429) {
      throw new TelegramDeliveryError(
        'Telegram request was rate limited',
        false,
        retryAfterSeconds(await readJson(response))
      );
    }
    if (!response.ok) {
      throw new TelegramDeliveryError(
        `Telegram request failed with status ${response.status}`,
        response.status === 400 || response.status === 403
      );
    }

    const result = await readJson(response);
    const messageId = result?.result?.message_id;
    if (result?.ok !== true || typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId <= 0) {
      throw new TelegramDeliveryError('Telegram response was malformed', false);
    }
    return { id: `tgmsg:${chatId}:${messageId}` };
  }
}

import { HTTPException } from 'hono/http-exception';

export type EmailBinding = {
  send(message: { to: string; from: string | { email: string; name?: string }; subject: string; text: string }): Promise<{ messageId?: string }>;
};

export async function sendLoginCode(env: { EMAIL?: EmailBinding; EMAIL_FROM?: string }, email: string, code: string): Promise<void> {
  const from = env.EMAIL_FROM?.trim();
  if (!from || !env.EMAIL?.send) throw new HTTPException(503, { message: 'Email delivery is not configured' });
  try {
    await env.EMAIL.send({
      to: email,
      from: { email: from, name: 'Sahar' },
      subject: 'Your Sahar sign-in code',
      text: `Your Sahar sign-in code is ${code}. It expires in 5 minutes and can be used once. If you did not request it, you can ignore this email.`
    });
  } catch (error) {
    const codeName = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code) : 'send_failed';
    console.error('Login email failed', { code: codeName });
    throw new HTTPException(503, { message: 'Email delivery is unavailable' });
  }
}

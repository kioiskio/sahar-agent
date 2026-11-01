import { recoverCreditReservations } from '../lib/credits';
import { processConversationJobs } from './conversation-jobs';
import type { Bindings } from '../index';

export async function runMaintenance(env: Bindings): Promise<void> {
  await recoverCreditReservations(env.DB);
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const demoCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM conversation_jobs WHERE conversation_id IN (SELECT id FROM conversations WHERE channel = 'demo' AND created_at < ?)").bind(demoCutoff),
    env.DB.prepare("DELETE FROM outbound_deliveries WHERE conversation_id IN (SELECT id FROM conversations WHERE channel = 'demo' AND created_at < ?)").bind(demoCutoff),
    env.DB.prepare("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE channel = 'demo' AND created_at < ?)").bind(demoCutoff),
    env.DB.prepare("DELETE FROM deposit_orders WHERE conversation_id IN (SELECT id FROM conversations WHERE channel = 'demo' AND created_at < ?)").bind(demoCutoff),
    env.DB.prepare("DELETE FROM conversations WHERE channel = 'demo' AND created_at < ?").bind(demoCutoff)
  ]);
  await env.DB.prepare("DELETE FROM webhook_events WHERE created_at < ? AND status = 'processed'").bind(cutoff).run();
  await processConversationJobs(env);
}

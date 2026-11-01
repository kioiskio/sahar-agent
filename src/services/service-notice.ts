import type { Locale } from '../i18n/locales';

const copy: Record<Locale, [string, string]> = {
  en: ['AI replies are temporarily unavailable. Your message is saved and will be retried. Send /human for an agent.', 'AI could not answer after several attempts. Send /human for agent follow-up, or try again later.'],
  'zh-CN': ['AI 暂时无法回复，你的消息已保存，系统会自动重试。发送 /human 可转人工跟进。', 'AI 多次尝试后仍未能回复。请发送 /human 转人工跟进，或稍后重试。'],
  'zh-TW': ['AI 暫時無法回覆，你的訊息已儲存，系統會自動重試。傳送 /human 可轉人工跟進。', 'AI 多次嘗試後仍無法回覆。請傳送 /human 轉人工跟進，或稍後重試。'],
  fr: ['Les réponses IA sont temporairement indisponibles. Votre message est enregistré et sera réessayé. Envoyez /human pour un agent.', 'L’IA n’a pas pu répondre après plusieurs tentatives. Envoyez /human pour un agent ou réessayez plus tard.'],
  de: ['KI-Antworten sind vorübergehend nicht verfügbar. Ihre Nachricht ist gespeichert und wird erneut bearbeitet. Senden Sie /human für einen Makler.', 'Die KI konnte nach mehreren Versuchen nicht antworten. Senden Sie /human für einen Makler oder versuchen Sie es später erneut.'],
  ar: ['ردود الذكاء الاصطناعي غير متاحة مؤقتاً. حُفظت رسالتك وستُعاد المحاولة. أرسل /human للتواصل مع وكيل.', 'تعذر الرد بعد عدة محاولات. أرسل /human لمتابعة وكيل أو حاول لاحقاً.']
};

export async function addServiceNotice(db: D1Database, externalId: string, conversationId: string, exhausted: boolean): Promise<void> {
  const conversation = await db.prepare('SELECT locale,wa_id,status FROM conversations WHERE id=?').bind(conversationId).first<{ locale: Locale; wa_id: string; status: string }>();
  if (!conversation?.wa_id.startsWith('tg:') || conversation.status !== 'active') return;
  const id = `service_notice_${externalId}${exhausted ? '_dead' : ''}`;
  const body = (copy[conversation.locale] ?? copy.en)[exhausted ? 1 : 0];
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO messages(id,conversation_id,direction,sender_type,body,message_type,delivery_status,created_at) VALUES(?,?,'outbound','system',?,'service_notice','pending',?)").bind(id,conversationId,body,now),
    db.prepare("INSERT OR IGNORE INTO outbound_deliveries(id,conversation_id,message_id,recipient,body,status,attempts,max_attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,'pending',0,5,?,?,?)").bind(`delivery_${id}`,conversationId,id,conversation.wa_id,body,now,now,now)
  ]);
}

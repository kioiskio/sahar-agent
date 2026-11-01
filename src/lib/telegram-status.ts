import type { Locale } from '../i18n/locales';

type Status = 'handoff' | 'closed' | 'disabled' | 'resumed' | 'welcome';
const copy: Record<Locale, Record<Status, string>> = {
  en: {
    handoff: 'This conversation is awaiting an agent, so AI replies are paused. Your message has been saved. Send /resume to continue with AI; your order and conversation history will be kept.',
    closed: 'This conversation has been closed by the operator. Your message has been saved. Please contact the operator for further assistance.',
    disabled: 'AI replies are currently disabled by the operator. Your message has been saved for follow-up.',
    resumed: 'AI replies are now enabled for this conversation. Your existing order and history are unchanged. How can I help?',
    welcome: 'Hi, I am Sahar. Tell me your preferred area, budget and layout. Send /human to request an agent.'
  },
  'zh-CN': {
    handoff: '此会话正在等待人工接手，AI 自动回复已暂停。你的消息已保存。发送 /resume 可继续与 AI 对话，订单和聊天记录都会保留。',
    closed: '此会话已由工作人员关闭，你的消息已保存。如需继续处理，请联系工作人员。',
    disabled: '工作人员目前已关闭 AI 自动回复，你的消息已保存，等待后续处理。',
    resumed: '此会话已恢复 AI 自动回复，现有订单和聊天记录保持不变。有什么可以帮你？',
    welcome: '你好，我是 Sahar。请告诉我你偏好的区域、预算和户型。发送 /human 可请求人工接手。'
  },
  'zh-TW': {
    handoff: '此對話正在等待人工接手，AI 自動回覆已暫停。你的訊息已儲存。傳送 /resume 可繼續與 AI 對話，訂單和對話紀錄都會保留。',
    closed: '此對話已由工作人員關閉，你的訊息已儲存。如需繼續處理，請聯絡工作人員。',
    disabled: '工作人員目前已關閉 AI 自動回覆，你的訊息已儲存，等待後續處理。',
    resumed: '此對話已恢復 AI 自動回覆，現有訂單和對話紀錄保持不變。有什麼可以幫你？',
    welcome: '你好，我是 Sahar。請告訴我你偏好的區域、預算和戶型。傳送 /human 可請求人工接手。'
  },
  fr: {
    handoff: 'Cette conversation attend un agent. Les réponses IA sont en pause et votre message a été enregistré. Envoyez /resume pour reprendre avec l’IA, en conservant votre commande et votre historique.',
    closed: 'Cette conversation a été fermée par l’opérateur. Votre message a été enregistré. Veuillez contacter l’opérateur pour obtenir de l’aide.',
    disabled: 'Les réponses IA sont désactivées par l’opérateur. Votre message a été enregistré pour le suivi.',
    resumed: 'Les réponses IA sont réactivées. Votre commande et votre historique sont conservés. Comment puis-je vous aider ?',
    welcome: 'Bonjour, je suis Sahar. Indiquez le quartier, le budget et le type de logement souhaités. Envoyez /human pour demander un agent.'
  },
  de: {
    handoff: 'Dieses Gespräch wartet auf einen Mitarbeiter. KI-Antworten sind pausiert; Ihre Nachricht wurde gespeichert. Mit /resume können Sie mit der KI fortfahren. Bestellung und Verlauf bleiben erhalten.',
    closed: 'Dieses Gespräch wurde vom Betreiber geschlossen. Ihre Nachricht wurde gespeichert. Bitte wenden Sie sich für weitere Hilfe an den Betreiber.',
    disabled: 'KI-Antworten sind vom Betreiber deaktiviert. Ihre Nachricht wurde für die weitere Bearbeitung gespeichert.',
    resumed: 'KI-Antworten sind wieder aktiviert. Bestellung und Verlauf bleiben unverändert. Wie kann ich helfen?',
    welcome: 'Hallo, ich bin Sahar. Nennen Sie die gewünschte Gegend, Ihr Budget und den Wohnungstyp. Senden Sie /human für einen Mitarbeiter.'
  },
  ar: {
    handoff: 'هذه المحادثة بانتظار موظف، لذلك تم إيقاف ردود الذكاء الاصطناعي مؤقتاً. تم حفظ رسالتك. أرسل /resume للمتابعة مع الذكاء الاصطناعي مع الاحتفاظ بالطلب وسجل المحادثة.',
    closed: 'أغلق المشغّل هذه المحادثة. تم حفظ رسالتك. يرجى التواصل مع المشغّل للمساعدة.',
    disabled: 'ردود الذكاء الاصطناعي معطّلة حالياً من المشغّل. تم حفظ رسالتك للمتابعة.',
    resumed: 'تم تفعيل ردود الذكاء الاصطناعي مجدداً. لم يتغير طلبك أو سجل المحادثة. كيف يمكنني مساعدتك؟',
    welcome: 'مرحباً، أنا سحر. أخبرني بالمنطقة والميزانية ونوع العقار الذي تفضله. أرسل /human لطلب موظف.'
  }
};

export function telegramStatusCopy(locale: Locale, status: Status): string {
  return (copy[locale] ?? copy.en)[status];
}

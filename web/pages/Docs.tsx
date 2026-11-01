import { Alert, Button, Card, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Paragraph, Title } = Typography;
const content = {
  en: {
    title: 'Sahar documentation', intro: 'Sign in with an email code, use your trial credits, or continue a real Telegram and PayPal Sandbox enquiry.',
    demoTitle: 'Web workspace', demoBody: 'Get started with your email. The first verified sign-in creates an account and grants 50 trial credits. Each successful AI reply uses one credit. Credits are a usage allowance, not a wallet or a property deposit. When they run out, contact kioiskio01@gmail.com.', demoButton: 'Open workspace',
    telegramTitle: 'Real Telegram enquiries', telegramBody: 'Open @SaharDubaiAgentBot, press Start, and describe your preferred area, budget, bedrooms and timeline. The bot uses a language model and conversation history to recommend properties from the test catalogue. Ask for an agent to request a handoff.', telegramButton: 'Open Telegram bot',
    paymentTitle: 'PayPal Sandbox checkout', paymentBody: 'Select a property, ask about the intent deposit, then explicitly confirm it. Open the checkout link, review the terms, and continue to sandbox.paypal.com. Approve with a Sandbox Personal buyer account. The return flow captures the order; verified PayPal callbacks update the payment record. No real money is used.',
    status: 'Acceptance status', statusBody: 'Verified on October 30, 2026: real Telegram AI replies, a USD 100 PayPal Sandbox capture, a verified payment webhook, Telegram confirmation and agent handoff. Sandbox uses test funds and sample listings.',
    adminTitle: 'Administration', adminBody: 'The operator signs in with the verified admin email, then reviews accounts, sign-in history and credit balances. Credits can be added manually. PayPal remains Sandbox and listings remain a test catalogue.', adminButton: 'Open administration',
    channelTitle: 'Messaging channel', channelBody: 'Telegram is a real messaging channel for this deployment. The signed-in web workspace calls the same model without sending Telegram messages.',
    languageTitle: 'Languages', languageBody: 'Choose your interface language on the home page. Subsequent pages remember it, including Arabic with a right-to-left layout. Telegram uses your Telegram language setting for the conversation.', back: 'Back home'
  },
  ar: {
    title: 'مستندات سحر', intro: 'سجّل الدخول برمز البريد الإلكتروني، واستخدم أرصدة التجربة، أو تابع استفسار Telegram ودفع PayPal Sandbox.',
    demoTitle: 'مساحة العمل', demoBody: 'ابدأ ببريدك الإلكتروني. أول تحقق ينشئ حساباً ويمنح 50 رصيداً تجريبياً. كل رد ناجح من الذكاء الاصطناعي يستهلك رصيداً واحداً. الأرصدة حد استخدام وليست محفظة أو عربون عقار. عند نفادها راسل kioiskio01@gmail.com.', demoButton: 'افتح مساحة العمل',
    telegramTitle: 'استفسارات Telegram الحقيقية', telegramBody: 'افتح @SaharDubaiAgentBot واضغط Start ثم اذكر المنطقة والميزانية وعدد الغرف وموعد الشراء. يستخدم البوت نموذجاً لغوياً وسجل المحادثة لاقتراح عقارات من الكتالوج الاختباري. اطلب وكيلاً للتحويل إلى المتابعة البشرية.', telegramButton: 'افتح بوت Telegram',
    paymentTitle: 'الدفع عبر PayPal Sandbox', paymentBody: 'اختر عقاراً واستفسر عن عربون إثبات الاهتمام ثم أكّده صراحةً. افتح رابط الدفع وراجع الشروط وانتقل إلى sandbox.paypal.com. وافق باستخدام حساب مشتري Sandbox Personal. يُنفّذ التحصيل عند العودة وتحدّث إشعارات PayPal المتحقق منها سجل الدفع. لا تُستخدم أموال حقيقية.',
    status: 'حالة التحقق', statusBody: 'تم التحقق في 30 أكتوبر 2026 من ردود Telegram الحقيقية وتحصيل 100 دولار عبر PayPal Sandbox وإشعار الدفع المتحقق منه وتأكيد Telegram والتحويل للوكيل. تُستخدم أموال اختبارية وعقارات نموذجية.',
    adminTitle: 'الإدارة', adminBody: 'يدخل المشغّل بالبريد المتحقق منه ثم يراجع الحسابات وسجل الدخول وأرصدة credits. يمكن إضافة الأرصدة يدوياً. يبقى PayPal في وضع Sandbox والعقارات كتالوجاً اختبارياً.', adminButton: 'افتح الإدارة',
    channelTitle: 'قناة المراسلة', channelBody: 'Telegram قناة مراسلة حقيقية في هذا النشر. مساحة الويب بعد تسجيل الدخول تستدعي النموذج نفسه دون إرسال رسائل Telegram.',
    languageTitle: 'اللغات', languageBody: 'اختر لغة الواجهة من الصفحة الرئيسية. تتذكر الصفحات التالية اختيارك، بما في ذلك العربية بتخطيط من اليمين إلى اليسار. تستخدم محادثة Telegram إعداد لغة حسابك في Telegram.', back: 'العودة للرئيسية'
  }
};

export default function Docs({ navigate }: { navigate: (path: string) => void }) {
  const { i18n } = useTranslation();
  const c = content[i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'];
  return <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div><Title level={1}>{c.title}</Title><Paragraph>{c.intro}</Paragraph></div>
      <Card title={c.telegramTitle}><Paragraph>{c.telegramBody}</Paragraph><Button type="primary" href="https://t.me/SaharDubaiAgentBot" target="_blank" rel="noreferrer">{c.telegramButton}</Button></Card>
      <Card title={c.paymentTitle}><Paragraph>{c.paymentBody}</Paragraph><Alert type="info" showIcon title={c.status} description={c.statusBody} /></Card>
      <Card title={c.demoTitle}><Paragraph>{c.demoBody}</Paragraph><Button type="primary" onClick={() => navigate('/workspace')}>{c.demoButton}</Button></Card>
      <Card title={c.adminTitle}><Paragraph>{c.adminBody}</Paragraph><Button onClick={() => navigate('/admin')}>{c.adminButton}</Button></Card>
      <Card title={c.channelTitle}><Paragraph>{c.channelBody}</Paragraph></Card>
      <Card title={c.languageTitle}><Paragraph>{c.languageBody}</Paragraph></Card>
      <Button onClick={() => navigate('/')}>{c.back}</Button>
    </Space>
  </div>;
}

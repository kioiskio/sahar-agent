export function hasExplicitDepositConsent(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
  // A question, a conditional example or an instruction to wait is not assent.
  if (/[?？]/.test(normalized) || /\b(?:if|unless|suppose|hypothetically|example)\b|如果|假如|假设|假設|\bwenn\b|\bsi\s|إذا|لو\s/.test(normalized)) return false;
  if (/\b(?:do not|don't|dont|never|cannot|can't|will not|won't|must not|should not)\s+(?:\w+\s+){0,3}(?:confirm|create|proceed|pay|start|authorize)\b|\b(?:not ready|not yet|cancel|stop|wait|hold off)\b/.test(normalized)) return false;
  if (/不要|请勿|請勿|暂不|暫不|先别|先別|不确认|不確認|不支付|\bne\b.{0,25}\bpas\b|\bnicht\b|\bkeine\b|لا\s+(?:أوافق|تؤكد|تنشئ|تدفع)|لن\s+(?:أدفع|أؤكد)/.test(normalized)) return false;

  // Quoted commands can be discussed without authorizing the action they describe.
  const statement = normalized.replace(/"[^"]*"|“[^”]*”|`[^`]*`|(?:^|\s)'[^']+'(?=\s|[.!?,;:]|$)/g, ' ');
  if (/^(?:please\s+)?(?:i\s+(?:explicitly\s+)?)?confirm\s+(?:the\s+)?(?:intent[- ]?)?deposit(?:\s+for\s+[^.!?]+)?[.!]?$/.test(statement)) return true;
  if (/(?:^|[.!;]\s+)i\s+(?:explicitly\s+)?confirm\s+(?:that\s+)?i\s+(?:(?:want|wish|intend|would like)\s+to|am ready to)\s+(?:proceed|pay|create|start)\b.{0,180}\b(?:deposit|payment|checkout)\b/.test(statement)) return true;
  if (/(?:^|[.!;]\s+)(?:please\s+)?(?:create|start)\s+(?:(?:the|my|a|this)\s+)?(?:(?:paypal|sandbox)\s+)*(?:checkout|deposit order|payment checkout)\b/.test(statement)) return true;

  return /^(?:我)?(?:确认|確認).{0,6}(?:意向金|定金|订金|訂金)[。！.!]?$/.test(statement)
    || /^(?:je\s+confirme|confirmer)\s+(?:l['’]\s*|le\s+)?acompte[.!]?$/.test(statement)
    || /^(?:die\s+)?anzahlung\s+bestätigen[.!]?$/.test(statement)
    || /^تأكيد\s+(?:العربون|الدفعة)[.!]?$/.test(statement);
}

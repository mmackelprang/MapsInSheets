const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/\S+$/i;
const PHONE_RE = /^(?:\+?\d[\d\s().-]{8,}\d|\([\d]{3}\)[\d\s().-]{6,}\d)$/;

function normalizePhone(s) {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return '+' + digits;
}

function classifyValue(value) {
  const text = value == null ? '' : String(value).trim();
  if (text === '') return { kind: 'text', href: null, text: '' };

  if (EMAIL_RE.test(text)) {
    return { kind: 'email', href: 'mailto:' + text, text };
  }
  if (URL_RE.test(text)) {
    return { kind: 'url', href: text, text };
  }
  if (PHONE_RE.test(text)) {
    const digits = text.replace(/\D/g, '');
    if (digits.length >= 10) {
      return { kind: 'phone', href: 'tel:' + normalizePhone(text), text };
    }
  }
  return { kind: 'text', href: null, text };
}

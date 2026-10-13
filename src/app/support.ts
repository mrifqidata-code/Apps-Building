import { normalizeWhatsAppNumber, whatsAppShareUrl } from '../domain/receipt-text';

/**
 * The operator's WhatsApp number, set at build time in Cloudflare
 * (VITE_SUPPORT_WHATSAPP) so it is not kept in the repo. Null hides the
 * "Hubungi kami" buttons.
 */
export function supportWhatsAppNumber(): string | null {
  const raw = import.meta.env.VITE_SUPPORT_WHATSAPP?.trim();
  return raw ? normalizeWhatsAppNumber(raw) : null;
}

/** wa.me link to the operator with a message ready to send, or null without a number. */
export function supportWhatsAppUrl(text: string): string | null {
  const phone = supportWhatsAppNumber();
  return phone ? whatsAppShareUrl(text, phone) : null;
}

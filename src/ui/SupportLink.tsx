import { supportWhatsAppUrl } from '../app/support';

/** Opens WhatsApp to the operator with `message` filled in. Renders nothing without a number. */
export function SupportLink({ message, label }: { message: string; label: string }) {
  const url = supportWhatsAppUrl(message);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 font-semibold text-white active:bg-emerald-700"
    >
      {label}
    </a>
  );
}

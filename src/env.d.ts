interface ImportMetaEnv {
  /** Supabase project URL, e.g. https://abcdefgh.supabase.co. Empty = cloud sync off. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key (sb_publishable_…). Safe to ship in the app; RLS protects the data. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** The operator's WhatsApp number for "Hubungi kami", e.g. 0812xxxx. Empty = buttons hidden. */
  readonly VITE_SUPPORT_WHATSAPP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

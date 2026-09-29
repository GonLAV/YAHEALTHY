/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Public origin for canonical/hreflang/OG URLs, e.g. https://www.example.com */
  readonly VITE_SITE_URL?: string;
  /** Share (0–1) of window-level JS errors reported to /api/client-errors; default 0.5. Boundary crashes are always reported. */
  readonly VITE_CLIENT_ERROR_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

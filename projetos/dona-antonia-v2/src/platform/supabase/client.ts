import { createClient } from '@supabase/supabase-js';

export interface SupabaseBrowserConfig {
  readonly url: string;
  readonly publishableKey: string;
}

export function readSupabaseBrowserConfig(
  url: string | undefined,
  publishableKey: string | undefined,
): SupabaseBrowserConfig | null {
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') return null;
    if (!publishableKey.startsWith('sb_publishable_')) return null;
    return { url: parsed.origin, publishableKey };
  } catch {
    return null;
  }
}

export function createSupabaseBrowserClient(config: SupabaseBrowserConfig) {
  return createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'dona-antonia-v2.auth',
    },
  });
}

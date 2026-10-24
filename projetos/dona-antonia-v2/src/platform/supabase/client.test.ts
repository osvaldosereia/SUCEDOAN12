import { describe, expect, it } from 'vitest';
import { readSupabaseBrowserConfig } from './client';

describe('Supabase browser configuration', () => {
  it('accepts only a valid project URL and a publishable key', () => {
    expect(
      readSupabaseBrowserConfig('https://project-ref.supabase.co', 'sb_publishable_public-key'),
    ).toEqual({
      url: 'https://project-ref.supabase.co',
      publishableKey: 'sb_publishable_public-key',
    });
    expect(
      readSupabaseBrowserConfig('https://project-ref.supabase.co', 'eyJlegacy-anon-key'),
    ).toBeNull();
  });

  it('fails closed for missing or invalid configuration', () => {
    expect(readSupabaseBrowserConfig(undefined, undefined)).toBeNull();
    expect(readSupabaseBrowserConfig('not-a-url', 'sb_publishable_key')).toBeNull();
    expect(readSupabaseBrowserConfig('http://project-ref.supabase.co', 'secret-key')).toBeNull();
  });
});

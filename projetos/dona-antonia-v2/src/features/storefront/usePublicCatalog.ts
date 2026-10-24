import { useEffect, useState } from 'react';
import type { Product } from '../../core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from '../../data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from '../../data/demo-extra';
import { loadPublicCatalog } from '../../data/catalog';
import {
  readSupabaseBrowserConfig,
  createSupabaseBrowserClient,
} from '../../platform/supabase/client';
import { createSupabasePublicCatalogReader } from '../../platform/supabase/public-catalog';

export const PUBLIC_INITIAL_TYPES = [...DEMO_TYPES, ...DEMO_EXTRA_TYPES];
export const PUBLIC_INITIAL_PRODUCTS = [...DEMO_PRODUCTS, ...DEMO_EXTRA_PRODUCTS];
export const PUBLIC_INITIAL_TEMPLATES = DEMO_TEMPLATES;
export const PUBLIC_INITIAL_EXTRAS = DEMO_EXTRA_GROUPS;

const config = readSupabaseBrowserConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const reader = config
  ? createSupabasePublicCatalogReader(createSupabaseBrowserClient(config))
  : undefined;

export function usePublicCatalog() {
  const [catalog, setCatalog] = useState<readonly Product[]>(
    import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'preview'
      ? PUBLIC_INITIAL_PRODUCTS
      : [],
  );
  const [types, setTypes] = useState(PUBLIC_INITIAL_TYPES);
  const [templates, setTemplates] = useState(PUBLIC_INITIAL_TEMPLATES);
  const [extraGroups, setExtraGroups] = useState(PUBLIC_INITIAL_EXTRAS);
  const [isDemo, setIsDemo] = useState(
    import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'preview',
  );
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    loadPublicCatalog(controller.signal, reader)
      .then((result) => {
        setCatalog(result.isDemo ? [...result.products, ...DEMO_EXTRA_PRODUCTS] : result.products);
        if (result.types) setTypes(result.isDemo ? PUBLIC_INITIAL_TYPES : [...result.types]);
        if (result.baskets?.length)
          setTemplates(result.isDemo ? PUBLIC_INITIAL_TEMPLATES : [...result.baskets]);
        if (result.extras)
          setExtraGroups(result.isDemo ? PUBLIC_INITIAL_EXTRAS : [...result.extras]);
        setIsDemo(result.isDemo);
        setError(result.error ?? '');
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return { catalog, types, templates, extraGroups, isDemo, error };
}

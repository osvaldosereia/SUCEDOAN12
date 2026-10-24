import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '../../core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from '../../data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from '../../data/demo-extra';
import { invalidatePublicCatalogCache, loadPublicCatalog } from '../../data/catalog';
import {
  readSupabaseBrowserConfig,
  createSupabaseBrowserClient,
} from '../../platform/supabase/client';
import { createSupabasePublicCatalogReader } from '../../platform/supabase/public-catalog';
import { createSupabasePublicCheckoutClient } from '../../platform/supabase/public-checkout';

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
export const publicCheckoutClient = config
  ? createSupabasePublicCheckoutClient(createSupabaseBrowserClient(config))
  : undefined;

export function usePublicCatalog() {
  const demoMode = !reader && (import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'preview');
  const [catalog, setCatalog] = useState<readonly Product[]>(
    demoMode ? PUBLIC_INITIAL_PRODUCTS : [],
  );
  const [types, setTypes] = useState(demoMode ? PUBLIC_INITIAL_TYPES : []);
  const [templates, setTemplates] = useState(demoMode ? PUBLIC_INITIAL_TEMPLATES : []);
  const [extraGroups, setExtraGroups] = useState(demoMode ? PUBLIC_INITIAL_EXTRAS : []);
  const [isDemo, setIsDemo] = useState(demoMode);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(reader));
  const [stale, setStale] = useState(false);
  const loadedRef = useRef(false);

  const refresh = useCallback((invalidate = true) => {
    if (!reader) return undefined;
    if (invalidate) {
      invalidatePublicCatalogCache(reader);
      loadedRef.current = false;
    }
    const controller = new AbortController();
    if (!loadedRef.current) setLoading(true);
    setError('');
    loadPublicCatalog(controller.signal, reader)
      .then((result) => {
        setCatalog(result.isDemo ? [...result.products, ...DEMO_EXTRA_PRODUCTS] : result.products);
        setTypes(result.types ? (result.isDemo ? PUBLIC_INITIAL_TYPES : [...result.types]) : []);
        setTemplates(
          result.baskets ? (result.isDemo ? PUBLIC_INITIAL_TEMPLATES : [...result.baskets]) : [],
        );
        setExtraGroups(
          result.extras ? (result.isDemo ? PUBLIC_INITIAL_EXTRAS : [...result.extras]) : [],
        );
        setIsDemo(result.isDemo);
        setError(result.error ?? '');
        setStale(result.stale ?? false);
        loadedRef.current = true;
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setLoading(false);
        setError('Catálogo temporariamente indisponível. Nenhuma compra pode ser confirmada.');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanup = refresh(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cleanup?.();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refresh]);

  return { catalog, types, templates, extraGroups, isDemo, error, loading, stale, refresh };
}

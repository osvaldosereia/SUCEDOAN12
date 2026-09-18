export const APP_ROUTES = [
  'home',
  'catalog',
  'basket',
  'cart',
  'checkout',
  'order',
  'privacy',
] as const;

export type AppRoute = (typeof APP_ROUTES)[number];

export interface Navigator {
  current(): AppRoute;
  navigate(route: AppRoute): void;
  subscribe(listener: (route: AppRoute) => void): () => void;
}

export function isAppRoute(value: string): value is AppRoute {
  return APP_ROUTES.includes(value as AppRoute);
}

export function createNavigator(initial: AppRoute = 'home'): Navigator {
  let currentRoute = initial;
  const listeners = new Set<(route: AppRoute) => void>();

  return {
    current() {
      return currentRoute;
    },

    navigate(route) {
      if (!isAppRoute(route)) {
        throw new Error(`Unknown app route: ${String(route)}`);
      }

      if (route === currentRoute) return;

      currentRoute = route;
      for (const listener of listeners) listener(route);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

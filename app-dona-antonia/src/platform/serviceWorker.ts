export interface ServiceWorkerContainerLike {
  register(
    scriptURL: string,
    options?: RegistrationOptions,
  ): Promise<unknown>;
}

export function canRegisterAppServiceWorker(pathname: string): boolean {
  return pathname.startsWith('/app-dona-antonia/')
    || pathname.startsWith('/hml/app-dona-antonia/');
}

export async function registerAppServiceWorker(
  serviceWorker: ServiceWorkerContainerLike | undefined,
  pathname: string,
): Promise<boolean> {
  if (!serviceWorker || !canRegisterAppServiceWorker(pathname)) return false;

  await serviceWorker.register('./sw.js', {
    scope: './',
    updateViaCache: 'none',
  });
  return true;
}

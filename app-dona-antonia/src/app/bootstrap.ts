export interface BootstrapRoot {
  textContent: string | null;
  dataset: Record<string, string | undefined>;
}

export interface BootstrapResult {
  environment: 'homologation';
  externalRequests: 0;
}

export async function bootstrapApp({ root }: { root: BootstrapRoot }): Promise<BootstrapResult> {
  root.textContent = 'App Dona Antônia — Homologação';
  root.dataset.environment = 'homologation';

  return {
    environment: 'homologation',
    externalRequests: 0,
  };
}

import type { CartLine } from '../cart/types.ts';
import type { PaymentMethod } from '../checkout/types.ts';
import { evaluateHomologationExecution } from './homologationGuard.ts';

const HML_FUNCTIONS = {
  bootstrap: 'customer-app-hml-bootstrap-v1',
  catalog: 'customer-app-hml-catalog-v1',
  checkout: 'customer-app-hml-checkout-v1',
} as const;

export interface HmlApiClientOptions {
  enabled?: boolean;
  baseUrl?: string;
  publishableKey?: string;
  jwt?: string;
  clientId?: string;
  fetchImpl?: typeof fetch;
  environment?: 'homologation' | 'production';
  productionEnabled?: boolean;
}

export interface HmlCheckoutInput {
  cart: CartLine[];
  payment: PaymentMethod;
  totalCents: number;
}

export type HmlClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; reason: 'client_disabled' }
  | { ok: false; reason: 'network_error' }
  | { ok: false; reason: 'http_error'; status: number; data: unknown };

export interface HmlApiClient {
  bootstrap(): Promise<HmlClientResult<unknown>>;
  catalog(filters?: { section?: 'offers' | 'for-you' | 'for-home'; query?: string }): Promise<HmlClientResult<unknown>>;
  checkout(input: HmlCheckoutInput): Promise<HmlClientResult<unknown>>;
}

function requireTestClientId(value: string | undefined): string {
  if (!value || !/^TEST-CLIENT-[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new Error('HML clientId must start with TEST-CLIENT-');
  }
  return value;
}

function requireHttpsBaseUrl(value: string | undefined): string {
  if (!value) throw new Error('HML baseUrl is required when client is enabled');

  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('HML baseUrl must use HTTPS');
  }

  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function isTestRef(line: CartLine): boolean {
  if (line.kind === 'product') return line.refId.startsWith('TEST-PROD-');
  if (line.kind === 'basket') return line.refId.startsWith('TEST-BASKET-');
  return false;
}

export function createHmlApiClient(
  options: HmlApiClientOptions = {},
): HmlApiClient {
  const enabled = options.enabled === true;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!enabled) {
    const disabled = async (): Promise<HmlClientResult<never>> => ({
      ok: false,
      reason: 'client_disabled',
    });

    return {
      bootstrap: disabled,
      catalog: disabled,
      checkout: disabled,
    };
  }

  const baseUrl = requireHttpsBaseUrl(options.baseUrl);
  const clientId = requireTestClientId(options.clientId);
  const guard = evaluateHomologationExecution({
    action: 'hml_network',
    environment: options.environment ?? 'homologation',
    productionEnabled: options.productionEnabled === true,
    resourceId: clientId,
  });
  if (!guard.allowed) {
    throw new Error(`HML safety guard blocked client: ${guard.reason}`);
  }

  const publishableKey = options.publishableKey?.trim();
  const jwt = options.jwt?.trim();

  if (!publishableKey || !jwt) {
    throw new Error('HML publishableKey and JWT are required when client is enabled');
  }

  async function request(
    slug: string,
    init: RequestInit = {},
  ): Promise<HmlClientResult<unknown>> {
    const endpoint = slug.split('?')[0];
    if (!Object.values(HML_FUNCTIONS).includes(endpoint as typeof HML_FUNCTIONS[keyof typeof HML_FUNCTIONS])) {
      throw new Error('Only declared customer-app-hml-* functions are allowed');
    }

    let response: Response;
    try {
      response = await fetchImpl(
        `${baseUrl}/functions/v1/${slug}`,
        {
          ...init,
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${jwt}`,
            'x-hml-client-id': clientId,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
          },
        },
      );
    } catch {
      return {
        ok: false,
        reason: 'network_error',
      };
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: 'http_error',
        status: response.status,
        data,
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
    };
  }

  return {
    bootstrap() {
      return request(HML_FUNCTIONS.bootstrap);
    },

    catalog(filters = {}) {
      const url = new URL(
        `${baseUrl}/functions/v1/${HML_FUNCTIONS.catalog}`,
      );

      if (filters.section) url.searchParams.set('section', filters.section);
      if (filters.query?.trim()) url.searchParams.set('q', filters.query.trim());

      const relativeSlug = url.pathname.split('/').at(-1);
      if (relativeSlug !== HML_FUNCTIONS.catalog) {
        throw new Error('Invalid HML catalog endpoint');
      }

      return request(
        `${HML_FUNCTIONS.catalog}${url.search}`,
      );
    },

    checkout(input) {
      if (
        input.cart.length < 1
        || input.cart.some((line) => !isTestRef(line))
      ) {
        throw new Error('HML checkout accepts only TEST identifiers');
      }

      if (!Number.isInteger(input.totalCents) || input.totalCents <= 0) {
        throw new Error('HML total must be a positive integer');
      }

      const cart = input.cart.map((line) => ({
        kind: line.kind,
        refId: line.refId,
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        promoUnitPriceCents: line.promoUnitPriceCents,
      }));

      return request(HML_FUNCTIONS.checkout, {
        method: 'POST',
        body: JSON.stringify({
          cart,
          payment: input.payment,
          totalCents: input.totalCents,
        }),
      });
    },
  };
}

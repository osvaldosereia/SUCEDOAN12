import type { WhatsAppChannel } from "../../../src/domain/channels.ts";

export type MetaChannel = WhatsAppChannel;

function configured(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value || null;
}

export function metaAccessToken(channel: MetaChannel): string | null {
  return configured(`META_ACCESS_TOKEN_${channel}`) ?? configured("META_WHATSAPP_ACCESS_TOKEN");
}

export function metaGraphVersion(): string | null {
  return configured("META_GRAPH_API_VERSION") ?? configured("META_WHATSAPP_GRAPH_VERSION");
}

export function metaAppSecret(): string | null {
  return configured("META_APP_SECRET") ?? configured("META_WHATSAPP_APP_SECRET");
}

export function flowPrivateKey(channel: MetaChannel): string | null {
  return configured(`META_FLOW_PRIVATE_KEY_${channel}`)
    ?? configured(`DA_FLOW_${channel}_RSA_PKCS8`);
}

export function flowEndpointUri(): string | null {
  const configuredEndpoint = configured("WHATSAPP_FLOW_ENDPOINT_URI");
  if (configuredEndpoint) return configuredEndpoint;
  const base = configured("SUPABASE_URL")?.replace(/\/$/, "");
  return base ? `${base}/functions/v1/whatsapp-flow-runtime` : null;
}

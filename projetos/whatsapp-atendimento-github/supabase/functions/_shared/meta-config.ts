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
  const channelKey = configured(`META_FLOW_PRIVATE_KEY_${channel}`)
    ?? configured(`DA_FLOW_${channel}_RSA_PKCS8`);
  if (channelKey || channel !== "0975") return channelKey;

  // The Graph API stores the public key against a phone number ID. Reuse the
  // existing pair for the second number when no 0975-specific secret is set;
  // its public key must still be registered separately for that phone number.
  // A channel-specific 0975 key always takes priority.
  return configured("META_FLOW_PRIVATE_KEY_1018")
    ?? configured("DA_FLOW_1018_RSA_PKCS8");
}

export function flowEndpointUri(): string | null {
  const configuredEndpoint = configured("WHATSAPP_FLOW_ENDPOINT_URI");
  if (configuredEndpoint) return configuredEndpoint;
  const base = configured("SUPABASE_URL")?.replace(/\/$/, "");
  return base ? `${base}/functions/v1/whatsapp-flow-runtime` : null;
}

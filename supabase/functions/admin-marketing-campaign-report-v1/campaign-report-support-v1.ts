const RESPONSE_WINDOW_HOURS = 48;
const RESPONSE_WINDOW_MS = RESPONSE_WINDOW_HOURS * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const CUSTOMER_CHUNK_SIZE = 100;
const SENT_STATUSES = new Set(["sent", "delivered", "read"]);

export type CampaignDispatch = {
  customer_id: string | null;
  status: string;
  provider_message_id: string | null;
};

export type MessageRecord = {
  id: string;
  status_current: string;
  created_at: string;
  sent_at: string | null;
};

export type StatusEvent = {
  status: string;
  occurred_at: string;
};

type ResponseSummary = {
  responses: number;
  response_rate: number;
  response_window_hours: number;
  response_measurement_available: boolean;
};

export function verifyAdminCode(supplied: string | null) {
  const expected = (Deno.env.get("DONA_ADMIN_CODE") || "").trim();
  if (expected.length < 13 || expected.length > 128) return "not_configured";
  if (typeof supplied !== "string" || supplied.length !== expected.length) return "invalid";

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return mismatch === 0 ? "valid" : "invalid";
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function hasSentStatus(dispatch: CampaignDispatch, message: MessageRecord | undefined, events: StatusEvent[]) {
  const statuses = [
    normalizeStatus(dispatch.status),
    normalizeStatus(message?.status_current),
    ...events.map((event) => normalizeStatus(event.status)),
  ];
  return statuses.some((status) => SENT_STATUSES.has(status));
}

function sentAt(message: MessageRecord | undefined, events: StatusEvent[]) {
  if (message?.sent_at) {
    const timestamp = Date.parse(message.sent_at);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const eventTimes = events
    .filter((event) => SENT_STATUSES.has(normalizeStatus(event.status)))
    .map((event) => Date.parse(event.occurred_at))
    .filter(Number.isFinite);
  if (eventTimes.length) return Math.min(...eventTimes);

  return null;
}

async function inboundMessages(
  db: any,
  accountId: string,
  customerIds: string[],
  from: string,
  to: string,
) {
  const rows: Array<{ customer_id: string | null; received_at: string | null; created_at: string }> = [];
  for (const customerChunk of chunks(customerIds, CUSTOMER_CHUNK_SIZE)) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await db.from("whatsapp_messages_v1")
        .select("customer_id,received_at,created_at")
        .eq("whatsapp_account_id", accountId)
        .eq("provider", "meta")
        .eq("direction", "inbound")
        .in("customer_id", customerChunk)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) throw result.error;
      const page = result.data || [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

export async function buildCampaignResponseSummary(
  db: any,
  accountId: string,
  dispatches: CampaignDispatch[],
  messages: Map<string, MessageRecord>,
  events: Map<string, StatusEvent[]>,
): Promise<ResponseSummary> {
  const sentTimesByCustomer = new Map<string, number[]>();
  let incompleteSentTime = false;
  for (const dispatch of dispatches) {
    const providerId = String(dispatch.provider_message_id || "");
    const message = messages.get(providerId);
    const statusEvents = message ? events.get(message.id) || [] : [];
    if (!hasSentStatus(dispatch, message, statusEvents)) continue;

    const customerId = String(dispatch.customer_id || "");
    const timestamp = sentAt(message, statusEvents);
    if (!customerId || timestamp === null) {
      incompleteSentTime = true;
      continue;
    }

    const customerTimes = sentTimesByCustomer.get(customerId) || [];
    customerTimes.push(timestamp);
    sentTimesByCustomer.set(customerId, customerTimes);
  }

  if (!accountId || sentTimesByCustomer.size === 0 || incompleteSentTime) {
    return {
      responses: 0,
      response_rate: 0,
      response_window_hours: RESPONSE_WINDOW_HOURS,
      response_measurement_available: false,
    };
  }

  const timestamps = [...sentTimesByCustomer.values()].flat();
  const from = new Date(Math.min(...timestamps)).toISOString();
  const to = new Date(Math.max(...timestamps) + RESPONSE_WINDOW_MS).toISOString();
  const inbound = await inboundMessages(db, accountId, [...sentTimesByCustomer.keys()], from, to);
  const responded = new Set<string>();

  for (const message of inbound) {
    const customerId = String(message.customer_id || "");
    const sentTimestamps = sentTimesByCustomer.get(customerId);
    if (!sentTimestamps?.length) continue;

    const receivedTimestamp = Date.parse(String(message.received_at || message.created_at || ""));
    if (!Number.isFinite(receivedTimestamp)) continue;
    if (sentTimestamps.some((sentTimestamp) => receivedTimestamp >= sentTimestamp && receivedTimestamp <= sentTimestamp + RESPONSE_WINDOW_MS)) {
      responded.add(customerId);
    }
  }

  return {
    responses: responded.size,
    response_rate: sentTimesByCustomer.size ? Number(((responded.size / sentTimesByCustomer.size) * 100).toFixed(1)) : 0,
    response_window_hours: RESPONSE_WINDOW_HOURS,
    response_measurement_available: true,
  };
}
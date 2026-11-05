"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;

export type AdminIdentityReviewState = "pending" | "acknowledged";

export type AdminIdentityReview = {
	eventId: string;
	accountId: string;
	accountName: string;
	accountPhone: string;
	receivedAt: string;
	senderProviderId: string | null;
	messageType: string;
	intakeKind: "catalog_order" | "flow_submission" | "confirmation_reply" | null;
	textPreview: string | null;
	state: AdminIdentityReviewState;
	reviewedAt: string | null;
};

export type AdminIdentityReviewsResult = {
	items: AdminIdentityReview[];
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| "invalid_response"
		| null;
};

export type AdminIdentityReviewAckResult = {
	ok: boolean;
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| "invalid_response"
		| null;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_TYPES = new Set([
	"text",
	"unknown",
	"interactive",
	"image",
	"audio",
	"video",
	"document",
	"sticker",
	"location",
	"contacts",
	"button",
	"template",
	"reaction",
	"unsupported",
]);
const INTAKE_KINDS = new Set([
	"catalog_order",
	"flow_submission",
	"confirmation_reply",
]);

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function boundedText(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized && normalized.length <= maxLength ? normalized : null;
}

function timestamp(value: unknown): string | null {
	const normalized = boundedText(value, 64);
	return normalized && !Number.isNaN(Date.parse(normalized))
		? normalized
		: null;
}

function parseReview(value: unknown): AdminIdentityReview | null {
	const row = record(value);
	if (!row) return null;

	const eventId = boundedText(row.event_id, 36);
	const accountId = boundedText(row.whatsapp_account_id, 36);
	const accountName = boundedText(row.account_name, 120);
	const accountPhone = boundedText(row.account_phone, 40);
	const receivedAt = timestamp(row.received_at);
	const state = row.state;
	const messageType = boundedText(row.message_type, 32);
	const senderProviderId =
		row.sender_provider_id == null
			? null
			: boundedText(row.sender_provider_id, 256);
	const rawIntakeKind = row.intake_kind;
	const intakeKind =
		typeof rawIntakeKind === "string" && INTAKE_KINDS.has(rawIntakeKind)
			? (rawIntakeKind as AdminIdentityReview["intakeKind"])
			: null;
	const textPreview =
		row.text_preview == null ? null : boundedText(row.text_preview, 280);
	const reviewedAt =
		row.reviewed_at == null ? null : timestamp(row.reviewed_at);

	if (
		!eventId ||
		!UUID_PATTERN.test(eventId) ||
		!accountId ||
		!UUID_PATTERN.test(accountId) ||
		!accountName ||
		!accountPhone ||
		!/^\+[1-9]\d{7,14}$/.test(accountPhone) ||
		!receivedAt ||
		!messageType ||
		!MESSAGE_TYPES.has(messageType) ||
		(state !== "pending" && state !== "acknowledged") ||
		(row.sender_provider_id != null && senderProviderId === null) ||
		(row.text_preview != null && textPreview === null) ||
		(row.reviewed_at != null && reviewedAt === null) ||
		(state === "acknowledged" && reviewedAt === null) ||
		(state === "pending" && reviewedAt !== null)
	) {
		return null;
	}

	return {
		eventId: eventId.toLowerCase(),
		accountId: accountId.toLowerCase(),
		accountName,
		accountPhone,
		receivedAt,
		senderProviderId,
		messageType,
		intakeKind,
		textPreview,
		state,
		reviewedAt,
	};
}

function emptyResult(
	error: NonNullable<AdminIdentityReviewsResult["error"]>,
): AdminIdentityReviewsResult {
	return { items: [], error };
}

async function authenticatedClient(): Promise<
	| { ok: true; client: Awaited<ReturnType<typeof createClient>> }
	| {
			ok: false;
			error: "not_configured" | "not_authenticated";
	  }
> {
	if (!supabaseUrl || !supabasePublishableKey)
		return { ok: false, error: "not_configured" };

	let client: Awaited<ReturnType<typeof createClient>>;
	try {
		client = await createClient();
	} catch {
		return { ok: false, error: "not_configured" };
	}
	const { data, error } = await client.auth.getClaims();
	if (error || !data?.claims?.sub)
		return { ok: false, error: "not_authenticated" };
	return { ok: true, client };
}

export async function getAdminIdentityReviews(
	state: AdminIdentityReviewState,
): Promise<AdminIdentityReviewsResult> {
	const auth = await authenticatedClient();
	if (!auth.ok) return emptyResult(auth.error);

	const { data, error } = await auth.client.rpc(
		"whatsapp_identity_reviews_admin_list_v1",
		{ p_state: state, p_limit: 50 },
	);
	if (error) {
		return emptyResult(
			error.code === "42501" || error.code === "PGRST301"
				? "not_authorized"
				: "unavailable",
		);
	}

	const payload = record(data);
	if (
		payload?.ok !== true ||
		payload.state !== state ||
		!Array.isArray(payload.items) ||
		payload.items.length > 50
	) {
		return emptyResult(
			payload?.error === "admin_not_authorized"
				? "not_authorized"
				: "invalid_response",
		);
	}

	const items = payload.items
		.map(parseReview)
		.filter((item): item is AdminIdentityReview => item !== null);
	if (items.length !== payload.items.length)
		return emptyResult("invalid_response");
	return { items, error: null };
}

export async function acknowledgeAdminIdentityReview(
	eventId: string,
): Promise<AdminIdentityReviewAckResult> {
	if (!UUID_PATTERN.test(eventId))
		return { ok: false, error: "invalid_response" };
	const auth = await authenticatedClient();
	if (!auth.ok) return { ok: false, error: auth.error };

	const { data, error } = await auth.client.rpc(
		"whatsapp_identity_review_ack_v1",
		{ p_event_id: eventId.toLowerCase() },
	);
	if (error) {
		return {
			ok: false,
			error:
				error.code === "42501" || error.code === "PGRST301"
					? "not_authorized"
					: "unavailable",
		};
	}

	const payload = record(data);
	return payload?.ok === true && payload.event_id === eventId.toLowerCase()
		? { ok: true, error: null }
		: {
				ok: false,
				error:
					payload?.error === "admin_not_authorized"
						? "not_authorized"
						: "unavailable",
			};
}

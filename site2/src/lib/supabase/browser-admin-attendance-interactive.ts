"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export type AttendanceInteractiveInput = {
	conversationId: string;
	idempotencyKey: string;
	kind: "button" | "list";
	body: string;
	header?: string;
	footer?: string;
	buttonTitles?: string[];
	listButton?: string;
	options?: Array<{ title: string; description?: string }>;
};

export type AttendanceInteractiveResult =
	| { ok: true; outboxId: string; status: "sent"; duplicate: boolean }
	| { ok: false; error: string; outboxId?: string };

type JsonRecord = Record<string, unknown>;

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ERRORS = new Set([
	"admin_not_authorized",
	"conversation_required",
	"conversation_channel_unavailable",
	"conversation_phone_invalid",
	"destination_mismatch",
	"service_window_closed",
	"human_send_not_homologated",
	"meta_canary_destination_blocked",
	"meta_send_uncertain",
	"rate_limited",
	"idempotency_conflict",
	"outbox_not_queued",
	"outbox_claim_race",
	"interactive_invalid",
	"interactive_too_large",
	"interactive_body_invalid",
	"interactive_buttons_invalid",
	"interactive_list_invalid",
	"interactive_header_invalid",
	"interactive_footer_invalid",
	"interactive_type_unsupported",
	"meta_transport_not_configured",
	"not_authenticated",
	"not_authorized",
	"invalid_request",
	"unavailable",
]);

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, limit = 80): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized ? normalized.slice(0, limit) : null;
}

function errorCode(value: unknown): string {
	return typeof value === "string" && SAFE_ERRORS.has(value)
		? value
		: "unavailable";
}

export async function sendAdminAttendanceInteractive(
	input: AttendanceInteractiveInput,
): Promise<AttendanceInteractiveResult> {
	if (
		!UUID_PATTERN.test(input.conversationId) ||
		!UUID_PATTERN.test(input.idempotencyKey)
	) {
		return { ok: false, error: "interactive_invalid" };
	}
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	const accessToken = sessionData.session?.access_token;
	if (sessionError || !accessToken)
		return { ok: false, error: "not_authenticated" };

	let response: Response;
	try {
		const endpoint = new URL(
			"/functions/v1/admin-whatsapp-interactive-send-v1",
			supabaseUrl,
		);
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(input),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "meta_send_uncertain" };
	}

	let payload: JsonRecord | null;
	try {
		const raw: unknown = await response.json();
		payload = isRecord(raw) ? raw : null;
	} catch {
		payload = null;
	}
	if (!payload) return { ok: false, error: "invalid_response" };
	const outboxId = safeText(payload.outbox_id, 64);
	if (payload.ok === true && outboxId && UUID_PATTERN.test(outboxId)) {
		return {
			ok: true,
			outboxId,
			status: "sent",
			duplicate: payload.duplicate === true,
		};
	}
	const error = errorCode(payload.error);
	return {
		ok: false,
		error:
			outboxId &&
			!response.ok &&
			response.status >= 500 &&
			error === "unavailable"
				? "meta_send_uncertain"
				: error,
		...(outboxId && UUID_PATTERN.test(outboxId) ? { outboxId } : {}),
	};
}

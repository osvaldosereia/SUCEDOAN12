"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;

export type AdminFlowSendAttempt = {
	id: string;
	basketName: string;
	status: "preparing" | "sending" | "sent" | "failed" | "needs_review";
	errorCode: string | null;
	createdAt: string | null;
};

export type AdminFlowSendAttemptsResult = {
	items: AdminFlowSendAttempt[];
	readyForSend: boolean;
	blockReason: string | null;
	error: string | null;
};

export type AdminFlowSendResult =
	| {
			ok: true;
			attemptId: string;
			status: AdminFlowSendAttempt["status"];
			issueCode: string | null;
	  }
	| { ok: false; error: string };

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<AdminFlowSendAttempt["status"]>([
	"preparing",
	"sending",
	"sent",
	"failed",
	"needs_review",
]);

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function text(value: unknown, limit = 160): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, limit) : null;
}

async function requestFlowFunction<T>(input: {
	method: "GET" | "POST";
	conversationId?: string;
	body?: JsonRecord;
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	const endpoint = new URL(
		"/functions/v1/whatsapp-order-flow-send-v1",
		supabaseUrl,
	);
	if (input.method === "GET" && input.conversationId) {
		endpoint.searchParams.set("conversation_id", input.conversationId);
	}
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: input.method,
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				...(input.method === "POST"
					? { "Content-Type": "application/json" }
					: {}),
			},
			...(input.method === "POST"
				? { body: JSON.stringify(input.body ?? {}) }
				: {}),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}
	let payload: JsonRecord | null;
	try {
		payload = record(await response.json());
	} catch {
		return { ok: false, error: "invalid_response" };
	}
	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (!response.ok || payload?.ok !== true) {
		return {
			ok: false,
			error: text(payload?.error, 80) ?? "unavailable",
		};
	}
	return { ok: true, data: payload as T };
}

export async function sendAdminBasketFlow(input: {
	conversationId: string;
	basketTemplateId: string;
	idempotencyKey: string;
}): Promise<AdminFlowSendResult> {
	if (
		!UUID_PATTERN.test(input.conversationId) ||
		!UUID_PATTERN.test(input.basketTemplateId) ||
		!UUID_PATTERN.test(input.idempotencyKey)
	) {
		return { ok: false, error: "flow_send_request_invalid" };
	}
	const result = await requestFlowFunction<JsonRecord>({
		method: "POST",
		body: {
			conversationId: input.conversationId,
			basketTemplateId: input.basketTemplateId,
			idempotencyKey: input.idempotencyKey,
		},
	});
	if (!result.ok) return result;
	const attemptId = text(result.data.attempt_id, 64);
	const status = text(result.data.status, 40) as
		| AdminFlowSendAttempt["status"]
		| null;
	if (
		!attemptId ||
		!UUID_PATTERN.test(attemptId) ||
		!status ||
		!STATUSES.has(status)
	) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		attemptId,
		status,
		issueCode: text(result.data.issue_code, 80),
	};
}

export async function getAdminFlowSendAttempts(
	conversationId: string,
): Promise<AdminFlowSendAttemptsResult> {
	if (!UUID_PATTERN.test(conversationId)) {
		return {
			items: [],
			readyForSend: false,
			blockReason: "conversation_id_invalid",
			error: "conversation_id_invalid",
		};
	}
	const result = await requestFlowFunction<{
		items?: unknown[];
		ready_for_send?: unknown;
		block_reason?: unknown;
	}>({
		method: "GET",
		conversationId,
	});
	if (!result.ok) {
		return {
			items: [],
			readyForSend: false,
			blockReason: null,
			error: result.error,
		};
	}
	if (!Array.isArray(result.data.items)) {
		return {
			items: [],
			readyForSend: false,
			blockReason: null,
			error: "invalid_response",
		};
	}
	const items = result.data.items
		.map((value): AdminFlowSendAttempt | null => {
			const row = record(value);
			const id = text(row?.id, 64);
			const status = text(row?.status, 40) as
				| AdminFlowSendAttempt["status"]
				| null;
			if (!id || !UUID_PATTERN.test(id) || !status || !STATUSES.has(status)) {
				return null;
			}
			return {
				id,
				basketName: text(row?.basket_name, 120) ?? "Cesta básica",
				status,
				errorCode: text(row?.error_code, 80),
				createdAt: text(row?.created_at, 60),
			};
		})
		.filter((item): item is AdminFlowSendAttempt => item !== null);
	return {
		items,
		readyForSend: result.data.ready_for_send === true,
		blockReason: text(result.data.block_reason, 80),
		error: null,
	};
}

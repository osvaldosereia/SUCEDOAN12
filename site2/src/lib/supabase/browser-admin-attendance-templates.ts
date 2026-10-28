"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export type AttendanceTemplate = {
	id: string;
	name: string;
	language: string;
	category: string;
	body: string;
	parameterCount: number;
};

export type AttendanceTemplateError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "unavailable"
	| "invalid_account_id"
	| "meta_template_send_uncertain"
	| "meta_send_uncertain"
	| "template_not_sendable"
	| "template_parameter_count_mismatch"
	| "template_parameter_invalid"
	| "template_parameters_invalid"
	| "template_dynamic_component_unsupported"
	| "meta_template_send_not_homologated"
	| "meta_canary_destination_blocked"
	| "meta_transport_not_configured"
	| "rate_limited"
	| "idempotency_conflict"
	| "invalid_template_id"
	| "invalid_conversation_id"
	| "invalid_idempotency_key";

export type AttendanceTemplateListResult =
	| { ok: true; templates: AttendanceTemplate[] }
	| { ok: false; error: AttendanceTemplateError };

export type AttendanceTemplateSendResult =
	| { ok: true; duplicate: boolean }
	| { ok: false; error: AttendanceTemplateError };

type JsonRecord = Record<string, unknown>;

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ERRORS = new Set<AttendanceTemplateError>([
	"not_configured",
	"not_authenticated",
	"not_authorized",
	"unavailable",
	"invalid_account_id",
	"meta_send_uncertain",
	"template_not_sendable",
	"template_parameter_count_mismatch",
	"template_parameter_invalid",
	"template_parameters_invalid",
	"template_dynamic_component_unsupported",
	"meta_template_send_not_homologated",
	"meta_canary_destination_blocked",
	"meta_transport_not_configured",
	"rate_limited",
	"idempotency_conflict",
	"invalid_template_id",
	"invalid_conversation_id",
	"invalid_idempotency_key",
]);

function record(value: unknown): JsonRecord | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function cleanText(value: unknown, limit: number): string | null {
	if (typeof value !== "string") return null;
	const text = stripControls(value).trim();
	return text ? text.slice(0, limit) : null;
}

function stripControls(value: string, preserveLineBreaks = false): string {
	return Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		if (preserveLineBreaks && code === 10) return "\n";
		return code < 32 || code === 127 ? " " : character;
	}).join("");
}

function safeError(value: unknown): AttendanceTemplateError {
	if (value === "admin_auth_required" || value === "admin_session_invalid")
		return "not_authenticated";
	if (value === "admin_not_authorized") return "not_authorized";
	return typeof value === "string" &&
		SAFE_ERRORS.has(value as AttendanceTemplateError)
		? (value as AttendanceTemplateError)
		: "unavailable";
}

function bodyParameterCount(body: string): number | null {
	let maximum = 0;
	for (const match of body.matchAll(/\{\{([0-9]+)\}\}/g)) {
		const index = Number(match[1]);
		if (
			!Number.isSafeInteger(index) ||
			index < 1 ||
			String(index) !== match[1]
		) {
			return null;
		}
		if (index > maximum) maximum = index;
	}
	return maximum;
}

function normalizeTemplate(value: unknown): AttendanceTemplate | null {
	const row = record(value);
	if (
		!row ||
		!UUID_PATTERN.test(String(row.id ?? "")) ||
		String(row.status ?? "").toUpperCase() !== "APPROVED" ||
		row.sendable !== true
	) {
		return null;
	}
	const attendance = record(row.attendance);
	if (attendance?.enabled !== true) return null;

	const components = Array.isArray(row.components)
		? row.components
				.map(record)
				.filter((item): item is JsonRecord => item !== null)
		: [];
	const bodyComponent = components.find(
		(component) => String(component.type ?? "").toUpperCase() === "BODY",
	);
	const body =
		typeof bodyComponent?.text === "string"
			? stripControls(
					bodyComponent.text.replaceAll("\r\n", "\n").replaceAll("\r", "\n"),
					true,
				)
					.trim()
					.slice(0, 1024)
			: "";
	const category = cleanText(row.category, 32) ?? "UTILITY";
	const hasUnsupportedComponent = components.some((component) => {
		const type = String(component.type ?? "").toUpperCase();
		const format = String(component.format ?? "").toUpperCase();
		if (!["BODY", "HEADER", "FOOTER", "BUTTONS"].includes(type)) return true;
		if (type === "HEADER" && format && format !== "TEXT") return true;
		return type !== "BODY" && JSON.stringify(component).includes("{{");
	});
	const parameterCount = bodyParameterCount(body);
	if (
		hasUnsupportedComponent ||
		!body ||
		parameterCount === null ||
		category.toUpperCase() !== "UTILITY"
	) {
		return null;
	}

	const id = cleanText(row.id, 36);
	const name = cleanText(row.name, 120);
	const language = cleanText(row.language, 32);
	if (!id || !name || !language) return null;

	return {
		id,
		name,
		language,
		category,
		body,
		parameterCount,
	};
}

async function authorizedHeaders(): Promise<
	| { ok: true; headers: HeadersInit }
	| { ok: false; error: AttendanceTemplateError }
> {
	if (!supabaseUrl || !supabasePublishableKey)
		return { ok: false, error: "not_configured" };
	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };
	return {
		ok: true,
		headers: {
			apikey: supabasePublishableKey,
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
	};
}

async function parseJson(response: Response): Promise<JsonRecord | null> {
	try {
		return record(await response.json());
	} catch {
		return null;
	}
}

export async function listAdminAttendanceTemplates(
	accountId: string,
): Promise<AttendanceTemplateListResult> {
	if (!UUID_PATTERN.test(accountId)) return { ok: false, error: "unavailable" };
	const auth = await authorizedHeaders();
	if (!auth.ok) return auth;

	try {
		const endpoint = new URL(
			"/functions/v1/admin-whatsapp-templates-v1",
			supabaseUrl,
		);
		endpoint.searchParams.set("action", "list");
		endpoint.searchParams.set("account_id", accountId);
		const response = await fetch(endpoint, {
			method: "GET",
			headers: auth.headers,
			cache: "no-store",
		});
		const payload = await parseJson(response);
		if (payload?.ok !== true || !Array.isArray(payload?.items)) {
			return { ok: false, error: safeError(payload?.error) };
		}
		return {
			ok: true,
			templates: payload.items
				.map(normalizeTemplate)
				.filter((item): item is AttendanceTemplate => item !== null),
		};
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

export async function sendAdminAttendanceTemplate(input: {
	conversationId: string;
	templateId: string;
	parameters: string[];
	idempotencyKey: string;
}): Promise<AttendanceTemplateSendResult> {
	if (!UUID_PATTERN.test(input.conversationId))
		return { ok: false, error: "invalid_conversation_id" };
	if (!UUID_PATTERN.test(input.templateId))
		return { ok: false, error: "invalid_template_id" };
	if (!UUID_PATTERN.test(input.idempotencyKey))
		return { ok: false, error: "invalid_idempotency_key" };
	if (
		input.parameters.length > 100 ||
		input.parameters.some(
			(value) =>
				typeof value !== "string" || !value.trim() || value.length > 1024,
		)
	) {
		return { ok: false, error: "template_parameter_invalid" };
	}

	const auth = await authorizedHeaders();
	if (!auth.ok) return auth;

	try {
		const endpoint = new URL(
			"/functions/v1/admin-whatsapp-templates-v1?action=send",
			supabaseUrl,
		);
		const response = await fetch(endpoint, {
			method: "POST",
			headers: auth.headers,
			body: JSON.stringify({
				conversation_id: input.conversationId,
				template_id: input.templateId,
				parameters: input.parameters,
				idempotency_key: input.idempotencyKey,
			}),
			cache: "no-store",
		});
		const payload = await parseJson(response);
		if (payload?.ok === true) {
			return { ok: true, duplicate: payload.duplicate === true };
		}
		if (!payload) return { ok: false, error: "meta_send_uncertain" };
		const error = safeError(payload.error);
		return {
			ok: false,
			error:
				response.status >= 500 && error === "unavailable"
					? "meta_send_uncertain"
					: error,
		};
	} catch {
		return { ok: false, error: "meta_send_uncertain" };
	}
}

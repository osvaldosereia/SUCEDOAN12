"use client";

import {
	type AttendanceTemplateListResult,
	type AttendanceTemplateSendResult,
	listAdminAttendanceTemplates,
	sendAdminAttendanceTemplate,
} from "@/lib/supabase/browser-admin-attendance-templates";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export async function listAttendanceTemplates(
	value: unknown,
): Promise<AttendanceTemplateListResult> {
	const accountId = record(value)?.accountId;
	if (typeof accountId !== "string" || !UUID_PATTERN.test(accountId)) {
		return { ok: false, error: "unavailable" };
	}
	return listAdminAttendanceTemplates(accountId);
}

export async function sendAttendanceTemplate(
	value: unknown,
): Promise<AttendanceTemplateSendResult> {
	const input = record(value);
	if (!input || typeof input.accountId !== "string") {
		return { ok: false, error: "invalid_account_id" };
	}
	if (!UUID_PATTERN.test(input.accountId)) {
		return { ok: false, error: "invalid_account_id" };
	}
	if (
		typeof input.conversationId !== "string" ||
		!UUID_PATTERN.test(input.conversationId)
	) {
		return { ok: false, error: "invalid_conversation_id" };
	}
	if (
		typeof input.templateId !== "string" ||
		!UUID_PATTERN.test(input.templateId)
	) {
		return { ok: false, error: "invalid_template_id" };
	}
	if (
		typeof input.idempotencyKey !== "string" ||
		!UUID_PATTERN.test(input.idempotencyKey)
	) {
		return { ok: false, error: "invalid_idempotency_key" };
	}
	if (
		!Array.isArray(input.parameters) ||
		input.parameters.length > 100 ||
		input.parameters.some(
			(parameter) =>
				typeof parameter !== "string" ||
				!parameter.trim() ||
				parameter.length > 1024,
		)
	) {
		return { ok: false, error: "template_parameter_invalid" };
	}
	const available = await listAdminAttendanceTemplates(input.accountId);
	if (!available.ok) return available;
	if (!available.templates.some((item) => item.id === input.templateId)) {
		return { ok: false, error: "template_not_sendable" };
	}
	return sendAdminAttendanceTemplate({
		conversationId: input.conversationId,
		templateId: input.templateId,
		idempotencyKey: input.idempotencyKey,
		parameters: input.parameters.map((parameter) => parameter.trim()),
	});
}

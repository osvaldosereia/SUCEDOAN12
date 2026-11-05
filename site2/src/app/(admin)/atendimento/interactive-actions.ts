"use client";

import {
	type AttendanceInteractiveInput,
	type AttendanceInteractiveResult,
	sendAdminAttendanceInteractive,
} from "@/lib/supabase/browser-admin-attendance-interactive";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized && normalized.length <= max ? normalized : null;
}

function normalize(value: unknown): AttendanceInteractiveInput | null {
	if (
		!isRecord(value) ||
		!UUID_PATTERN.test(String(value.conversationId ?? "")) ||
		!UUID_PATTERN.test(String(value.idempotencyKey ?? "")) ||
		(value.kind !== "button" && value.kind !== "list")
	) {
		return null;
	}
	const body = text(value.body, 1024);
	const header =
		value.header === undefined ? undefined : text(value.header, 60);
	const footer =
		value.footer === undefined ? undefined : text(value.footer, 60);
	if (
		!body ||
		(value.header !== undefined && !header) ||
		(value.footer !== undefined && !footer)
	) {
		return null;
	}
	const common = {
		conversationId: String(value.conversationId),
		idempotencyKey: String(value.idempotencyKey),
		kind: value.kind,
		body,
		...(header ? { header } : {}),
		...(footer ? { footer } : {}),
	};
	if (value.kind === "button") {
		if (
			!Array.isArray(value.buttonTitles) ||
			value.buttonTitles.length < 1 ||
			value.buttonTitles.length > 3
		) {
			return null;
		}
		const buttonTitles = value.buttonTitles.map((item) => text(item, 20));
		if (buttonTitles.some((item) => item === null)) return null;
		return {
			...common,
			kind: "button",
			buttonTitles: buttonTitles as string[],
		};
	}
	if (
		!Array.isArray(value.options) ||
		value.options.length < 1 ||
		value.options.length > 10
	) {
		return null;
	}
	const listButton = text(value.listButton, 20);
	const options = value.options.map((option) => {
		if (!isRecord(option)) return null;
		const title = text(option.title, 24);
		const description =
			option.description === undefined
				? undefined
				: text(option.description, 72);
		if (!title || (option.description !== undefined && !description))
			return null;
		return { title, ...(description ? { description } : {}) };
	});
	if (!listButton || options.some((item) => item === null)) return null;
	return {
		...common,
		kind: "list",
		listButton,
		options: options as Array<{ title: string; description?: string }>,
	};
}

export async function sendAttendanceInteractive(
	value: unknown,
): Promise<AttendanceInteractiveResult> {
	const input = normalize(value);
	if (!input) return { ok: false, error: "interactive_invalid" };
	return sendAdminAttendanceInteractive(input);
}

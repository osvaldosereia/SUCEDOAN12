"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BrowserQuickReply = {
	id: string;
	title: string;
	content: string;
	isFavorite: boolean;
	sortOrder: number;
	isActive: boolean;
};

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parseItem(value: unknown): BrowserQuickReply | null {
	const row = record(value);
	if (
		!row ||
		typeof row.id !== "string" ||
		!UUID.test(row.id) ||
		typeof row.title !== "string" ||
		!row.title.trim() ||
		typeof row.content !== "string" ||
		!row.content.trim()
	)
		return null;
	return {
		id: row.id,
		title: row.title.slice(0, 80),
		content: row.content.slice(0, 4000),
		isFavorite: row.is_favorite === true,
		sortOrder:
			typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
				? Math.trunc(row.sort_order)
				: 0,
		isActive: row.is_active === true,
	};
}

async function call<T>(
	action: string,
	method: "GET" | "POST" = "GET",
	params: Record<string, string> = {},
	body?: Record<string, unknown>,
): Promise<CallResult<T>> {
	if (!supabaseUrl || !supabasePublishableKey)
		return { ok: false, error: "not_configured" };
	try {
		const client = createClient();
		const { data, error } = await client.auth.getSession();
		const token = data.session?.access_token;
		if (error || !token) return { ok: false, error: "not_authenticated" };
		const endpoint = new URL(
			"/functions/v1/admin-whatsapp-ops-v1",
			supabaseUrl,
		);
		endpoint.searchParams.set("action", action);
		for (const [key, value] of Object.entries(params))
			endpoint.searchParams.set(key, value);
		const response = await fetch(endpoint, {
			method,
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
				...(method === "POST" ? { "Content-Type": "application/json" } : {}),
			},
			...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
			cache: "no-store",
		});
		const payload = record(await response.json());
		if (!payload) return { ok: false, error: "invalid_response" };
		if (!response.ok || payload.ok === false) {
			const code =
				typeof payload.error === "string" ? payload.error : "unavailable";
			return {
				ok: false,
				error:
					response.status === 401 || response.status === 403
						? "not_authorized"
						: code,
			};
		}
		return { ok: true, data: payload as T };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

export async function loadBrowserQuickReplies(): Promise<
	CallResult<BrowserQuickReply[]>
> {
	const result = await call<{ items?: unknown[] }>("quick_replies", "GET", {
		include_inactive: "1",
	});
	if (!result.ok) return result;
	if (!Array.isArray(result.data.items))
		return { ok: false, error: "invalid_response" };
	return {
		ok: true,
		data: result.data.items
			.map(parseItem)
			.filter((item): item is BrowserQuickReply => item !== null)
			.sort(
				(left, right) =>
					Number(right.isActive) - Number(left.isActive) ||
					Number(right.isFavorite) - Number(left.isFavorite) ||
					left.sortOrder - right.sortOrder,
			),
	};
}

export async function saveBrowserQuickReply(input: {
	id: string | null;
	title: string;
	content: string;
	isFavorite: boolean;
	sortOrder: number;
}): Promise<CallResult<BrowserQuickReply>> {
	const title = input.title.trim().slice(0, 80);
	const content = input.content.trim().slice(0, 4000);
	if (input.id && !UUID.test(input.id))
		return { ok: false, error: "invalid_quick_reply_id" };
	if (!title) return { ok: false, error: "quick_reply_title_required" };
	if (!content) return { ok: false, error: "quick_reply_content_required" };
	if (
		!Number.isInteger(input.sortOrder) ||
		input.sortOrder < -9999 ||
		input.sortOrder > 9999
	)
		return { ok: false, error: "invalid_quick_reply_order" };
	const result = await call<{ item?: unknown }>(
		"quick_reply_save",
		"POST",
		{},
		{
			...(input.id ? { id: input.id } : {}),
			title,
			content,
			is_favorite: input.isFavorite,
			sort_order: input.sortOrder,
		},
	);
	if (!result.ok) return result;
	const item = parseItem(result.data.item);
	return item
		? { ok: true, data: item }
		: { ok: false, error: "invalid_response" };
}

export async function pauseBrowserQuickReply(
	id: string,
): Promise<CallResult<null>> {
	if (!UUID.test(id)) return { ok: false, error: "invalid_quick_reply_id" };
	const result = await call<Record<string, unknown>>(
		"quick_reply_deactivate",
		"POST",
		{},
		{ id },
	);
	return result.ok ? { ok: true, data: null } : result;
}

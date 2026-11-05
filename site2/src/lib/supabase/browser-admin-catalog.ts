"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BrowserCatalogAccount = {
	id: string;
	slug: string;
	name: string;
	phone: string | null;
};

export type BrowserCatalogMapping = {
	id: string;
	accountId: string;
	accountName: string;
	accountPhone: string | null;
	catalogId: string;
	retailerId: string;
	productId: string;
	productName: string;
	productSku: string | null;
	status: "active" | "inactive" | "needs_review";
	verifiedAt: string | null;
	updatedAt: string;
	productEligible: boolean;
};

export type BrowserCatalogProduct = {
	id: string;
	name: string;
	sku: string | null;
};

export type BrowserCatalogData = {
	accounts: BrowserCatalogAccount[];
	items: BrowserCatalogMapping[];
	error: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function cleanText(value: unknown, maximum: number): string | null {
	if (typeof value !== "string") return null;
	const clean = value
		.replace(/[\p{Cc}\p{Cf}]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
	return clean ? clean.slice(0, maximum) : null;
}

function hasControlCharacters(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

function toAccount(value: unknown): BrowserCatalogAccount | null {
	const row = record(value);
	if (
		!row ||
		typeof row.id !== "string" ||
		!UUID.test(row.id) ||
		typeof row.slug !== "string" ||
		typeof row.name !== "string"
	)
		return null;
	return {
		id: row.id,
		slug: cleanText(row.slug, 80) ?? "",
		name: cleanText(row.name, 120) ?? "Número WhatsApp",
		phone: cleanText(row.phone_e164, 40),
	};
}

function toMapping(value: unknown): BrowserCatalogMapping | null {
	const row = record(value);
	if (
		!row ||
		typeof row.id !== "string" ||
		!UUID.test(row.id) ||
		typeof row.whatsapp_account_id !== "string" ||
		!UUID.test(row.whatsapp_account_id) ||
		typeof row.product_id !== "string" ||
		!UUID.test(row.product_id) ||
		typeof row.account_name !== "string" ||
		typeof row.catalog_id !== "string" ||
		typeof row.product_retailer_id !== "string" ||
		typeof row.product_name !== "string" ||
		(row.status !== "active" &&
			row.status !== "inactive" &&
			row.status !== "needs_review") ||
		typeof row.updated_at !== "string"
	)
		return null;
	return {
		id: row.id,
		accountId: row.whatsapp_account_id,
		accountName: cleanText(row.account_name, 120) ?? "Número WhatsApp",
		accountPhone: cleanText(row.account_phone, 40),
		catalogId: cleanText(row.catalog_id, 256) ?? "",
		retailerId: cleanText(row.product_retailer_id, 256) ?? "",
		productId: row.product_id,
		productName: cleanText(row.product_name, 180) ?? "Produto",
		productSku: cleanText(row.product_sku, 80),
		status: row.status,
		verifiedAt: typeof row.verified_at === "string" ? row.verified_at : null,
		updatedAt: row.updated_at,
		productEligible: row.product_eligible === true,
	};
}

export async function loadBrowserCatalog(input: {
	query: string;
	linkId?: string;
}): Promise<BrowserCatalogData> {
	if (input.linkId && !UUID.test(input.linkId))
		return { accounts: [], items: [], error: "not_found" };
	try {
		const client = createClient();
		const session = await client.auth.getSession();
		if (session.error || !session.data.session)
			return { accounts: [], items: [], error: "not_authenticated" };
		const { data, error } = await client.rpc(
			"meta_catalog_product_links_admin_list_v1",
			{
				p_limit: 100,
				p_query: input.query.trim().slice(0, 100) || null,
				p_link_id: input.linkId ?? null,
			},
		);
		if (error)
			return {
				accounts: [],
				items: [],
				error: error.code === "42501" ? "not_authorized" : "unavailable",
			};
		const payload = record(data);
		if (payload?.ok !== true)
			return {
				accounts: [],
				items: [],
				error:
					record(data)?.error === "admin_not_authorized"
						? "not_authorized"
						: "unavailable",
			};
		const rawAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];
		const rawItems = Array.isArray(payload.items) ? payload.items : [];
		const accounts = rawAccounts.map(toAccount).filter((item) => item !== null);
		const items = rawItems.map(toMapping).filter((item) => item !== null);
		if (
			accounts.length !== rawAccounts.length ||
			items.length !== rawItems.length
		)
			return { accounts: [], items: [], error: "unavailable" };
		return { accounts, items, error: null };
	} catch {
		return { accounts: [], items: [], error: "not_configured" };
	}
}

export async function loadBrowserCatalogProducts(
	query: string,
): Promise<{ items: BrowserCatalogProduct[]; error: string | null }> {
	if (!supabaseUrl || !supabasePublishableKey)
		return { items: [], error: "not_configured" };
	try {
		const client = createClient();
		const session = await client.auth.getSession();
		const token = session.data.session?.access_token;
		if (session.error || !token)
			return { items: [], error: "not_authenticated" };
		const endpoint = new URL(
			"/functions/v1/admin-products-browser-v1",
			supabaseUrl,
		);
		endpoint.searchParams.set("active", "true");
		endpoint.searchParams.set("offset", "0");
		if (query.trim())
			endpoint.searchParams.set("q", query.trim().slice(0, 100));
		const response = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
		if (!response.ok)
			return {
				items: [],
				error: response.status === 403 ? "not_authorized" : "unavailable",
			};
		const payload = record(await response.json());
		if (!payload || !Array.isArray(payload.products))
			return { items: [], error: "unavailable" };
		const items = payload.products
			.map((value) => {
				const row = record(value);
				if (
					!row ||
					typeof row.id !== "string" ||
					!UUID.test(row.id) ||
					typeof row.name !== "string"
				)
					return null;
				return {
					id: row.id,
					name: cleanText(row.name, 180) ?? "Produto",
					sku: cleanText(row.sku, 80),
				};
			})
			.filter((item) => item !== null);
		return { items, error: null };
	} catch {
		return { items: [], error: "unavailable" };
	}
}

export async function saveBrowserCatalogMapping(input: {
	accountId: string;
	catalogId: string;
	retailerId: string;
	productId: string;
	linkId: string | null;
}): Promise<{ ok: boolean; error: string | null }> {
	if (
		!UUID.test(input.accountId) ||
		!UUID.test(input.productId) ||
		(input.linkId !== null && !UUID.test(input.linkId)) ||
		input.catalogId.length < 1 ||
		input.catalogId.length > 256 ||
		input.retailerId.length < 1 ||
		input.retailerId.length > 256 ||
		hasControlCharacters(input.catalogId) ||
		hasControlCharacters(input.retailerId)
	)
		return { ok: false, error: "invalid_input" };
	try {
		const client = createClient();
		const session = await client.auth.getSession();
		if (session.error || !session.data.session)
			return { ok: false, error: "not_authenticated" };
		const { data, error } = await client.rpc(
			"meta_catalog_product_link_admin_save_v1",
			{
				p_whatsapp_account_id: input.accountId,
				p_catalog_id: input.catalogId.trim(),
				p_product_retailer_id: input.retailerId.trim(),
				p_product_id: input.productId,
				p_link_id: input.linkId,
			},
		);
		if (error)
			return {
				ok: false,
				error: error.code === "42501" ? "not_authorized" : "unavailable",
			};
		const payload = record(data);
		if (payload?.ok === true) return { ok: true, error: null };
		const code = payload?.error;
		return {
			ok: false,
			error:
				typeof code === "string" &&
				[
					"admin_not_authorized",
					"mapping_already_exists",
					"mapping_not_found",
					"whatsapp_product_unavailable",
					"invalid_mapping",
				].includes(code)
					? code
					: "unavailable",
		};
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

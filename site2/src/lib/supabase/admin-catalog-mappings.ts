import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AdminCatalogAccount = {
	id: string;
	slug: string;
	name: string;
	phone: string | null;
};

export type AdminCatalogMapping = {
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

export type AdminCatalogMappingsResult = {
	accounts: AdminCatalogAccount[];
	items: AdminCatalogMapping[];
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| null;
};

export type AdminCatalogMappingSaveResult = {
	ok: boolean;
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "invalid_input"
		| "mapping_already_exists"
		| "mapping_not_found"
		| "whatsapp_product_unavailable"
		| "unavailable"
		| null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toAccount(value: unknown): AdminCatalogAccount | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.slug !== "string" ||
		typeof value.name !== "string"
	) {
		return null;
	}
	return {
		id: value.id,
		slug: value.slug,
		name: value.name,
		phone: typeof value.phone_e164 === "string" ? value.phone_e164 : null,
	};
}

function toMapping(value: unknown): AdminCatalogMapping | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.whatsapp_account_id !== "string" ||
		typeof value.account_name !== "string" ||
		typeof value.catalog_id !== "string" ||
		typeof value.product_retailer_id !== "string" ||
		typeof value.product_id !== "string" ||
		typeof value.product_name !== "string" ||
		(value.status !== "active" &&
			value.status !== "inactive" &&
			value.status !== "needs_review") ||
		typeof value.updated_at !== "string"
	) {
		return null;
	}
	return {
		id: value.id,
		accountId: value.whatsapp_account_id,
		accountName: value.account_name,
		accountPhone:
			typeof value.account_phone === "string" ? value.account_phone : null,
		catalogId: value.catalog_id,
		retailerId: value.product_retailer_id,
		productId: value.product_id,
		productName: value.product_name,
		productSku:
			typeof value.product_sku === "string" ? value.product_sku : null,
		status: value.status,
		verifiedAt:
			typeof value.verified_at === "string" ? value.verified_at : null,
		updatedAt: value.updated_at,
		productEligible: value.product_eligible === true,
	};
}

function rpcErrorCode(value: unknown): string | null {
	return isRecord(value) && typeof value.error === "string"
		? value.error
		: null;
}

function hasControlCharacters(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

export async function getAdminCatalogMappings(input?: {
	query?: string;
	linkId?: string;
}): Promise<AdminCatalogMappingsResult> {
	let supabase: Awaited<ReturnType<typeof createClient>>;
	try {
		supabase = await createClient();
	} catch {
		return { accounts: [], items: [], error: "not_configured" };
	}

	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	if (sessionError || !sessionData.session) {
		return { accounts: [], items: [], error: "not_authenticated" };
	}

	const { data, error } = await supabase.rpc(
		"meta_catalog_product_links_admin_list_v1",
		{
			p_limit: 100,
			p_query: input?.query?.trim().slice(0, 100) || null,
			p_link_id: input?.linkId ?? null,
		},
	);
	if (error) {
		return {
			accounts: [],
			items: [],
			error: error.code === "42501" ? "not_authorized" : "unavailable",
		};
	}
	if (!isRecord(data) || data.ok !== true) {
		return {
			accounts: [],
			items: [],
			error:
				rpcErrorCode(data) === "admin_not_authorized"
					? "not_authorized"
					: "unavailable",
		};
	}
	const rawAccounts = Array.isArray(data.accounts) ? data.accounts : [];
	const rawItems = Array.isArray(data.items) ? data.items : [];
	const accounts = rawAccounts
		.map(toAccount)
		.filter((account): account is AdminCatalogAccount => account !== null);
	const items = rawItems
		.map(toMapping)
		.filter((item): item is AdminCatalogMapping => item !== null);
	if (
		accounts.length !== rawAccounts.length ||
		items.length !== rawItems.length
	) {
		return { accounts: [], items: [], error: "unavailable" };
	}
	return { accounts, items, error: null };
}

export async function saveAdminCatalogMapping(input: {
	accountId: string;
	catalogId: string;
	retailerId: string;
	productId: string;
	linkId: string | null;
}): Promise<AdminCatalogMappingSaveResult> {
	const uuid =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	if (
		!uuid.test(input.accountId) ||
		!uuid.test(input.productId) ||
		(input.linkId !== null && !uuid.test(input.linkId)) ||
		input.catalogId.length < 1 ||
		input.catalogId.length > 256 ||
		input.retailerId.length < 1 ||
		input.retailerId.length > 256 ||
		hasControlCharacters(input.catalogId) ||
		hasControlCharacters(input.retailerId)
	) {
		return { ok: false, error: "invalid_input" };
	}

	let supabase: Awaited<ReturnType<typeof createClient>>;
	try {
		supabase = await createClient();
	} catch {
		return { ok: false, error: "not_configured" };
	}

	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	if (sessionError || !sessionData.session) {
		return { ok: false, error: "not_authenticated" };
	}
	const { data, error } = await supabase.rpc(
		"meta_catalog_product_link_admin_save_v1",
		{
			p_whatsapp_account_id: input.accountId,
			p_catalog_id: input.catalogId,
			p_product_retailer_id: input.retailerId,
			p_product_id: input.productId,
			p_link_id: input.linkId,
		},
	);
	if (error) {
		return {
			ok: false,
			error: error.code === "42501" ? "not_authorized" : "unavailable",
		};
	}
	if (!isRecord(data) || data.ok !== true) {
		const code = rpcErrorCode(data);
		if (code === "admin_not_authorized") {
			return { ok: false, error: "not_authorized" };
		}
		if (code === "mapping_already_exists") {
			return { ok: false, error: "mapping_already_exists" };
		}
		if (code === "mapping_not_found") {
			return { ok: false, error: "mapping_not_found" };
		}
		if (code === "whatsapp_product_unavailable") {
			return { ok: false, error: "whatsapp_product_unavailable" };
		}
		if (code === "invalid_mapping")
			return { ok: false, error: "invalid_input" };
		return { ok: false, error: "unavailable" };
	}
	return { ok: true, error: null };
}

"use client";
import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

export type FlowBasketType = {
	id: string;
	name: string;
	sortOrder: number;
	active: boolean;
	linkedTemplateId: string | null;
	templateActive: boolean;
	siteVisible: boolean;
	flowEnabled: boolean;
	flowSortOrder: number;
};

export type FlowOption = {
	id: string;
	name: string;
	brand: string | null;
	sku: string | null;
	packaging: string | null;
	imageUrl: string | null;
	priceCents: number | null;
	regularPriceCents: number | null;
	isOffer: boolean;
	active: boolean;
	sortOrder: number;
};

export type FlowProductType = {
	id: string;
	name: string;
	category: string | null;
	sortOrder: number;
	active: boolean;
	flowEnabled: boolean;
	flowSortOrder: number;
	selectionMode: "single" | "multiple";
	maxQuantity: number;
	positionLabels: string[];
	options: FlowOption[];
};

export type FlowQuantityRule = {
	basketTypeId: string;
	productTypeId: string;
	quantity: number;
};

export type FlowConfiguration = {
	basketTypes: FlowBasketType[];
	productTypes: FlowProductType[];
	quantities: FlowQuantityRule[];
};

export type FlowConfigurationResult = {
	configuration: FlowConfiguration | null;
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| null;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function text(value: unknown, limit = 180): string | null {
	if (typeof value !== "string") return null;
	const clean = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return clean ? clean.slice(0, limit) : null;
}

function id(value: unknown): string | null {
	const candidate = text(value, 64);
	return candidate && /^[0-9a-f-]{36}$/i.test(candidate) ? candidate : null;
}

function integer(value: unknown, minimum = 0, maximum = 1_000_000): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed)
		? Math.max(minimum, Math.min(maximum, Math.round(parsed)))
		: minimum;
}

function cents(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed >= 0
		? Math.min(100_000_000, Math.round(parsed))
		: null;
}

function safeHttpsUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function mapBasketType(value: unknown): FlowBasketType | null {
	const row = record(value);
	const rowId = id(row?.id);
	if (!row || !rowId) return null;
	return {
		id: rowId,
		name: text(row.name, 120) ?? "Cesta sem nome",
		sortOrder: integer(row.sort_order),
		active: row.is_active === true,
		linkedTemplateId: id(row.linked_template_id),
		templateActive: row.template_active === true,
		siteVisible: row.site_visible === true,
		flowEnabled: row.flow_enabled === true,
		flowSortOrder: integer(row.flow_sort_order, 0, 10_000),
	};
}

function mapOption(value: unknown): FlowOption | null {
	const row = record(value);
	const rowId = id(row?.product_id);
	if (!row || !rowId) return null;
	return {
		id: rowId,
		name: text(row.name, 180) ?? "Produto sem nome",
		brand: text(row.brand, 100),
		sku: text(row.sku, 80),
		packaging: text(row.packaging, 100),
		imageUrl: safeHttpsUrl(row.image_url),
		priceCents: cents(row.price_cents),
		regularPriceCents: cents(row.regular_price_cents),
		isOffer: row.is_offer === true,
		active: row.is_active === true,
		sortOrder: integer(row.sort_order, 0, 10_000),
	};
}

function mapProductType(value: unknown): FlowProductType | null {
	const row = record(value);
	const rowId = id(row?.id);
	if (!row || !rowId) return null;
	const positionLabels = Array.isArray(row.position_labels)
		? row.position_labels
				.map((label) => text(label, 100))
				.filter((label): label is string => label !== null)
				.slice(0, 12)
		: [];
	return {
		id: rowId,
		name: text(row.name, 120) ?? "Etapa sem nome",
		category: text(row.category, 100),
		sortOrder: integer(row.sort_order, 0, 10_000),
		active: row.is_active === true,
		flowEnabled: row.flow_enabled === true,
		flowSortOrder: integer(row.flow_sort_order, 0, 10_000),
		selectionMode: row.selection_mode === "single" ? "single" : "multiple",
		maxQuantity: integer(row.max_quantity, 1, 10),
		positionLabels,
		options: Array.isArray(row.options)
			? row.options
					.map(mapOption)
					.filter((option): option is FlowOption => option !== null)
			: [],
	};
}

function mapQuantityRule(value: unknown): FlowQuantityRule | null {
	const row = record(value);
	const basketTypeId = id(row?.basket_type_id);
	const productTypeId = id(row?.product_type_id);
	if (!basketTypeId || !productTypeId) return null;
	return {
		basketTypeId,
		productTypeId,
		quantity: integer(row?.quantity, 0, 100),
	};
}

export async function getAdminFlowConfiguration(): Promise<FlowConfigurationResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { configuration: null, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) {
		return { configuration: null, error: "not_authenticated" };
	}

	const endpoint = new URL(
		"/functions/v1/admin-basket-configuration-v1",
		supabaseUrl,
	);
	endpoint.searchParams.set("action", "flow_list");

	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
	} catch {
		return { configuration: null, error: "unavailable" };
	}
	if (response.status === 401 || response.status === 403) {
		return { configuration: null, error: "not_authorized" };
	}
	if (!response.ok) return { configuration: null, error: "unavailable" };

	try {
		const payload = record(await response.json());
		if (
			payload?.ok !== true ||
			!Array.isArray(payload.basket_types) ||
			!Array.isArray(payload.product_types) ||
			!Array.isArray(payload.quantities)
		) {
			return { configuration: null, error: "unavailable" };
		}
		return {
			configuration: {
				basketTypes: payload.basket_types
					.map(mapBasketType)
					.filter((basket): basket is FlowBasketType => basket !== null),
				productTypes: payload.product_types
					.map(mapProductType)
					.filter((type): type is FlowProductType => type !== null),
				quantities: payload.quantities
					.map(mapQuantityRule)
					.filter((rule): rule is FlowQuantityRule => rule !== null),
			},
			error: null,
		};
	} catch {
		return { configuration: null, error: "unavailable" };
	}
}

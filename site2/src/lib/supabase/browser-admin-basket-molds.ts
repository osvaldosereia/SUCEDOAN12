"use client";

import type {
	BasketMoldEditor,
	BasketMoldPhotoAudit,
	BasketMoldProductCandidate,
	BasketMoldResult,
	BasketMoldSummary,
	SaveBasketMoldInput,
} from "@/lib/supabase/admin-basket-molds";
import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;
type ErrorCode = Extract<BasketMoldResult<never>, { ok: false }>["error"];
const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function safeText(value: unknown, maximum = 180): string | null {
	if (typeof value !== "string") return null;
	const clean = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return clean ? clean.slice(0, maximum) : null;
}

function safeUrl(value: unknown): string | null {
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

function errorCode(value: unknown, status: number): ErrorCode {
	if (status === 401) return "not_authenticated";
	if (status === 403) return "not_authorized";
	if (status === 404) return "not_found";
	if (status === 409) return "conflict";
	const error = record(value)?.error;
	const allowed: ErrorCode[] = [
		"not_configured",
		"not_authenticated",
		"not_authorized",
		"not_found",
		"invalid_input",
		"conflict",
		"product_not_ready",
		"empty_flow_options",
		"too_many_flow_options",
		"unavailable",
	];
	return allowed.includes(error as ErrorCode)
		? (error as ErrorCode)
		: "unavailable";
}

async function gateway(
	input: JsonRecord,
): Promise<{ ok: true; data: JsonRecord } | { ok: false; error: ErrorCode }> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	try {
		const supabase = createClient();
		const { data: sessionData, error: sessionError } =
			await supabase.auth.getSession();
		const token = sessionData.session?.access_token;
		if (sessionError || !token)
			return { ok: false, error: "not_authenticated" };
		const endpoint = new URL(
			"/functions/v1/admin-basket-molds-browser-v1",
			supabaseUrl,
		);
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(input),
			cache: "no-store",
		});
		const payload = record(await response.json().catch(() => null));
		if (!response.ok || payload?.ok !== true) {
			return { ok: false, error: errorCode(payload, response.status) };
		}
		return { ok: true, data: payload };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

function mapSummary(value: unknown): BasketMoldSummary | null {
	const row = record(value);
	if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return null;
	const hiddenAdjustment = Number(row.hidden_adjustment);
	return {
		id: row.id.toLowerCase(),
		name: safeText(row.name) ?? "Cesta sem nome",
		imageUrl: safeUrl(row.image_url),
		active: row.is_active === true,
		categoryName: safeText(row.category_name, 100),
		subcategoryName: safeText(row.subcategory_name, 100),
		moldConfigured: row.mold_configured === true,
		publicCompositionCount: Math.max(
			1,
			Math.min(6, Number(row.public_composition_count) || 1),
		),
		hiddenAdjustmentCents:
			Number.isFinite(hiddenAdjustment) &&
			Math.abs(hiddenAdjustment) <= 9_999_999
				? Math.round(hiddenAdjustment * 100)
				: 0,
	};
}

export async function getBrowserAdminBasketMoldList(): Promise<
	BasketMoldResult<BasketMoldSummary[]>
> {
	const result = await gateway({ action: "list" });
	if (!result.ok) return result;
	if (!Array.isArray(result.data.baskets))
		return { ok: false, error: "unavailable" };
	return {
		ok: true,
		data: result.data.baskets
			.map(mapSummary)
			.filter((basket): basket is BasketMoldSummary => basket !== null),
	};
}

function mapEditor(value: unknown): BasketMoldEditor | null {
	const row = record(value);
	if (
		!row ||
		typeof row.basketId !== "string" ||
		!UUID.test(row.basketId) ||
		!Array.isArray(row.positions)
	)
		return null;
	const positions = row.positions
		.map((positionValue) => {
			const position = record(positionValue);
			if (
				!position ||
				typeof position.id !== "string" ||
				!UUID.test(position.id) ||
				!Array.isArray(position.options)
			)
				return null;
			const options = position.options
				.map((optionValue) => {
					const option = record(optionValue);
					if (
						!option ||
						typeof option.productId !== "string" ||
						!UUID.test(option.productId)
					)
						return null;
					return {
						productId: option.productId.toLowerCase(),
						name: safeText(option.name) ?? "Produto sem nome",
						sku: safeText(option.sku, 80),
						imageUrl: safeUrl(option.imageUrl),
						active: option.active === true,
						whatsappActive:
							typeof option.whatsappActive === "boolean"
								? option.whatsappActive
								: null,
						sortOrder: Number.isFinite(Number(option.sortOrder))
							? Number(option.sortOrder)
							: 0,
					};
				})
				.filter((option) => option !== null);
			return {
				id: position.id.toLowerCase(),
				label: safeText(position.label, 100) ?? "Etapa sem nome",
				quantity: Math.max(1, Math.min(999, Number(position.quantity) || 1)),
				sortOrder: Number.isFinite(Number(position.sortOrder))
					? Number(position.sortOrder)
					: 0,
				options,
			};
		})
		.filter((position) => position !== null);
	const money = (input: unknown) => {
		const value = Number(input);
		return Number.isFinite(value) ? Math.round(value) : 0;
	};
	return {
		basketId: row.basketId.toLowerCase(),
		name: safeText(row.name) ?? "Cesta sem nome",
		imageUrl: safeUrl(row.imageUrl),
		active: row.active === true,
		moldConfigured: row.moldConfigured === true,
		categoryName: safeText(row.categoryName, 100),
		subcategoryName: safeText(row.subcategoryName, 100),
		publicCompositionCount: Math.max(
			1,
			Math.min(6, Number(row.publicCompositionCount) || 1),
		),
		hiddenAdjustmentCents: money(row.hiddenAdjustmentCents),
		conditionalHiddenEnabled: row.conditionalHiddenEnabled === true,
		conditionalHiddenProductName: safeText(
			row.conditionalHiddenProductName,
			180,
		),
		conditionalHiddenAdjustmentCents: money(
			row.conditionalHiddenAdjustmentCents,
		),
		positions,
	};
}

export async function getBrowserAdminBasketMoldEditor(
	basketId: string,
): Promise<BasketMoldResult<{ editor: BasketMoldEditor; revision: string }>> {
	if (!UUID.test(basketId)) return { ok: false, error: "invalid_input" };
	const result = await gateway({ action: "editor", basketId });
	if (!result.ok) return result;
	const editor = mapEditor(result.data.editor);
	const revision = result.data.revision;
	return editor &&
		typeof revision === "string" &&
		/^[0-9a-f]{64}$/i.test(revision)
		? { ok: true, data: { editor, revision } }
		: { ok: false, error: "unavailable" };
}

export async function searchBrowserBasketMoldProducts(
	query: string,
): Promise<BasketMoldResult<BasketMoldProductCandidate[]>> {
	if (query.trim().length < 2 || query.length > 80)
		return { ok: false, error: "invalid_input" };
	const result = await gateway({ action: "products", query: query.trim() });
	if (!result.ok) return result;
	if (!Array.isArray(result.data.products))
		return { ok: false, error: "unavailable" };
	const products = result.data.products
		.map((value): BasketMoldProductCandidate | null => {
			const row = record(value);
			if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return null;
			const imageUrl = safeUrl(row.imageUrl);
			if (!imageUrl) return null;
			return {
				id: row.id.toLowerCase(),
				name: safeText(row.name) ?? "Produto sem nome",
				sku: safeText(row.sku, 80),
				imageUrl,
				priceCents: null,
				active: row.active === true,
			};
		})
		.filter(
			(product): product is BasketMoldProductCandidate => product !== null,
		);
	return { ok: true, data: products };
}

export async function validateBrowserBasketMoldProduct(
	productId: string,
): Promise<BasketMoldResult<BasketMoldProductCandidate>> {
	if (!UUID.test(productId)) return { ok: false, error: "invalid_input" };
	const result = await gateway({ action: "validate_product", productId });
	if (!result.ok) return result;
	const row = record(result.data.product);
	const imageUrl = safeUrl(row?.imageUrl);
	if (!row || typeof row.id !== "string" || !UUID.test(row.id) || !imageUrl)
		return { ok: false, error: "unavailable" };
	return {
		ok: true,
		data: {
			id: row.id.toLowerCase(),
			name: safeText(row.name) ?? "Produto sem nome",
			sku: safeText(row.sku, 80),
			imageUrl,
			priceCents: Number.isSafeInteger(row.priceCents)
				? Number(row.priceCents)
				: null,
			active: row.active === true,
		},
	};
}

export async function saveBrowserBasketMoldOptions(
	input: SaveBasketMoldInput,
): Promise<BasketMoldResult<{ editor: BasketMoldEditor; revision: string }>> {
	const result = await gateway({ action: "save", input });
	if (!result.ok) return result;
	const editor = mapEditor(result.data.editor);
	const revision = result.data.revision;
	return editor &&
		typeof revision === "string" &&
		/^[0-9a-f]{64}$/i.test(revision)
		? { ok: true, data: { editor, revision } }
		: { ok: false, error: "unavailable" };
}

export type BrowserProductWhatsappResult =
	| { ok: true }
	| {
			ok: false;
			error:
				| "not_configured"
				| "not_authenticated"
				| "not_authorized"
				| "invalid_input"
				| "not_found"
				| "conflict"
				| "product_inactive"
				| "flow_name_invalid"
				| "flow_image_invalid"
				| "flow_price_invalid"
				| "unavailable";
	  };

export async function enableBrowserProductForWhatsapp(
	productId: string,
): Promise<BrowserProductWhatsappResult> {
	if (!supabaseUrl || !supabasePublishableKey)
		return { ok: false, error: "not_configured" };
	if (!UUID.test(productId)) return { ok: false, error: "invalid_input" };
	try {
		const supabase = createClient();
		const { data, error } = await supabase.auth.getSession();
		const token = data.session?.access_token;
		if (error || !token) return { ok: false, error: "not_authenticated" };
		const response = await fetch(
			new URL(
				"/functions/v1/admin-product-whatsapp-availability-v1",
				supabaseUrl,
			),
			{
				method: "POST",
				headers: {
					apikey: supabasePublishableKey,
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					product_id: productId,
					expected_whatsapp_active: false,
					whatsapp_active: true,
				}),
				cache: "no-store",
			},
		);
		const payload = record(await response.json().catch(() => null));
		if (!response.ok || payload?.ok !== true) {
			const error = payload?.error;
			const allowed = [
				"not_configured",
				"not_authenticated",
				"not_authorized",
				"invalid_input",
				"not_found",
				"conflict",
				"product_inactive",
				"flow_name_invalid",
				"flow_image_invalid",
				"flow_price_invalid",
				"unavailable",
			] as const;
			if (response.status === 401)
				return { ok: false, error: "not_authenticated" };
			if (response.status === 403)
				return { ok: false, error: "not_authorized" };
			if (response.status === 404) return { ok: false, error: "not_found" };
			return {
				ok: false,
				error: allowed.includes(error as (typeof allowed)[number])
					? (error as (typeof allowed)[number])
					: "unavailable",
			};
		}
		return { ok: true };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

export async function getBrowserAdminBasketMoldPhotoAudit(
	summaries?: readonly BasketMoldSummary[],
): Promise<BasketMoldResult<BasketMoldPhotoAudit>> {
	let list = summaries;
	if (!list) {
		const result = await getBrowserAdminBasketMoldList();
		if (!result.ok) return result;
		list = result.data;
	}
	const configured = list.filter((basket) => basket.moldConfigured);
	const results = await Promise.all(
		configured.map((basket) => getBrowserAdminBasketMoldEditor(basket.id)),
	);
	const failed = results.find((result) => !result.ok);
	if (failed && !failed.ok) return failed;
	const editors = results.flatMap((result) =>
		result.ok ? [result.data.editor] : [],
	);
	const positions = editors.flatMap((editor) => editor.positions);
	const baskets: BasketMoldPhotoAudit["baskets"] = editors.map((editor) => {
		const pendingPositions: BasketMoldPhotoAudit["baskets"][number]["pendingPositions"] =
			[];
		for (const position of editor.positions) {
			const activeOptions = position.options.filter(
				(option) => option.active && option.whatsappActive === true,
			);
			const options = position.options.map((option) => ({
				productId: option.productId,
				name: option.name,
				active: option.active,
				whatsappActive: option.whatsappActive,
				hasPhoto: option.imageUrl !== null,
			}));
			if (!activeOptions.length) {
				pendingPositions.push({
					positionId: position.id,
					label: position.label,
					issue: "no_whatsapp_option",
					options,
				});
			} else if (!activeOptions.some((option) => option.imageUrl !== null)) {
				pendingPositions.push({
					positionId: position.id,
					label: position.label,
					issue: "missing_photo",
					options,
				});
			}
		}
		const activeOptions = editor.positions.flatMap((position) =>
			position.options.filter(
				(option) => option.active && option.whatsappActive === true,
			),
		);
		return {
			basketId: editor.basketId,
			positionCount: editor.positions.length,
			activeOptionCount: activeOptions.length,
			activeOptionsWithoutPhoto: activeOptions.filter(
				(option) => option.imageUrl === null,
			).length,
			positionsWithoutActiveOption: editor.positions.filter(
				(position) =>
					!position.options.some(
						(option) => option.active && option.whatsappActive === true,
					),
			).length,
			positionsWithoutActivePhoto: editor.positions.filter(
				(position) =>
					!position.options.some(
						(option) =>
							option.active &&
							option.whatsappActive === true &&
							option.imageUrl !== null,
					),
			).length,
			pendingPositions,
		};
	});
	const activeOptions = positions.flatMap((position) =>
		position.options.filter(
			(option) => option.active && option.whatsappActive === true,
		),
	);
	return {
		ok: true,
		data: {
			basketCount: list.length,
			configuredBasketCount: configured.length,
			positionCount: positions.length,
			activeOptionsWithPhoto: activeOptions.filter(
				(option) => option.imageUrl !== null,
			).length,
			activeOptionsWithoutPhoto: activeOptions.filter(
				(option) => option.imageUrl === null,
			).length,
			unverifiedWhatsappOptions: positions
				.flatMap((position) => position.options)
				.filter((option) => option.active && option.whatsappActive === null)
				.length,
			positionsWithoutActiveOption: positions.filter(
				(position) =>
					!position.options.some(
						(option) => option.active && option.whatsappActive === true,
					),
			).length,
			positionsWithoutActivePhoto: positions.filter(
				(position) =>
					!position.options.some(
						(option) =>
							option.active &&
							option.whatsappActive === true &&
							option.imageUrl !== null,
					),
			).length,
			baskets,
		},
	};
}

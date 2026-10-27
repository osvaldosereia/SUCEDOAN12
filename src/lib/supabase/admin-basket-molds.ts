import "server-only";
import { createHash } from "node:crypto";
import { getAdminProductDetail } from "@/lib/supabase/admin-products";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_POSITIONS = 80;
const MAX_OPTIONS_PER_POSITION = 40;
const MAX_FLOW_OPTIONS_PER_POSITION = 8;
const MAX_HIDDEN_ADJUSTMENT_CENTS = 999_999_999;

type JsonRecord = Record<string, unknown>;
type ErrorCode =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "not_found"
	| "invalid_input"
	| "conflict"
	| "product_not_ready"
	| "empty_flow_options"
	| "too_many_flow_options"
	| "unavailable";

export type BasketMoldSummary = {
	id: string;
	name: string;
	imageUrl: string | null;
	active: boolean;
	categoryName: string | null;
	subcategoryName: string | null;
	moldConfigured: boolean;
	publicCompositionCount: number;
	hiddenAdjustmentCents: number;
};

export type BasketMoldProductOption = {
	productId: string;
	name: string;
	sku: string | null;
	imageUrl: string | null;
	active: boolean;
	whatsappActive: boolean | null;
	sortOrder: number;
};

export type BasketMoldPosition = {
	id: string;
	label: string;
	quantity: number;
	sortOrder: number;
	options: BasketMoldProductOption[];
};

export type BasketMoldEditor = {
	basketId: string;
	name: string;
	imageUrl: string | null;
	active: boolean;
	moldConfigured: boolean;
	categoryName: string | null;
	subcategoryName: string | null;
	publicCompositionCount: number;
	hiddenAdjustmentCents: number;
	conditionalHiddenEnabled: boolean;
	conditionalHiddenProductName: string | null;
	conditionalHiddenAdjustmentCents: number;
	positions: BasketMoldPosition[];
};

export type BasketMoldProductCandidate = {
	id: string;
	name: string;
	sku: string | null;
	imageUrl: string;
	priceCents: number | null;
	active: boolean;
};

export type BasketMoldPhotoAudit = {
	basketCount: number;
	configuredBasketCount: number;
	positionCount: number;
	activeOptionsWithPhoto: number;
	activeOptionsWithoutPhoto: number;
	unverifiedWhatsappOptions: number;
	positionsWithoutActiveOption: number;
	positionsWithoutActivePhoto: number;
	baskets: Array<{
		basketId: string;
		positionCount: number;
		activeOptionCount: number;
		activeOptionsWithoutPhoto: number;
		positionsWithoutActiveOption: number;
		positionsWithoutActivePhoto: number;
		pendingPositions: Array<{
			positionId: string;
			label: string;
			issue: "no_whatsapp_option" | "missing_photo";
		}>;
	}>;
};

type BasketMoldPendingPosition =
	BasketMoldPhotoAudit["baskets"][number]["pendingPositions"][number];

export type BasketMoldResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: ErrorCode };

type RawEditor = JsonRecord & {
	basket_id: string;
	basket_name: string;
	positions: unknown[];
};

type SavePositionInput = {
	positionId: string;
	label: string;
	productIds: string[];
};

export type SaveBasketMoldInput = {
	basketId: string;
	revision: string;
	name: string;
	hiddenAdjustmentCents: number;
	positions: SavePositionInput[];
};

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function safeText(value: unknown, maximum = 180): string | null {
	if (typeof value !== "string") return null;
	const result = Array.from(value.slice(0, maximum * 2), (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return result ? result.slice(0, maximum) : null;
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

function integer(value: unknown, minimum = 0, maximum = 1_000_000): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isSafeInteger(parsed)
		? Math.max(minimum, Math.min(maximum, parsed))
		: minimum;
}

function moneyCents(value: unknown, maximumReais = 1_000_000): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && Math.abs(parsed) <= maximumReais
		? Math.round(parsed * 100)
		: 0;
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	const row = record(value);
	if (!row) return value;
	return Object.fromEntries(
		Object.keys(row)
			.sort()
			.map((key) => [key, stableValue(row[key])]),
	);
}

function revisionFor(raw: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(stableValue(raw)))
		.digest("hex");
}

async function accessToken(): Promise<
	{ token: string; error: null } | { token: null; error: ErrorCode }
> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { token: null, error: "not_configured" };
	}
	try {
		const supabase = await createClient();
		const { data, error } = await supabase.auth.getSession();
		if (error || !data.session?.access_token) {
			return { token: null, error: "not_authenticated" };
		}
		return { token: data.session.access_token, error: null };
	} catch {
		return { token: null, error: "not_authenticated" };
	}
}

async function gateway(
	method: "GET" | "POST",
	action: string,
	input: JsonRecord = {},
): Promise<BasketMoldResult<JsonRecord>> {
	const auth = await accessToken();
	if (auth.token === null) return { ok: false, error: auth.error };
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}

	const endpoint = new URL("/functions/v1/admin-basket-molds-v1", supabaseUrl);
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method,
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${auth.token}`,
				Accept: "application/json",
				...(method === "POST" ? { "Content-Type": "application/json" } : {}),
			},
			...(method === "POST"
				? { body: JSON.stringify({ action, ...input }) }
				: undefined),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}

	if (response.status === 401) {
		return { ok: false, error: "not_authenticated" };
	}
	if (response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (!response.ok) {
		let error: ErrorCode = "unavailable";
		try {
			const body = record(await response.json());
			if (body?.error === "basket_mold_basket_not_found") error = "not_found";
			else if (body?.error === "basket_mold_duplicate_option") {
				error = "invalid_input";
			} else if (body?.error === "admin_not_authorized") {
				error = "not_authorized";
			} else if (response.status === 400 || response.status === 409) {
				error = "invalid_input";
			}
		} catch {
			// Provider payloads are deliberately not returned to the UI.
		}
		return { ok: false, error };
	}

	try {
		const payload = record(await response.json());
		if (payload?.ok !== true) {
			return { ok: false, error: "unavailable" };
		}
		return { ok: true, data: payload };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

function rawEditor(payload: JsonRecord): RawEditor | null {
	const editor = record(payload.editor);
	if (
		!editor ||
		typeof editor.basket_id !== "string" ||
		typeof editor.basket_name !== "string" ||
		!Array.isArray(editor.positions)
	) {
		return null;
	}
	return editor as RawEditor;
}

function mapSummary(value: unknown): BasketMoldSummary | null {
	const row = record(value);
	if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return null;
	return {
		id: row.id.toLowerCase(),
		name: safeText(row.name) ?? "Cesta sem nome",
		imageUrl: safeHttpsUrl(row.image_url),
		active: row.is_active === true,
		categoryName: safeText(row.category_name, 100),
		subcategoryName: safeText(row.subcategory_name, 100),
		moldConfigured: row.mold_configured === true,
		publicCompositionCount: integer(row.public_composition_count, 1, 6),
		hiddenAdjustmentCents: moneyCents(
			row.hidden_adjustment,
			MAX_HIDDEN_ADJUSTMENT_CENTS / 100,
		),
	};
}

function mapEditor(
	raw: RawEditor,
	summary: BasketMoldSummary | null,
): BasketMoldEditor | null {
	if (!UUID.test(raw.basket_id)) return null;
	const positions = raw.positions
		.map((value) => {
			const row = record(value);
			if (
				!row ||
				typeof row.position_id !== "string" ||
				!UUID.test(row.position_id)
			) {
				return null;
			}
			const options = Array.isArray(row.options)
				? row.options
						.map((optionValue) => {
							const option = record(optionValue);
							if (
								!option ||
								typeof option.product_id !== "string" ||
								!UUID.test(option.product_id)
							) {
								return null;
							}
							return {
								productId: option.product_id.toLowerCase(),
								name: safeText(option.name) ?? "Produto sem nome",
								sku: safeText(option.sku, 80),
								imageUrl: safeHttpsUrl(option.image_url),
								active: option.is_active === true,
								whatsappActive:
									typeof option.is_whatsapp_active === "boolean"
										? option.is_whatsapp_active
										: null,
								sortOrder: integer(option.sort_order, 0, 10_000),
							};
						})
						.filter(
							(option): option is BasketMoldProductOption => option !== null,
						)
						.sort((left, right) => left.sortOrder - right.sortOrder)
				: [];
			return {
				id: row.position_id.toLowerCase(),
				label: safeText(row.label, 100) ?? "Etapa sem nome",
				quantity: integer(row.quantity, 1, 999),
				sortOrder: integer(row.sort_order, 0, 10_000),
				options,
			};
		})
		.filter((position): position is BasketMoldPosition => position !== null)
		.sort((left, right) => left.sortOrder - right.sortOrder);

	const conditionalProduct = record(raw.conditional_hidden_product);
	return {
		basketId: raw.basket_id.toLowerCase(),
		name: safeText(raw.basket_name) ?? "Cesta sem nome",
		imageUrl: safeHttpsUrl(raw.basket_image_url),
		active: summary?.active ?? false,
		moldConfigured: typeof raw.mold_id === "string" && UUID.test(raw.mold_id),
		categoryName: summary?.categoryName ?? null,
		subcategoryName: summary?.subcategoryName ?? null,
		publicCompositionCount: integer(raw.public_composition_count, 1, 6),
		hiddenAdjustmentCents: moneyCents(
			raw.hidden_adjustment,
			MAX_HIDDEN_ADJUSTMENT_CENTS / 100,
		),
		conditionalHiddenEnabled: raw.conditional_hidden_enabled === true,
		conditionalHiddenProductName: safeText(conditionalProduct?.name, 180),
		conditionalHiddenAdjustmentCents: moneyCents(
			raw.conditional_hidden_adjustment,
		),
		positions,
	};
}

async function getRawEditor(
	basketId: string,
	summaries?: readonly BasketMoldSummary[],
): Promise<
	BasketMoldResult<{
		raw: RawEditor;
		editor: BasketMoldEditor;
		summary: BasketMoldSummary | null;
	}>
> {
	if (!UUID.test(basketId)) return { ok: false, error: "invalid_input" };
	const result = await gateway("POST", "editor", { basket_id: basketId });
	if (!result.ok) return result;
	const raw = rawEditor(result.data);
	let availableSummaries = summaries;
	if (!availableSummaries) {
		const list = await getAdminBasketMoldList();
		if (!list.ok) return list;
		availableSummaries = list.data;
	}
	const summary =
		availableSummaries.find((basket) => basket.id === basketId.toLowerCase()) ??
		null;
	const editor = raw ? mapEditor(raw, summary) : null;
	if (!raw || !editor) return { ok: false, error: "unavailable" };
	return { ok: true, data: { raw, editor, summary } };
}

export async function getAdminBasketMoldList(): Promise<
	BasketMoldResult<BasketMoldSummary[]>
> {
	const result = await gateway("POST", "list");
	if (!result.ok) return result;
	const baskets = result.data.baskets;
	if (!Array.isArray(baskets)) return { ok: false, error: "unavailable" };
	return {
		ok: true,
		data: baskets
			.map(mapSummary)
			.filter((basket): basket is BasketMoldSummary => basket !== null),
	};
}

export async function getAdminBasketMoldPhotoAudit(
	summaries?: readonly BasketMoldSummary[],
): Promise<BasketMoldResult<BasketMoldPhotoAudit>> {
	let currentSummaries = summaries;
	if (!currentSummaries) {
		const list = await getAdminBasketMoldList();
		if (!list.ok) return list;
		currentSummaries = list.data;
	}
	const configured = currentSummaries.filter((basket) => basket.moldConfigured);
	const editors = await Promise.all(
		configured.map((basket) => getRawEditor(basket.id, currentSummaries)),
	);
	const failed = editors.find((result) => !result.ok);
	if (failed && !failed.ok) return failed;
	const positions = editors.flatMap((result) =>
		result.ok ? result.data.editor.positions : [],
	);
	const baskets = editors.flatMap((result) => {
		if (!result.ok) return [];
		const currentPositions = result.data.editor.positions;
		const activeOptions = currentPositions.flatMap((position) =>
			position.options.filter(
				(option) => option.active && option.whatsappActive === true,
			),
		);
		const pendingPositions: BasketMoldPendingPosition[] =
			currentPositions.flatMap((position): BasketMoldPendingPosition[] => {
				const whatsappOptions = position.options.filter(
					(option) => option.active && option.whatsappActive === true,
				);
				if (whatsappOptions.length === 0) {
					return [
						{
							positionId: position.id,
							label: position.label,
							issue: "no_whatsapp_option" as const,
						},
					];
				}
				if (!whatsappOptions.some((option) => option.imageUrl !== null)) {
					return [
						{
							positionId: position.id,
							label: position.label,
							issue: "missing_photo" as const,
						},
					];
				}
				return [];
			});
		return [
			{
				basketId: result.data.editor.basketId,
				positionCount: currentPositions.length,
				activeOptionCount: activeOptions.length,
				activeOptionsWithoutPhoto: activeOptions.filter(
					(option) => option.imageUrl === null,
				).length,
				positionsWithoutActiveOption: currentPositions.filter(
					(position) =>
						!position.options.some(
							(option) => option.active && option.whatsappActive === true,
						),
				).length,
				positionsWithoutActivePhoto: currentPositions.filter(
					(position) =>
						!position.options.some(
							(option) =>
								option.active &&
								option.whatsappActive === true &&
								option.imageUrl !== null,
						),
				).length,
				pendingPositions,
			},
		];
	});
	const activeOptions = positions.flatMap((position) =>
		position.options.filter((option) => option.active && option.whatsappActive),
	);
	const activeOptionsWithPhoto = activeOptions.filter(
		(option) => option.imageUrl !== null,
	).length;
	const unverifiedWhatsappOptions = positions
		.flatMap((position) => position.options)
		.filter((option) => option.active && option.whatsappActive === null).length;
	return {
		ok: true,
		data: {
			basketCount: currentSummaries.length,
			configuredBasketCount: configured.length,
			positionCount: positions.length,
			activeOptionsWithPhoto,
			activeOptionsWithoutPhoto: activeOptions.length - activeOptionsWithPhoto,
			unverifiedWhatsappOptions,
			positionsWithoutActiveOption: positions.filter(
				(position) =>
					!position.options.some(
						(option) => option.active && option.whatsappActive,
					),
			).length,
			positionsWithoutActivePhoto: positions.filter(
				(position) =>
					!position.options.some(
						(option) =>
							option.active &&
							option.whatsappActive &&
							option.imageUrl !== null,
					),
			).length,
			baskets,
		},
	};
}

export async function getAdminBasketMoldEditor(
	basketId: string,
): Promise<BasketMoldResult<{ editor: BasketMoldEditor; revision: string }>> {
	const result = await getRawEditor(basketId);
	if (!result.ok) return result;
	return {
		ok: true,
		data: {
			editor: result.data.editor,
			revision: revisionFor(result.data.raw),
		},
	};
}

export async function searchAdminBasketMoldProducts(
	query: string,
): Promise<BasketMoldResult<BasketMoldProductCandidate[]>> {
	const result = await gateway("POST", "products", {
		q: query.trim().slice(0, 80),
		limit: 24,
	});
	if (!result.ok) return result;
	const products = result.data.products;
	if (!Array.isArray(products)) return { ok: false, error: "unavailable" };
	const mapped = products
		.map((value): BasketMoldProductCandidate | null => {
			const row = record(value);
			const id = typeof row?.id === "string" ? row.id : "";
			const imageUrl = safeHttpsUrl(row?.image_url);
			if (!row || !UUID.test(id) || typeof row.name !== "string" || !imageUrl) {
				return null;
			}
			return {
				id: id.toLowerCase(),
				name: safeText(row.name) ?? "Produto sem nome",
				sku: safeText(row.sku, 80),
				imageUrl,
				priceCents: null,
				active: row.is_active === true,
			};
		})
		.filter(
			(product): product is BasketMoldProductCandidate => product !== null,
		);
	return { ok: true, data: mapped };
}

function productIsReady(
	product: NonNullable<
		Awaited<ReturnType<typeof getAdminProductDetail>>["product"]
	>,
) {
	const flowName = Array.from(product.name, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code < 32 || code === 127 ? " " : character;
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return (
		product.active &&
		product.whatsappActive &&
		flowName.length > 0 &&
		flowName.length <= 180 &&
		safeHttpsUrl(product.imageUrl) !== null &&
		Number.isSafeInteger(product.priceCents) &&
		product.priceCents !== null &&
		product.priceCents >= 0 &&
		product.priceCents <= 999_999_999
	);
}

export async function validateAdminBasketMoldProduct(
	productId: string,
): Promise<BasketMoldResult<BasketMoldProductCandidate>> {
	if (!UUID.test(productId)) return { ok: false, error: "invalid_input" };
	const result = await getAdminProductDetail(productId);
	if (!result.product || result.error) {
		return {
			ok: false,
			error:
				result.error === "not_authenticated"
					? "not_authenticated"
					: result.error === "not_authorized"
						? "not_authorized"
						: "product_not_ready",
		};
	}
	if (!productIsReady(result.product)) {
		return { ok: false, error: "product_not_ready" };
	}
	return {
		ok: true,
		data: {
			id: result.product.id.toLowerCase(),
			name: result.product.name,
			sku: result.product.sku,
			imageUrl: result.product.imageUrl as string,
			priceCents: result.product.priceCents as number,
			active: result.product.active,
		},
	};
}

function parseSaveInput(input: SaveBasketMoldInput): boolean {
	if (
		!input ||
		typeof input.basketId !== "string" ||
		!UUID.test(input.basketId) ||
		typeof input.revision !== "string" ||
		!/^[0-9a-f]{64}$/i.test(input.revision) ||
		typeof input.name !== "string" ||
		!safeText(input.name, 180) ||
		Array.from(input.name).length > 180 ||
		!Number.isSafeInteger(input.hiddenAdjustmentCents) ||
		input.hiddenAdjustmentCents < 0 ||
		input.hiddenAdjustmentCents > MAX_HIDDEN_ADJUSTMENT_CENTS ||
		!Array.isArray(input.positions) ||
		input.positions.length < 1 ||
		input.positions.length > MAX_POSITIONS
	) {
		return false;
	}
	const seenPositions = new Set<string>();
	for (const position of input.positions) {
		if (
			!position ||
			typeof position.positionId !== "string" ||
			!UUID.test(position.positionId) ||
			seenPositions.has(position.positionId.toLowerCase()) ||
			typeof position.label !== "string" ||
			!safeText(position.label, 100) ||
			Array.from(position.label).length > 100 ||
			!Array.isArray(position.productIds) ||
			position.productIds.length < 1 ||
			position.productIds.length > MAX_OPTIONS_PER_POSITION
		) {
			return false;
		}
		seenPositions.add(position.positionId.toLowerCase());
		const seenProducts = new Set<string>();
		for (const productId of position.productIds) {
			if (
				typeof productId !== "string" ||
				!UUID.test(productId) ||
				seenProducts.has(productId.toLowerCase())
			) {
				return false;
			}
			seenProducts.add(productId.toLowerCase());
		}
	}
	return true;
}

async function validateNewProducts(
	current: RawEditor,
	positions: SavePositionInput[],
): Promise<ErrorCode | null> {
	const oldByPosition = new Map<string, string[]>();
	for (const value of current.positions) {
		const position = record(value);
		if (!position || typeof position.position_id !== "string") continue;
		const ids: string[] = [];
		if (Array.isArray(position.options)) {
			for (const value of position.options) {
				const option = record(value);
				if (typeof option?.product_id === "string") {
					ids.push(option.product_id.toLowerCase());
				}
			}
		}
		oldByPosition.set(position.position_id.toLowerCase(), ids);
	}

	const changedPositions: Array<{
		positionId: string;
		productIds: string[];
		newProductIds: Set<string>;
	}> = [];
	for (const position of positions) {
		const existing = oldByPosition.get(position.positionId.toLowerCase()) ?? [];
		const changed =
			existing.length !== position.productIds.length ||
			existing.some(
				(productId, index) =>
					productId !== position.productIds[index]?.toLowerCase(),
			);
		if (!changed) continue;
		const existingIds = new Set(existing);
		const newProductIds = new Set<string>();
		for (const productId of position.productIds) {
			if (!existingIds.has(productId.toLowerCase())) {
				newProductIds.add(productId.toLowerCase());
			}
		}
		changedPositions.push({
			positionId: position.positionId.toLowerCase(),
			productIds: position.productIds.map((productId) =>
				productId.toLowerCase(),
			),
			newProductIds,
		});
	}

	if (changedPositions.length === 0) return null;
	const uniqueProducts = [
		...new Set(changedPositions.flatMap((position) => position.productIds)),
	];
	const productResults = new Map<
		string,
		{
			eligible: boolean;
			requiredForFlow: boolean;
			error: ErrorCode | null;
		}
	>();
	for (let offset = 0; offset < uniqueProducts.length; offset += 5) {
		const batch = uniqueProducts.slice(offset, offset + 5);
		const results = await Promise.all(
			batch.map(async (productId) => {
				const result = await getAdminProductDetail(productId);
				if (result.error === "not_authenticated") {
					return [
						productId,
						{
							eligible: false,
							requiredForFlow: false,
							error: "not_authenticated" as const,
						},
					] as const;
				}
				if (result.error === "not_authorized") {
					return [
						productId,
						{
							eligible: false,
							requiredForFlow: false,
							error: "not_authorized" as const,
						},
					] as const;
				}
				if (result.error && result.error !== "not_found") {
					return [
						productId,
						{
							eligible: false,
							requiredForFlow: false,
							error: "unavailable" as const,
						},
					] as const;
				}
				const product = result.product;
				return [
					productId,
					{
						eligible: product ? productIsReady(product) : false,
						requiredForFlow:
							product?.active === true && product.whatsappActive === true,
						error: null,
					},
				] as const;
			}),
		);
		for (const [productId, status] of results) {
			productResults.set(productId, status);
		}
	}

	for (const position of changedPositions) {
		let eligibleCount = 0;
		for (const productId of position.productIds) {
			const status = productResults.get(productId);
			if (!status) return "unavailable";
			if (status.error) return status.error;
			if (
				(position.newProductIds.has(productId) || status.requiredForFlow) &&
				!status.eligible
			) {
				return "product_not_ready";
			}
			if (status.eligible) eligibleCount += 1;
		}
		if (eligibleCount === 0) return "empty_flow_options";
		if (eligibleCount > MAX_FLOW_OPTIONS_PER_POSITION) {
			return "too_many_flow_options";
		}
	}
	return null;
}

export async function saveAdminBasketMoldOptions(
	input: SaveBasketMoldInput,
): Promise<BasketMoldResult<{ editor: BasketMoldEditor; revision: string }>> {
	if (!parseSaveInput(input)) return { ok: false, error: "invalid_input" };
	const currentResult = await getRawEditor(input.basketId);
	if (!currentResult.ok) return currentResult;
	const { raw, summary } = currentResult.data;
	if (revisionFor(raw) !== input.revision)
		return { ok: false, error: "conflict" };

	const productError = await validateNewProducts(raw, input.positions);
	if (productError) return { ok: false, error: productError };

	const rawPositions = raw.positions
		.map((value) => record(value))
		.filter((position): position is JsonRecord => position !== null);
	const rawById = new Map(
		rawPositions.map((position) => [
			String(position.position_id).toLowerCase(),
			position,
		]),
	);
	const positions: JsonRecord[] = [];
	for (const submitted of input.positions) {
		const positionId = submitted.positionId.toLowerCase();
		const old = rawById.get(positionId);
		const oldOptions = Array.isArray(old?.options) ? old.options : [];
		const optionsByProduct = new Map<string, JsonRecord>();
		for (const optionValue of oldOptions) {
			const option = record(optionValue);
			if (typeof option?.product_id === "string") {
				optionsByProduct.set(option.product_id.toLowerCase(), option);
			}
		}
		positions.push({
			label: safeText(submitted.label, 100),
			quantity: old?.quantity ?? 1,
			metadata: old?.metadata ?? {},
			options: submitted.productIds.map((productId) => {
				const oldOption = optionsByProduct.get(productId.toLowerCase());
				return {
					product_id: productId.toLowerCase(),
					metadata: oldOption?.metadata ?? {},
				};
			}),
		});
	}

	const name = safeText(input.name, 180);
	if (!name) return { ok: false, error: "invalid_input" };
	const hiddenAdjustment = input.hiddenAdjustmentCents / 100;
	const conditionalAdjustment = Number(raw.conditional_hidden_adjustment ?? 0);
	if (
		!Number.isFinite(hiddenAdjustment) ||
		!Number.isFinite(conditionalAdjustment)
	) {
		return { ok: false, error: "unavailable" };
	}

	const save = await gateway("POST", "save", {
		basket_id: input.basketId,
		name,
		hidden_adjustment: hiddenAdjustment,
		public_composition_count: integer(raw.public_composition_count, 1, 6),
		positions,
		category_id: raw.category_id,
		subcategory_id: raw.subcategory_id,
		conditional_hidden_enabled: raw.conditional_hidden_enabled === true,
		conditional_hidden_product_id: raw.conditional_hidden_product_id ?? null,
		conditional_hidden_adjustment: conditionalAdjustment,
		operator: "Admin Cestas",
	});
	if (!save.ok) return save;
	const savedRaw = rawEditor(save.data);
	const savedEditor = savedRaw ? mapEditor(savedRaw, summary) : null;
	if (!savedRaw || !savedEditor) return { ok: false, error: "unavailable" };
	return {
		ok: true,
		data: {
			editor: savedEditor,
			revision: revisionFor(savedRaw),
		},
	};
}

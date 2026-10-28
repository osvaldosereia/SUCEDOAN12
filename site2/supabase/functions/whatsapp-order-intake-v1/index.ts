import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const BODY_LIMIT_BYTES = 192_000;
const RPC_TIMEOUT_MS = 8_000;
const ORDER_CONFIRMATION_TEXT_LIMIT = 900;

type JsonRecord = Record<string, unknown>;

type CommonEvent = {
	kind: "catalog_order" | "flow_submission";
	messageId: string;
	metaPhoneNumberId: string;
	metaWabaId: string;
	senderPhoneE164: string | null;
	senderProviderId: string | null;
	replyToMessageId: string | null;
	issues: string[];
};

type CatalogEvent = CommonEvent & {
	kind: "catalog_order";
	catalogId: string | null;
	items: unknown[];
};

type FlowEvent = CommonEvent & {
	kind: "flow_submission";
	flowName: string | null;
	flowToken: string | null;
	responseJson: unknown;
	responseJsonValid: boolean;
};

type IntakeRequest = {
	sourceEventId: string;
	whatsappAccountId: string | null;
	conversationId?: string | null;
	customerId?: string | null;
	event: CatalogEvent | FlowEvent;
};

type NormalizedFlowOrderSubmission = {
	kind: "order";
	flowSessionId: string;
	items: JsonRecord[];
	paymentMethod: string | null;
	customerId: string | null;
	customerSnapshot: JsonRecord;
	deliverySnapshot: JsonRecord;
	reportedTotalCents: number | null;
};

type NormalizedCustomerReviewSubmission = {
	kind: "customer_review";
	flowSessionId: string;
	reasonCode: "customer_lookup_failed";
};

type NormalizedFlowSubmission =
	| NormalizedFlowOrderSubmission
	| NormalizedCustomerReviewSubmission;

type FlowCatalogSnapshot = {
	basketTemplateId: string;
	basketMoldId: string;
	positions: Array<{ id: string; optionProductIds: string[] }>;
};

type CurrentFlowQuote =
	| { ok: true; snapshot: JsonRecord }
	| { ok: false; issue: string };

const PAYMENT_METHODS = new Set([
	"pix",
	"cash",
	"debit_card",
	"credit_card",
	"food_card",
	"meal_card",
]);

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}

function readText(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= maxLength
		? normalized
		: null;
}

async function readBodyLimited(request: Request): Promise<string | null> {
	const declaredLength = Number(request.headers.get("Content-Length"));
	if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
		return null;
	}
	if (!request.body) return "";

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > BODY_LIMIT_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

function normalizeIssues(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((issue) => readText(issue, 64))
		.filter(
			(issue): issue is string => issue !== null && /^[a-z0-9_]+$/.test(issue),
		)
		.slice(0, 20);
}

function normalizeCatalogItems(value: unknown): {
	items: JsonRecord[];
	valid: boolean;
} {
	if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
		return { items: [], valid: false };
	}
	let valid = true;
	const items = value.map((raw): JsonRecord => {
		const item = isRecord(raw) ? raw : {};
		const retailerId = readText(item.retailerId, 256);
		const quantity =
			typeof item.quantity === "number" &&
			Number.isSafeInteger(item.quantity) &&
			item.quantity > 0
				? item.quantity
				: null;
		if (!retailerId || quantity === null) valid = false;
		return {
			retailer_id: retailerId,
			quantity,
		};
	});
	return { items, valid };
}

function normalizeFlowItems(value: unknown): JsonRecord[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > 100)
		return [];
	const result: JsonRecord[] = [];
	for (const raw of value) {
		if (!isRecord(raw) || !isUuid(raw.positionId) || !isUuid(raw.productId)) {
			return [];
		}
		if (
			typeof raw.quantity !== "number" ||
			!Number.isSafeInteger(raw.quantity) ||
			raw.quantity < 0 ||
			raw.quantity > 6
		) {
			return [];
		}
		result.push({
			position_id: raw.positionId,
			product_id: raw.productId,
			quantity: raw.quantity,
		});
	}
	return result;
}

function cleanFlowText(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 && normalized.length <= maxLength
		? normalized
		: null;
}

function normalizeFlowAddress(value: unknown): JsonRecord | null {
	if (!isRecord(value)) return null;
	const street = cleanFlowText(value.street, 180);
	const number = cleanFlowText(value.number, 40);
	const complement =
		value.complement == null || value.complement === ""
			? null
			: cleanFlowText(value.complement, 120);
	const neighborhood = cleanFlowText(value.neighborhood, 120);
	const city = cleanFlowText(value.city, 120);
	const state = cleanFlowText(value.state, 2)?.toUpperCase() ?? null;
	const postalCode = cleanFlowText(value.postal_code, 16);
	const reference =
		value.reference == null || value.reference === ""
			? null
			: cleanFlowText(value.reference, 180);
	if (
		!street ||
		!number ||
		!neighborhood ||
		!city ||
		!state ||
		!/^[A-Z]{2}$/.test(state) ||
		!postalCode ||
		(value.complement != null && value.complement !== "" && !complement) ||
		(value.reference != null && value.reference !== "" && !reference)
	) {
		return null;
	}
	return {
		street,
		number,
		complement,
		neighborhood,
		city,
		state,
		postal_code: postalCode,
		reference,
	};
}

function normalizeFlowSubmission(
	value: unknown,
): NormalizedFlowSubmission | null {
	if (!isRecord(value)) return null;
	const flowSessionId = isUuid(value.flow_session_id)
		? value.flow_session_id.toLowerCase()
		: null;
	if (value.request_human_review === true) {
		return flowSessionId
			? {
					kind: "customer_review",
					flowSessionId,
					reasonCode: "customer_lookup_failed",
				}
			: null;
	}
	const rawItems = Array.isArray(value.selected_items)
		? value.selected_items.map((item) => {
				if (!isRecord(item)) return item;
				return {
					positionId: item.position_id,
					productId: item.product_id,
					quantity:
						typeof item.quantity === "string" && /^[0-6]$/.test(item.quantity)
							? Number(item.quantity)
							: item.quantity,
				};
			})
		: null;
	const items = normalizeFlowItems(rawItems);
	const paymentMethod = readText(value.payment_method, 40);
	const customerId = isUuid(value.customer_id)
		? value.customer_id.toLowerCase()
		: null;
	const customerName = cleanFlowText(value.customer_name, 180);
	const addressId = isUuid(value.address_id)
		? value.address_id.toLowerCase()
		: null;
	const newAddress =
		value.new_address == null ? null : normalizeFlowAddress(value.new_address);
	const reportedTotalCents = value.total_cents;
	if (
		!flowSessionId ||
		items.length === 0 ||
		!paymentMethod ||
		!PAYMENT_METHODS.has(paymentMethod) ||
		!customerName ||
		(addressId !== null && newAddress !== null) ||
		(addressId === null && newAddress === null) ||
		typeof reportedTotalCents !== "number" ||
		!Number.isSafeInteger(reportedTotalCents) ||
		reportedTotalCents < 0
	) {
		return null;
	}
	return {
		kind: "order",
		flowSessionId,
		items,
		paymentMethod,
		customerId,
		customerSnapshot: { name: customerName },
		deliverySnapshot: {
			address_id: addressId,
			new_address: newAddress,
			formatted_label: cleanFlowText(value.delivery_address_text, 800),
		},
		reportedTotalCents,
	};
}

function readFlowCatalogSnapshot(value: unknown): FlowCatalogSnapshot | null {
	if (
		!isRecord(value) ||
		value.schema_version !== "sucedoan.whatsapp_flow_catalog.v1" ||
		!Array.isArray(value.positions) ||
		value.positions.length === 0 ||
		value.positions.length > 100
	) {
		return null;
	}
	const basketTemplateId = isUuid(value.basket_template_id)
		? value.basket_template_id.toLowerCase()
		: null;
	const basketMoldId = isUuid(value.basket_mold_id)
		? value.basket_mold_id.toLowerCase()
		: null;
	if (!basketTemplateId || !basketMoldId) return null;
	const positions: FlowCatalogSnapshot["positions"] = [];
	for (const rawPosition of value.positions) {
		if (!isRecord(rawPosition) || !Array.isArray(rawPosition.options))
			return null;
		const id = isUuid(rawPosition.id) ? rawPosition.id.toLowerCase() : null;
		if (
			!id ||
			rawPosition.options.length === 0 ||
			rawPosition.options.length > 8
		) {
			return null;
		}
		const optionProductIds = rawPosition.options.map((option) =>
			isRecord(option) && isUuid(option.product_id)
				? option.product_id.toLowerCase()
				: null,
		);
		if (optionProductIds.some((productId) => productId === null)) return null;
		positions.push({ id, optionProductIds: optionProductIds as string[] });
	}
	if (
		new Set(positions.map((position) => position.id)).size !== positions.length
	) {
		return null;
	}
	return { basketTemplateId, basketMoldId, positions };
}

function moneyToCents(value: unknown): number | null {
	const text =
		typeof value === "number" && Number.isFinite(value)
			? value.toString()
			: typeof value === "string"
				? value.trim()
				: "";
	const match = /^(0|[1-9][0-9]{0,9})(?:\.([0-9]{1,2}))?$/.exec(text);
	if (!match) return null;
	const cents =
		Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
	return Number.isSafeInteger(cents) ? cents : null;
}

function buildFlowConfirmationSummary(quote: JsonRecord): string | null {
	if (!Array.isArray(quote.items) || typeof quote.total_cents !== "number") {
		return null;
	}
	const lines: string[] = [];
	for (const item of quote.items) {
		if (!isRecord(item)) return null;
		if (item.quantity === 0) continue;
		const name = cleanFlowText(item.name, 180);
		if (
			!name ||
			typeof item.quantity !== "number" ||
			!Number.isSafeInteger(item.quantity) ||
			item.quantity < 1 ||
			item.quantity > 6
		) {
			return null;
		}
		lines.push(`${item.quantity} × ${name}`);
	}
	if (
		lines.length === 0 ||
		!Number.isSafeInteger(quote.total_cents) ||
		quote.total_cents < 0
	) {
		return null;
	}
	const total = new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(quote.total_cents / 100);
	const summary = [
		"Resumo do seu pedido:",
		...lines,
		"",
		`Total do pedido: ${total}`,
		"Confira os itens e toque em “Confirmar pedido” para enviar à separação.",
	].join("\n");
	return summary.length <= ORDER_CONFIRMATION_TEXT_LIMIT ? summary : null;
}

async function buildCurrentFlowQuote(
	supabase: SupabaseClient,
	snapshotValue: unknown,
	selections: JsonRecord[],
	reportedTotalCents: number | null,
): Promise<CurrentFlowQuote> {
	const snapshot = readFlowCatalogSnapshot(snapshotValue);
	if (!snapshot || selections.length !== snapshot.positions.length) {
		return { ok: false, issue: "flow_quote_snapshot_invalid" };
	}
	const positionById = new Map(
		snapshot.positions.map((position) => [position.id, position]),
	);
	const seenPositions = new Set<string>();
	const selectedProducts: Array<{
		positionId: string;
		productId: string;
		quantity: number;
	}> = [];
	for (const item of selections) {
		const positionId = readText(item.position_id, 64)?.toLowerCase() ?? null;
		const productId = readText(item.product_id, 64)?.toLowerCase() ?? null;
		const quantity = item.quantity;
		const position = positionId ? positionById.get(positionId) : null;
		if (
			!position ||
			!productId ||
			!isUuid(productId) ||
			seenPositions.has(positionId as string) ||
			!position.optionProductIds.includes(productId) ||
			typeof quantity !== "number" ||
			!Number.isSafeInteger(quantity) ||
			quantity < 0 ||
			quantity > 6
		) {
			return { ok: false, issue: "flow_quote_selection_invalid" };
		}
		seenPositions.add(positionId as string);
		selectedProducts.push({
			positionId: positionId as string,
			productId,
			quantity,
		});
	}
	if (seenPositions.size !== snapshot.positions.length) {
		return { ok: false, issue: "incomplete_flow_selection" };
	}
	if (!selectedProducts.some((item) => item.quantity > 0)) {
		return { ok: false, issue: "empty_flow_selection" };
	}

	const [moldResult, positionsResult] = await Promise.all([
		supabase
			.from("basket_molds")
			.select(
				"id,basket_id,hidden_adjustment,conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment",
			)
			.eq("id", snapshot.basketMoldId)
			.eq("basket_id", snapshot.basketTemplateId)
			.maybeSingle(),
		supabase
			.from("basket_mold_positions")
			.select("id")
			.eq("mold_id", snapshot.basketMoldId)
			.order("sort_order", { ascending: true })
			.order("id", { ascending: true }),
	]);
	if (moldResult.error || positionsResult.error || !moldResult.data) {
		return { ok: false, issue: "flow_quote_catalog_unavailable" };
	}
	const currentPositionIds = Array.isArray(positionsResult.data)
		? positionsResult.data.map((position) =>
				isRecord(position) && isUuid(position.id)
					? position.id.toLowerCase()
					: null,
			)
		: [];
	if (
		currentPositionIds.length !== snapshot.positions.length ||
		currentPositionIds.some(
			(id, index) => id === null || id !== snapshot.positions[index]?.id,
		)
	) {
		return { ok: false, issue: "flow_basket_structure_changed" };
	}
	const positionIds = currentPositionIds.filter(
		(id): id is string => id !== null,
	);
	const productIds = [
		...new Set(selectedProducts.map((item) => item.productId)),
	];
	const [optionsResult, productsResult] = await Promise.all([
		supabase
			.from("basket_mold_position_options")
			.select("position_id,product_id")
			.in("position_id", positionIds),
		supabase
			.from("products")
			.select("id,name,price,offer_price,is_offer,is_active,is_whatsapp_active")
			.in("id", productIds),
	]);
	if (optionsResult.error || productsResult.error) {
		return { ok: false, issue: "flow_quote_catalog_unavailable" };
	}
	const currentOptions = new Set(
		(Array.isArray(optionsResult.data) ? optionsResult.data : [])
			.filter(isRecord)
			.map(
				(option) =>
					`${String(option.position_id).toLowerCase()}:${String(option.product_id).toLowerCase()}`,
			),
	);
	for (const item of selectedProducts) {
		if (!currentOptions.has(`${item.positionId}:${item.productId}`)) {
			return { ok: false, issue: "flow_quote_option_no_longer_available" };
		}
	}

	const products = new Map<string, JsonRecord>();
	for (const row of Array.isArray(productsResult.data)
		? productsResult.data
		: []) {
		if (isRecord(row) && isUuid(row.id))
			products.set(row.id.toLowerCase(), row);
	}
	const items: JsonRecord[] = [];
	let itemsTotalCents = 0;
	let conditionalProductSelected = false;
	for (const item of selectedProducts) {
		const product = products.get(item.productId);
		const name = cleanFlowText(product?.name, 180);
		if (
			product?.is_active !== true ||
			product?.is_whatsapp_active !== true ||
			!name
		) {
			return { ok: false, issue: "flow_quote_product_unavailable" };
		}
		const offerNumeric = Number(product.offer_price);
		const hasApplicableOffer =
			product.is_offer === true &&
			product.offer_price !== null &&
			product.offer_price !== undefined &&
			Number.isFinite(offerNumeric) &&
			offerNumeric >= 0;
		const priceCents = moneyToCents(
			hasApplicableOffer ? product.offer_price : product.price,
		);
		if (priceCents === null) {
			return { ok: false, issue: "flow_quote_price_unavailable" };
		}
		const lineTotalCents = priceCents * item.quantity;
		if (!Number.isSafeInteger(lineTotalCents)) {
			return { ok: false, issue: "flow_quote_total_invalid" };
		}
		itemsTotalCents += lineTotalCents;
		if (!Number.isSafeInteger(itemsTotalCents)) {
			return { ok: false, issue: "flow_quote_total_invalid" };
		}
		if (
			item.quantity > 0 &&
			isUuid(moldResult.data.conditional_hidden_product_id) &&
			item.productId ===
				moldResult.data.conditional_hidden_product_id.toLowerCase()
		) {
			conditionalProductSelected = true;
		}
		items.push({
			position_id: item.positionId,
			product_id: item.productId,
			name,
			quantity: item.quantity,
			unit_price_cents: priceCents,
			line_total_cents: lineTotalCents,
		});
	}
	const fixedAdjustmentCents = moneyToCents(moldResult.data.hidden_adjustment);
	const conditionalAdjustmentCents = moneyToCents(
		moldResult.data.conditional_hidden_adjustment,
	);
	if (fixedAdjustmentCents === null || conditionalAdjustmentCents === null) {
		return { ok: false, issue: "flow_quote_pricing_unavailable" };
	}
	const conditionalAppliedCents =
		moldResult.data.conditional_hidden_enabled === true &&
		conditionalProductSelected
			? conditionalAdjustmentCents
			: 0;
	const totalCents =
		itemsTotalCents + fixedAdjustmentCents + conditionalAppliedCents;
	if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
		return { ok: false, issue: "flow_quote_total_invalid" };
	}
	return {
		ok: true,
		snapshot: {
			schema_version: "sucedoan.whatsapp_flow_quote.v1",
			basket_template_id: snapshot.basketTemplateId,
			basket_mold_id: snapshot.basketMoldId,
			currency: "BRL",
			calculated_at: new Date().toISOString(),
			items,
			items_total_cents: itemsTotalCents,
			fixed_hidden_adjustment_cents: fixedAdjustmentCents,
			conditional_hidden_adjustment_cents: conditionalAppliedCents,
			total_cents: totalCents,
			reported_total_matches: reportedTotalCents === totalCents,
		},
	};
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function randomConfirmationToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function buildConfirmationPayload(
	intentId: string,
	token: string,
	summary: string,
): JsonRecord {
	return {
		messaging_product: "whatsapp",
		recipient_type: "individual",
		type: "interactive",
		interactive: {
			type: "button",
			body: { text: summary },
			action: {
				buttons: [
					{
						type: "reply",
						reply: {
							id: `order-confirm-v1:${intentId}:${token}`,
							title: "Confirmar pedido",
						},
					},
				],
			},
		},
	};
}

function parseRequest(value: unknown): IntakeRequest | null {
	if (!isRecord(value) || !isRecord(value.event)) return null;
	const rawEvent = value.event;
	const kind = rawEvent.kind;
	if (kind !== "catalog_order" && kind !== "flow_submission") return null;

	const common = {
		kind,
		messageId: readText(rawEvent.messageId, 256),
		metaPhoneNumberId: readText(rawEvent.metaPhoneNumberId, 128),
		metaWabaId: readText(rawEvent.metaWabaId, 128),
		senderPhoneE164: readText(rawEvent.senderPhoneE164, 16),
		senderProviderId: readText(rawEvent.senderProviderId, 256),
		replyToMessageId: readText(rawEvent.replyToMessageId, 256),
		issues: normalizeIssues(rawEvent.issues),
	};
	if (!common.messageId || !common.metaPhoneNumberId || !common.metaWabaId) {
		return null;
	}
	if (
		common.senderPhoneE164 &&
		!/^\+[1-9][0-9]{7,14}$/.test(common.senderPhoneE164)
	) {
		return null;
	}
	if (!common.senderPhoneE164 && !common.senderProviderId) return null;

	const commonEvent = common as Omit<CommonEvent, "kind">;
	const event: CatalogEvent | FlowEvent =
		kind === "catalog_order"
			? {
					...commonEvent,
					kind,
					catalogId: readText(rawEvent.catalogId, 256),
					items: Array.isArray(rawEvent.items)
						? rawEvent.items.slice(0, 100)
						: [],
				}
			: {
					...commonEvent,
					kind,
					flowName: readText(rawEvent.flowName, 256),
					flowToken: readText(rawEvent.flowToken, 200),
					responseJson: rawEvent.responseJson,
					responseJsonValid: rawEvent.responseJsonValid === true,
				};

	return {
		sourceEventId: isUuid(value.sourceEventId) ? value.sourceEventId : "",
		whatsappAccountId: isUuid(value.whatsappAccountId)
			? value.whatsappAccountId.toLowerCase()
			: null,
		conversationId: isUuid(value.conversationId)
			? value.conversationId.toLowerCase()
			: null,
		customerId: isUuid(value.customerId)
			? value.customerId.toLowerCase()
			: null,
		event,
	};
}

function jsonResponse(body: JsonRecord, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

export default {
	fetch: withSupabase(
		{ auth: "secret" },
		async (request, { supabaseAdmin }) => {
			if (request.method !== "POST") return jsonResponse({ ok: false }, 405);

			const rawBody = await readBodyLimited(request);
			if (rawBody === null) return jsonResponse({ ok: false }, 413);
			let parsed: unknown;
			try {
				parsed = JSON.parse(rawBody) as unknown;
			} catch {
				return jsonResponse({ ok: false }, 400);
			}
			const input = parseRequest(parsed);
			if (!input?.sourceEventId) {
				return jsonResponse({ ok: false }, 422);
			}
			const accountResult = await supabaseAdmin
				.from("whatsapp_accounts")
				.select("id")
				.eq("phone_number_id", input.event.metaPhoneNumberId)
				.eq("waba_id", input.event.metaWabaId)
				.eq("is_active", true)
				.maybeSingle();
			const whatsappAccountId = isUuid(accountResult.data?.id)
				? accountResult.data.id.toLowerCase()
				: null;
			if (
				accountResult.error ||
				!whatsappAccountId ||
				(input.whatsappAccountId &&
					input.whatsappAccountId !== whatsappAccountId)
			) {
				return jsonResponse(
					{ ok: false, error: "unknown_whatsapp_account" },
					422,
				);
			}

			const issueFromParser = input.event.issues[0] ?? null;
			let intakeSnapshot: JsonRecord;
			let ingressIssueCode = issueFromParser;
			let catalogId: string | null = null;
			let flowName: string | null = null;
			let flowSessionId: string | null = null;
			let flowSchemaVersion: string | null = null;
			let conversationId = input.conversationId ?? null;
			let customerId = input.customerId ?? null;
			let sourceKind: "flow" | "catalog";

			if (input.event.kind === "catalog_order") {
				sourceKind = "catalog";
				catalogId = input.event.catalogId;
				const normalized = normalizeCatalogItems(input.event.items);
				const items = normalized.items;
				intakeSnapshot = {
					items,
				};
				if (!catalogId && !ingressIssueCode)
					ingressIssueCode = "missing_catalog_id";
				if (!normalized.valid && !ingressIssueCode)
					ingressIssueCode = "invalid_items";
			} else {
				sourceKind = "flow";
				flowName = input.event.flowName;
				customerId = null;
				let flowSubmission: NormalizedFlowSubmission | null = null;
				let flowSession: JsonRecord | null = null;
				let flowCatalogSnapshot: unknown = null;
				let serverQuote: JsonRecord | null = null;
				let flowConfirmationSummary: string | null = null;
				if (!input.event.responseJsonValid) {
					ingressIssueCode ??= "invalid_flow_response_json";
				} else {
					flowSubmission = normalizeFlowSubmission(input.event.responseJson);
					if (!flowSubmission) ingressIssueCode ??= "invalid_flow_submission";
				}
				if (
					input.event.flowToken &&
					/^[A-Za-z0-9_-]{32,128}$/.test(input.event.flowToken) &&
					input.event.senderPhoneE164
				) {
					const { data: resolved, error: resolveError } =
						await supabaseAdmin.rpc("whatsapp_flow_session_resolve_v1", {
							p_token_hash: await sha256Hex(input.event.flowToken),
						});
					if (!resolveError && isRecord(resolved) && resolved.ok === true) {
						flowSession = isRecord(resolved.session) ? resolved.session : null;
						flowCatalogSnapshot = resolved.snapshot;
					}
				}
				if (!flowSession && !ingressIssueCode)
					ingressIssueCode = input.event.flowToken
						? "flow_session_unresolved"
						: "flow_token_missing";

				if (flowSession) {
					const sessionId = isUuid(flowSession.id)
						? flowSession.id.toLowerCase()
						: null;
					const sessionCustomerId = isUuid(flowSession.customer_id)
						? flowSession.customer_id.toLowerCase()
						: null;
					const sessionConversationId = isUuid(flowSession.conversation_id)
						? flowSession.conversation_id.toLowerCase()
						: null;
					if (
						flowSession.whatsapp_account_id !== whatsappAccountId ||
						flowSession.meta_waba_id !== input.event.metaWabaId ||
						flowSession.meta_phone_number_id !==
							input.event.metaPhoneNumberId ||
						flowSession.sender_phone_e164 !== input.event.senderPhoneE164 ||
						!sessionId ||
						!flowSubmission ||
						flowSubmission.flowSessionId !== sessionId ||
						(flowSubmission.kind === "order" &&
							flowSubmission.customerId !== sessionCustomerId) ||
						(input.conversationId &&
							sessionConversationId &&
							input.conversationId !== sessionConversationId)
					) {
						ingressIssueCode ??= "flow_session_channel_mismatch";
					} else {
						flowSessionId = sessionId;
						flowSchemaVersion = readText(flowSession.flow_schema_version, 32);
						conversationId = sessionConversationId ?? conversationId;
						customerId =
							flowSubmission.kind === "order" ? sessionCustomerId : null;
					}
				}
				if (!flowName && !ingressIssueCode)
					ingressIssueCode = "flow_identity_unresolved";
				if (!flowSchemaVersion && !ingressIssueCode)
					ingressIssueCode = "flow_schema_version_unresolved";
				const customerReviewSubmission =
					flowSubmission?.kind === "customer_review" ? flowSubmission : null;
				if (customerReviewSubmission) {
					if (!ingressIssueCode && flowSessionId) {
						ingressIssueCode = "customer_review_requested";
					}
					intakeSnapshot = {
						customer_review: {
							reason_code: customerReviewSubmission.reasonCode,
						},
					};
				} else {
					const orderSubmission =
						flowSubmission?.kind === "order" ? flowSubmission : null;
					const items = orderSubmission?.items ?? [];
					if (items.length === 0 && !ingressIssueCode) {
						ingressIssueCode = "flow_schema_adapter_unavailable";
					} else if (
						items.length > 0 &&
						!items.some((item) => item.quantity !== 0) &&
						!ingressIssueCode
					) {
						ingressIssueCode = "empty_flow_selection";
					}
					if (
						!ingressIssueCode &&
						orderSubmission &&
						flowSession &&
						flowCatalogSnapshot
					) {
						const quote = await buildCurrentFlowQuote(
							supabaseAdmin,
							flowCatalogSnapshot,
							orderSubmission.items,
							orderSubmission.reportedTotalCents,
						);
						if (quote.ok) {
							const summary = buildFlowConfirmationSummary(quote.snapshot);
							if (summary) {
								serverQuote = quote.snapshot;
								flowConfirmationSummary = summary;
							} else {
								ingressIssueCode ??= "flow_confirmation_summary_invalid";
							}
						} else ingressIssueCode ??= quote.issue;
					} else if (!ingressIssueCode) {
						ingressIssueCode = "flow_quote_snapshot_unavailable";
					}
					intakeSnapshot = {
						items,
						server_quote: serverQuote,
						confirmation_summary_text: flowConfirmationSummary,
						payment_method: orderSubmission?.paymentMethod ?? null,
						customer_snapshot: orderSubmission?.customerSnapshot ?? {},
						delivery_snapshot: orderSubmission?.deliverySnapshot ?? {},
						flow_reported_total_cents:
							orderSubmission?.reportedTotalCents ?? null,
					};
				}
			}

			const { data, error } = await supabaseAdmin
				.rpc("whatsapp_order_intent_ingest_v1", {
					p_source_event_id: input.sourceEventId,
					p_whatsapp_account_id: whatsappAccountId,
					p_meta_waba_id: input.event.metaWabaId,
					p_meta_phone_number_id: input.event.metaPhoneNumberId,
					p_meta_message_id: input.event.messageId,
					p_source_kind: sourceKind,
					p_sender_provider_id: input.event.senderProviderId,
					p_sender_phone_e164: input.event.senderPhoneE164,
					p_catalog_id: catalogId,
					p_flow_name: flowName,
					p_flow_session_id: flowSessionId,
					p_flow_reply_to_message_id: input.event.replyToMessageId,
					p_flow_schema_version: flowSchemaVersion,
					p_intake_snapshot: intakeSnapshot,
					p_conversation_id: conversationId,
					p_customer_id: customerId,
					p_ingress_issue_code: ingressIssueCode,
				})
				.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));

			if (error || !isRecord(data) || data.ok !== true) {
				return jsonResponse(
					{ ok: false, error: "order_intake_persist_failed" },
					503,
				);
			}
			const intentId = isUuid(data.intent_id)
				? data.intent_id.toLowerCase()
				: null;
			let intentStatus = readText(data.status, 40);
			let confirmationOutboxId: string | null = null;
			let confirmationDeliveryStatus: string | null = null;
			if (
				sourceKind === "flow" &&
				intentId &&
				(intentStatus === "received" ||
					intentStatus === "awaiting_confirmation")
			) {
				const summary = readText(intakeSnapshot.confirmation_summary_text, 900);
				const token = randomConfirmationToken();
				const payload = summary
					? buildConfirmationPayload(intentId, token, summary)
					: {};
				const [tokenHash, summaryHash] = await Promise.all([
					sha256Hex(token),
					sha256Hex(summary ?? ""),
				]);
				const { data: confirmationData, error: confirmationError } =
					await supabaseAdmin
						.rpc("whatsapp_order_intent_prepare_confirmation_v1", {
							p_intent_id: intentId,
							p_confirmation_token_hash: tokenHash,
							p_summary_hash: summaryHash,
							p_confirmation_payload: payload,
						})
						.abortSignal(AbortSignal.timeout(RPC_TIMEOUT_MS));
				if (
					confirmationError ||
					!isRecord(confirmationData) ||
					confirmationData.ok !== true
				) {
					return jsonResponse(
						{ ok: false, error: "order_confirmation_prepare_failed" },
						503,
					);
				}
				intentStatus = readText(confirmationData.status, 40);
				confirmationOutboxId = isUuid(confirmationData.outbox_id)
					? confirmationData.outbox_id.toLowerCase()
					: null;
				if (intentStatus === "awaiting_confirmation") {
					if (!confirmationOutboxId) {
						return jsonResponse(
							{ ok: false, error: "order_confirmation_outbox_missing" },
							503,
						);
					}
					const { data: delivery, error: deliveryError } =
						await supabaseAdmin.functions.invoke(
							"whatsapp-order-confirmation-sender-v1",
							{ body: { outboxId: confirmationOutboxId } },
						);
					if (deliveryError || !isRecord(delivery) || delivery.ok !== true) {
						return jsonResponse(
							{ ok: false, error: "order_confirmation_dispatch_failed" },
							503,
						);
					}
					confirmationDeliveryStatus = readText(delivery.status, 40);
					if (
						confirmationDeliveryStatus === "needs_review" ||
						confirmationDeliveryStatus === "delivery_unknown" ||
						confirmationDeliveryStatus === "failed" ||
						confirmationDeliveryStatus === "sent_needs_review"
					) {
						intentStatus = "needs_review";
					}
				}
			}
			return jsonResponse({
				ok: true,
				intent_id: intentId,
				status: intentStatus,
				confirmation_outbox_id: confirmationOutboxId,
				confirmation_delivery_status: confirmationDeliveryStatus,
				duplicate: data.duplicate === true,
			});
		},
	),
};

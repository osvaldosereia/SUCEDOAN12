import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import {
	type DecryptedFlowRequest,
	decryptMetaFlowRequest,
	encryptMetaFlowResponse,
	FlowCryptoError,
	verifyMetaFlowSignature,
	verifyMetaFlowTokenSignature,
} from "../_shared/flow-encryption.ts";
import { loadFlowImageAsset } from "../_shared/flow-image-assets.ts";
import { toMetaFlowImageDataUri } from "../_shared/flow-image-format.ts";

const BODY_LIMIT_BYTES = 350_000;
const RESPONSE_LIMIT_BYTES = 800_000;
const MAX_OPTIONS_PER_POSITION = 8;
const ROUTABLE_ACCOUNTS = new Set(["dona-antonia-0975", "dona-antonia-1018"]);
const APP_SECRET_ENV_BY_ACCOUNT: Record<string, string> = {
	"dona-antonia-0975": "META_WHATSAPP_APP_SECRET_0975",
	"dona-antonia-1018": "META_WHATSAPP_APP_SECRET_1018",
};
const PAYMENT_LABELS: Record<string, string> = {
	cash: "Dinheiro",
	debit_card: "Cartão de débito",
	credit_card: "Cartão de crédito",
	food_card: "Vale-alimentação",
	meal_card: "Vale-refeição",
	pix: "Pix",
};

type JsonRecord = Record<string, unknown>;
type SupabaseAdminClient = SupabaseClient;
type FlowOption = {
	product_id: string;
	name: string;
	image_url: string;
	price_cents: number;
	sort_order: number;
};
type FlowPosition = {
	id: string;
	label: string;
	sort_order: number;
	options: FlowOption[];
};
type FlowSelection = {
	position_id: string;
	product_id: string;
	quantity: number;
};
type FlowSession = {
	id: string;
	whatsapp_account_id: string;
	meta_waba_id: string;
	meta_phone_number_id: string;
	meta_flow_id: string;
	flow_schema_version: string;
	data_api_version: string;
	basket_template_id: string;
	basket_mold_id: string;
	sender_phone_e164: string;
	conversation_id: string | null;
	customer_id: string | null;
	expires_at: string;
};
type FlowSnapshot = {
	schema_version: string;
	basket_template_id: string;
	basket_mold_id: string;
	hidden_adjustment_cents: number;
	conditional_hidden_enabled: boolean;
	conditional_hidden_product_id: string | null;
	conditional_hidden_adjustment_cents: number;
	positions: FlowPosition[];
};

class FlowTokenError extends Error {
	constructor(
		readonly code:
			| "flow_token_required"
			| "flow_token_signature_invalid"
			| "flow_session_unavailable"
			| "flow_session_channel_mismatch",
	) {
		super(code);
		this.name = "FlowTokenError";
	}
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maximum: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = value
		.split("")
		.map((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 127 ? " " : character;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 && normalized.length <= maximum
		? normalized
		: null;
}

function readInteger(
	value: unknown,
	minimum: number,
	maximum: number,
): number | null {
	if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
	return value >= minimum && value <= maximum ? value : null;
}

function readQuantity(value: unknown): number | null {
	if (typeof value === "number") return readInteger(value, 0, 6);
	if (typeof value === "string" && /^[0-6]$/.test(value)) return Number(value);
	return null;
}

function readFlowIndex(
	value: unknown,
	minimum: number,
	maximum: number,
): number | null {
	if (typeof value === "string" && /^\d{1,3}$/.test(value)) {
		return readInteger(Number(value), minimum, maximum);
	}
	return readInteger(value, minimum, maximum);
}

async function readBodyLimited(request: Request): Promise<Uint8Array | null> {
	const declaredLength = Number(request.headers.get("Content-Length"));
	if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES) {
		return null;
	}
	if (!request.body) return new Uint8Array();

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (length > BODY_LIMIT_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
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

function plain(body: string, status = 200): Response {
	return new Response(body, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}

function centsLabel(cents: number): string {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(cents / 100);
}

function safeSnapshot(value: unknown): FlowSnapshot | null {
	if (!isRecord(value) || !Array.isArray(value.positions)) return null;
	if (
		value.schema_version !== "sucedoan.whatsapp_flow_catalog.v1" ||
		value.positions.length === 0 ||
		value.positions.length > 100
	) {
		return null;
	}

	const positions: FlowPosition[] = [];
	for (const rawPosition of value.positions) {
		if (!isRecord(rawPosition) || !Array.isArray(rawPosition.options))
			return null;
		const id = readText(rawPosition.id, 64);
		const label = readText(rawPosition.label, 120);
		const sortOrder = readInteger(rawPosition.sort_order, 0, 1_000_000);
		if (
			!id ||
			!label ||
			sortOrder === null ||
			rawPosition.options.length === 0 ||
			rawPosition.options.length > MAX_OPTIONS_PER_POSITION
		) {
			return null;
		}
		const options: FlowOption[] = [];
		for (const rawOption of rawPosition.options) {
			if (!isRecord(rawOption)) return null;
			const productId = readText(rawOption.product_id, 64);
			const name = readText(rawOption.name, 180);
			const imageUrl = readText(rawOption.image_url, 2_048);
			const priceCents = readInteger(rawOption.price_cents, 0, 999_999_999);
			const optionSortOrder = readInteger(rawOption.sort_order, 0, 1_000_000);
			if (
				!productId ||
				!name ||
				!imageUrl ||
				priceCents === null ||
				optionSortOrder === null
			) {
				return null;
			}
			options.push({
				product_id: productId,
				name,
				image_url: imageUrl,
				price_cents: priceCents,
				sort_order: optionSortOrder,
			});
		}
		positions.push({ id, label, sort_order: sortOrder, options });
	}

	const fixedAdjustment = readInteger(
		value.hidden_adjustment_cents,
		0,
		999_999_999,
	);
	const conditionalAdjustment = readInteger(
		value.conditional_hidden_adjustment_cents,
		0,
		999_999_999,
	);
	if (fixedAdjustment === null || conditionalAdjustment === null) return null;
	return {
		schema_version: "sucedoan.whatsapp_flow_catalog.v1",
		basket_template_id: readText(value.basket_template_id, 64) ?? "",
		basket_mold_id: readText(value.basket_mold_id, 64) ?? "",
		hidden_adjustment_cents: fixedAdjustment,
		conditional_hidden_enabled: value.conditional_hidden_enabled === true,
		conditional_hidden_product_id:
			readText(value.conditional_hidden_product_id, 64) ?? null,
		conditional_hidden_adjustment_cents: conditionalAdjustment,
		positions,
	};
}

function safeSession(value: unknown): FlowSession | null {
	if (!isRecord(value)) return null;
	const id = readText(value.id, 64);
	const accountId = readText(value.whatsapp_account_id, 64);
	const wabaId = readText(value.meta_waba_id, 128);
	const phoneNumberId = readText(value.meta_phone_number_id, 128);
	const flowId = readText(value.meta_flow_id, 128);
	const schemaVersion = readText(value.flow_schema_version, 32);
	const dataApiVersion = readText(value.data_api_version, 32);
	const basketId = readText(value.basket_template_id, 64);
	const moldId = readText(value.basket_mold_id, 64);
	const senderPhone = readText(value.sender_phone_e164, 16);
	const expiresAt = readText(value.expires_at, 64);
	if (
		!id ||
		!accountId ||
		!wabaId ||
		!phoneNumberId ||
		!flowId ||
		!schemaVersion ||
		!dataApiVersion ||
		!basketId ||
		!moldId ||
		!senderPhone ||
		!expiresAt
	) {
		return null;
	}
	return {
		id,
		whatsapp_account_id: accountId,
		meta_waba_id: wabaId,
		meta_phone_number_id: phoneNumberId,
		meta_flow_id: flowId,
		flow_schema_version: schemaVersion,
		data_api_version: dataApiVersion,
		basket_template_id: basketId,
		basket_mold_id: moldId,
		sender_phone_e164: senderPhone,
		conversation_id: readText(value.conversation_id, 64),
		customer_id: readText(value.customer_id, 64),
		expires_at: expiresAt,
	};
}

function normalizeSelections(
	value: unknown,
	positions: FlowPosition[],
	count: number,
): FlowSelection[] | null {
	if (
		!Array.isArray(value) ||
		value.length !== count ||
		count > positions.length
	) {
		return null;
	}
	const selections: FlowSelection[] = [];
	for (let index = 0; index < count; index += 1) {
		const raw = value[index];
		const position = positions[index];
		if (!isRecord(raw) || !position) return null;
		const positionId = readText(raw.position_id, 64);
		const productId = readText(raw.product_id, 64);
		const quantity = readInteger(raw.quantity, 0, 6);
		if (
			positionId !== position.id ||
			!productId ||
			quantity === null ||
			!position.options.some((option) => option.product_id === productId)
		) {
			return null;
		}
		selections.push({
			position_id: positionId,
			product_id: productId,
			quantity,
		});
	}
	return selections;
}

async function positionOptionImages(
	options: FlowOption[],
	supabaseUrl: string,
): Promise<Map<string, string> | null> {
	const loaded = await Promise.all(
		options.map(async (option) => ({
			productId: option.product_id,
			result: await loadFlowImageAsset(option.image_url, supabaseUrl),
		})),
	);
	const images = new Map<string, string>();
	for (const entry of loaded) {
		if (!entry.result.ok) return null;
		const image = await toMetaFlowImageDataUri(entry.result.asset);
		if (!image) return null;
		images.set(entry.productId, image);
	}
	return images;
}

async function basketProductResponse(
	position: FlowPosition,
	positionIndex: number,
	positions: FlowPosition[],
	selectedItems: FlowSelection[],
	selectedProductId: string | null,
	selectedQuantity: number | null,
	supabaseUrl: string,
	selectionError = "",
): Promise<JsonRecord> {
	const optionImages = await positionOptionImages(
		position.options,
		supabaseUrl,
	);
	if (!optionImages) throw new Error("flow_product_image_unavailable");
	const productOptions = position.options.map((option) => {
		const imageDataUri = optionImages.get(option.product_id);
		if (!imageDataUri) throw new Error("flow_product_image_unavailable");
		const image = imageDataUri.slice(imageDataUri.indexOf(",") + 1);
		const title =
			option.name.length > 30
				? `${option.name.slice(0, 29).trimEnd()}…`
				: option.name;
		return {
			id: option.product_id,
			title,
			description: centsLabel(option.price_cents),
			enabled: true,
			image,
			"alt-text": option.name.slice(0, 100),
		};
	});
	return {
		screen: "BASKET_PRODUCT",
		data: {
			position_index: positionIndex,
			position_number: positionIndex + 1,
			position_count: positions.length,
			position_progress_label: `Etapa ${positionIndex + 1} de ${positions.length}`,
			position_label: position.label,
			product_options: productOptions,
			quantity_options: [0, 1, 2, 3, 4, 5, 6].map((quantity) => ({
				id: String(quantity),
				title: String(quantity),
				enabled: true,
			})),
			selected_product_id: selectedProductId ?? "",
			initial_product_id: selectedProductId ?? "",
			selected_quantity:
				selectedProductId && selectedQuantity !== null
					? String(selectedQuantity)
					: "",
			selected_items: selectedItems,
			selection_error: selectionError,
		},
	};
}

function normalizeAddress(value: JsonRecord): JsonRecord | null {
	const street = readText(value.street, 180);
	const number = readText(value.number, 40);
	const neighborhood = readText(value.neighborhood, 120);
	const city = readText(value.city, 120);
	const state = readText(value.state, 2)?.toUpperCase() ?? null;
	const postalCode = readText(value.postal_code, 16);
	const complementText =
		value.complement == null ? "" : readText(value.complement, 120);
	const referenceText =
		value.reference == null ? "" : readText(value.reference, 180);
	const complement = complementText ?? "";
	const reference = referenceText ?? "";
	if (
		!street ||
		!number ||
		!neighborhood ||
		!city ||
		!state ||
		!postalCode ||
		!/^[A-Z]{2}$/.test(state) ||
		(complementText === null &&
			value.complement != null &&
			value.complement !== "") ||
		(referenceText === null &&
			value.reference != null &&
			value.reference !== "")
	) {
		return null;
	}
	return {
		street,
		number,
		complement: complement || null,
		neighborhood,
		city,
		state,
		postal_code: postalCode,
		reference: reference || null,
	};
}

function addressLabel(address: JsonRecord): string {
	return [
		[address.street, address.number].filter(Boolean).join(", "),
		address.complement,
		address.neighborhood,
		[address.city, address.state].filter(Boolean).join("/"),
		address.postal_code,
	]
		.filter(Boolean)
		.join(" · ");
}

function totalCents(
	snapshot: FlowSnapshot,
	selections: FlowSelection[],
): number | null {
	const optionById = new Map(
		snapshot.positions.flatMap((position) =>
			position.options.map((option) => [option.product_id, option] as const),
		),
	);
	let total = snapshot.hidden_adjustment_cents;
	let conditionalApplies = false;
	for (const selection of selections) {
		const option = optionById.get(selection.product_id);
		if (!option) return null;
		total += option.price_cents * selection.quantity;
		if (
			selection.quantity > 0 &&
			selection.product_id === snapshot.conditional_hidden_product_id
		) {
			conditionalApplies = true;
		}
	}
	if (snapshot.conditional_hidden_enabled && conditionalApplies) {
		total += snapshot.conditional_hidden_adjustment_cents;
	}
	return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function emptyAddress(): JsonRecord {
	return {
		street: "",
		number: "",
		complement: "",
		neighborhood: "",
		city: "",
		state: "",
		postal_code: "",
		reference: "",
	};
}

function customerReviewResponse(
	flowSessionId: string,
	selections: FlowSelection[],
	method: string,
): JsonRecord {
	return {
		screen: "CUSTOMER_REVIEW",
		data: {
			flow_session_id: flowSessionId,
			selected_items: selections,
			payment_method: method,
			review_message:
				"Não conseguimos confirmar seu cadastro agora. Envie uma mensagem nesta conversa para continuar com a equipe.",
		},
	};
}

function newAddressResponse(
	flowSessionId: string,
	selections: FlowSelection[],
	method: string,
	customerId: string | null,
	customerName: string,
): JsonRecord {
	const address = emptyAddress();
	return {
		screen: "CUSTOMER_NEW_ADDRESS",
		data: {
			flow_session_id: flowSessionId,
			selected_items: selections,
			payment_method: method,
			payment_label: PAYMENT_LABELS[method],
			customer_id: customerId ?? "",
			customer_name: customerName,
			customer_name_editable: customerId === null,
			new_address: address,
			...address,
		},
	};
}

function orderReviewResponse(
	snapshot: FlowSnapshot,
	flowSessionId: string,
	selections: FlowSelection[],
	method: string,
	customerId: string | null,
	customerName: string,
	addressId: string | null,
	address: JsonRecord,
): JsonRecord {
	const total = totalCents(snapshot, selections);
	if (total === null) throw new Error("flow_total_unavailable");
	const submittedAddress = addressId
		? emptyAddress()
		: {
				...address,
				complement: address.complement ?? "",
				reference: address.reference ?? "",
			};

	const optionById = new Map(
		snapshot.positions.flatMap((position) =>
			position.options.map((option) => [option.product_id, option] as const),
		),
	);
	const productSummary = selections
		.filter((selection) => selection.quantity > 0)
		.map((selection) => {
			const option = optionById.get(selection.product_id);
			return option ? `${selection.quantity}x ${option.name}` : null;
		})
		.filter((value): value is string => value !== null);

	return {
		screen: "ORDER_REVIEW",
		data: {
			flow_session_id: flowSessionId,
			selected_items: selections,
			payment_method: method,
			payment_label: PAYMENT_LABELS[method],
			customer_id: customerId ?? "",
			customer_name: customerName,
			address_id: addressId ?? "",
			new_address: submittedAddress,
			product_summary: productSummary,
			product_summary_text: productSummary.join("\n"),
			total_cents: total,
			total_label: centsLabel(total),
			delivery_address_text: addressLabel(address),
		},
	};
}

async function loadCustomerContext(
	supabase: SupabaseAdminClient,
	customerId: string | null,
): Promise<JsonRecord> {
	if (!customerId) {
		return {
			customer_mode: "new",
			customer_id: "",
			customer_name: "",
			address_options: [],
			selected_address_id: "",
			address_confirmation_required: false,
		};
	}

	const customerResult = await supabase
		.from("customers")
		.select("id,name,is_active")
		.eq("id", customerId)
		.eq("is_active", true)
		.maybeSingle();
	if (customerResult.error || !customerResult.data) {
		return {
			customer_mode: "review",
			customer_id: "",
			customer_name: "",
			address_options: [],
			selected_address_id: "",
			address_confirmation_required: false,
		};
	}
	const customerName = readText(customerResult.data.name, 180);
	if (!customerName) {
		return {
			customer_mode: "review",
			customer_id: "",
			customer_name: "",
			address_options: [],
			selected_address_id: "",
			address_confirmation_required: false,
		};
	}

	const addressResult = await supabase
		.from("customer_addresses")
		.select(
			"id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_default",
		)
		.eq("customer_id", customerId)
		.eq("is_active", true)
		.order("is_default", { ascending: false })
		.order("created_at", { ascending: false });
	if (addressResult.error) throw new Error("customer_address_lookup_failed");
	const rows = Array.isArray(addressResult.data) ? addressResult.data : [];
	const defaults = rows.filter((row) => row.is_default === true);
	const automaticAddress =
		defaults.length === 1 ? defaults[0] : rows.length === 1 ? rows[0] : null;
	const addressOptions = rows.map((row) => {
		const address = normalizeAddress(row as JsonRecord);
		return address
			? {
					id: row.id,
					title: readText(row.label, 30) ?? address.street,
					description: addressLabel(address).slice(0, 300),
				}
			: null;
	});
	if (addressOptions.some((option) => option === null)) {
		throw new Error("customer_address_incomplete");
	}
	if (rows.length > 0) {
		addressOptions.push({
			id: "new",
			title: "Cadastrar outro endereço",
			description: "Informar outro endereço para este pedido",
		});
	}

	return {
		customer_mode: rows.length === 0 ? "new_address" : "existing",
		customer_id: customerResult.data.id,
		customer_name: customerName,
		address_options: addressOptions,
		selected_address_id:
			automaticAddress && readText(automaticAddress.id, 64)
				? automaticAddress.id
				: "",
		address_confirmation_required: rows.length > 0,
	};
}

async function handleFlowAction(
	supabase: SupabaseAdminClient,
	decrypted: DecryptedFlowRequest,
	account: JsonRecord,
	supabaseUrl: string,
	appSecret: string,
): Promise<JsonRecord> {
	const body = decrypted.body;
	const action = readText(body.action, 80);
	const version = readText(body.version, 32);
	if (action === "ping") return { data: { status: "active" } };
	if (isRecord(body.data) && body.data.error) {
		return { data: { acknowledged: true } };
	}

	const flowToken = readText(body.flow_token, 200);
	if (!flowToken || !/^[A-Za-z0-9_-]{32,128}$/.test(flowToken)) {
		throw new FlowTokenError("flow_token_required");
	}
	if (
		body.flow_token_signature !== undefined &&
		!(await verifyMetaFlowTokenSignature(
			body.flow_token_signature,
			flowToken,
			appSecret,
		))
	) {
		throw new FlowTokenError("flow_token_signature_invalid");
	}
	const { data: resolved, error: resolveError } = await supabase.rpc(
		"whatsapp_flow_session_resolve_v1",
		{ p_token_hash: await sha256Hex(flowToken) },
	);
	if (resolveError || !isRecord(resolved) || resolved.ok !== true) {
		throw new FlowTokenError("flow_session_unavailable");
	}
	const session = safeSession(resolved.session);
	const snapshot = safeSnapshot(resolved.snapshot);
	if (
		!session ||
		!snapshot ||
		!version ||
		session.data_api_version !== version ||
		session.whatsapp_account_id !== account.whatsapp_account_id ||
		session.meta_phone_number_id !== account.meta_phone_number_id ||
		session.meta_waba_id !== account.meta_waba_id ||
		session.basket_template_id !== snapshot.basket_template_id ||
		session.basket_mold_id !== snapshot.basket_mold_id
	) {
		throw new FlowTokenError("flow_session_channel_mismatch");
	}

	const screen = readText(body.screen, 64);
	const data = isRecord(body.data) ? body.data : {};
	if (action === "INIT") {
		const firstPosition = snapshot.positions[0];
		if (!firstPosition?.options[0]) {
			throw new Error("flow_position_unavailable");
		}
		return basketProductResponse(
			firstPosition,
			0,
			snapshot.positions,
			[],
			null,
			0,
			supabaseUrl,
		);
	}
	if (action !== "data_exchange" && action !== "BACK") {
		throw new Error("flow_action_unsupported");
	}

	const componentAction =
		action === "BACK" ? "back" : readText(data.component_action, 40);
	const selectedItemsRaw = data.selected_items;
	if (screen === "BASKET_PRODUCT") {
		const positionIndex = readFlowIndex(
			data.position_index,
			0,
			snapshot.positions.length - 1,
		);
		if (positionIndex === null) throw new Error("flow_position_unavailable");
		const selectedItems = normalizeSelections(
			selectedItemsRaw,
			snapshot.positions,
			positionIndex,
		);
		if (!selectedItems) throw new Error("flow_selection_incomplete");
		const position = snapshot.positions[positionIndex];
		if (componentAction === "back") {
			if (positionIndex === 0) throw new Error("flow_back_unavailable");
			const previousIndex = positionIndex - 1;
			const previousSelection = selectedItems[previousIndex];
			return basketProductResponse(
				snapshot.positions[previousIndex],
				previousIndex,
				snapshot.positions,
				selectedItems.slice(0, previousIndex),
				previousSelection.product_id,
				previousSelection.quantity,
				supabaseUrl,
			);
		}
		if (componentAction === "product_changed") {
			const productId = readText(data.selected_product_id, 64);
			if (
				!productId ||
				!position.options.some((option) => option.product_id === productId)
			) {
				throw new Error("flow_product_not_offered");
			}
			const initialProductId = readText(data.initial_product_id, 64);
			const productChanged =
				initialProductId !== null && initialProductId !== productId;
			return basketProductResponse(
				position,
				positionIndex,
				snapshot.positions,
				selectedItems,
				productId,
				productChanged ? null : readQuantity(data.selected_quantity),
				supabaseUrl,
				productChanged
					? "Produto alterado. Escolha novamente a quantidade."
					: "",
			);
		}
		if (componentAction !== "next") throw new Error("flow_action_unsupported");
		const productId = readText(data.selected_product_id, 64);
		if (
			!productId ||
			!position.options.some((option) => option.product_id === productId)
		) {
			throw new Error("flow_product_not_offered");
		}
		const initialProductId = readText(data.initial_product_id, 64);
		if (
			initialProductId &&
			initialProductId !== productId &&
			position.options.some((option) => option.product_id === initialProductId)
		) {
			return basketProductResponse(
				position,
				positionIndex,
				snapshot.positions,
				selectedItems,
				productId,
				null,
				supabaseUrl,
				"O produto mudou. Escolha novamente a quantidade para continuar.",
			);
		}
		const quantity = readQuantity(data.selected_quantity);
		if (quantity === null) {
			throw new Error("flow_action_unsupported");
		}
		const nextItems = [
			...selectedItems,
			{
				position_id: position.id,
				product_id: productId,
				quantity,
			},
		];
		const nextIndex = positionIndex + 1;
		if (nextIndex < snapshot.positions.length) {
			const nextPosition = snapshot.positions[nextIndex];
			if (!nextPosition?.options[0]) {
				throw new Error("flow_position_unavailable");
			}
			return basketProductResponse(
				nextPosition,
				nextIndex,
				snapshot.positions,
				nextItems,
				null,
				0,
				supabaseUrl,
			);
		}
		if (!nextItems.some((selection) => selection.quantity > 0)) {
			return basketProductResponse(
				position,
				positionIndex,
				snapshot.positions,
				selectedItems,
				productId,
				quantity,
				supabaseUrl,
				"Escolha pelo menos um produto para continuar.",
			);
		}

		const methods = Object.keys(PAYMENT_LABELS).sort();
		return {
			screen: "PAYMENT",
			data: {
				selected_items: nextItems,
				payment_method: "",
				payment_methods: methods.map((method) => ({
					id: method,
					title: PAYMENT_LABELS[method],
				})),
			},
		};
	}

	if (screen === "PAYMENT") {
		const selections = normalizeSelections(
			selectedItemsRaw,
			snapshot.positions,
			snapshot.positions.length,
		);
		if (!selections) throw new Error("flow_selection_incomplete");
		if (!selections.some((selection) => selection.quantity > 0)) {
			throw new Error("flow_empty_selection");
		}
		if (componentAction === "back") {
			const lastIndex = snapshot.positions.length - 1;
			const lastSelection = selections[lastIndex];
			return basketProductResponse(
				snapshot.positions[lastIndex],
				lastIndex,
				snapshot.positions,
				selections.slice(0, lastIndex),
				lastSelection.product_id,
				lastSelection.quantity,
				supabaseUrl,
			);
		}
		const method = readText(data.payment_method, 40);
		if (
			componentAction !== "continue" ||
			!method ||
			!(method in PAYMENT_LABELS)
		) {
			throw new Error("flow_payment_method_invalid");
		}
		const customer = await loadCustomerContext(supabase, session.customer_id);
		if (customer.customer_mode === "review") {
			return customerReviewResponse(session.id, selections, method);
		}
		if (customer.customer_mode !== "existing") {
			return newAddressResponse(
				session.id,
				selections,
				method,
				session.customer_id,
				readText(customer.customer_name, 180) ?? "",
			);
		}
		return {
			screen: "CUSTOMER_ADDRESS",
			data: {
				selected_items: selections,
				payment_method: method,
				payment_label: PAYMENT_LABELS[method],
				...customer,
			},
		};
	}

	if (screen === "CUSTOMER_ADDRESS") {
		const selections = normalizeSelections(
			selectedItemsRaw,
			snapshot.positions,
			snapshot.positions.length,
		);
		if (!selections) throw new Error("flow_selection_incomplete");
		if (!selections.some((selection) => selection.quantity > 0)) {
			throw new Error("flow_empty_selection");
		}
		const method = readText(data.payment_method, 40);
		if (!method || !(method in PAYMENT_LABELS)) {
			throw new Error("flow_payment_method_invalid");
		}
		if (componentAction === "back") {
			const methods = Object.keys(PAYMENT_LABELS).sort();
			return {
				screen: "PAYMENT",
				data: {
					selected_items: selections,
					payment_method: method,
					payment_methods: methods.map((candidate) => ({
						id: candidate,
						title: PAYMENT_LABELS[candidate],
					})),
				},
			};
		}
		if (componentAction !== "review_order")
			throw new Error("flow_action_unsupported");

		const customer = await loadCustomerContext(supabase, session.customer_id);
		if (customer.customer_mode !== "existing") {
			return customerReviewResponse(session.id, selections, method);
		}
		const addressId = readText(data.address_id, 64);
		if (addressId === "new") {
			return newAddressResponse(
				session.id,
				selections,
				method,
				session.customer_id,
				readText(customer.customer_name, 180) ?? "",
			);
		}
		if (!addressId) throw new Error("flow_address_confirmation_required");
		const addressResult = await supabase
			.from("customer_addresses")
			.select(
				"id,label,street,number,complement,neighborhood,city,state,postal_code,reference,is_active",
			)
			.eq("id", addressId)
			.eq("customer_id", session.customer_id)
			.eq("is_active", true)
			.maybeSingle();
		if (addressResult.error || !addressResult.data) {
			throw new Error("flow_address_confirmation_required");
		}
		const address = normalizeAddress(addressResult.data as JsonRecord);
		if (!address) throw new Error("flow_customer_address_invalid");
		return orderReviewResponse(
			snapshot,
			session.id,
			selections,
			method,
			session.customer_id,
			readText(customer.customer_name, 180) ?? "",
			addressId,
			address,
		);
	}

	if (screen === "CUSTOMER_NEW_ADDRESS") {
		const selections = normalizeSelections(
			selectedItemsRaw,
			snapshot.positions,
			snapshot.positions.length,
		);
		if (!selections?.some((selection) => selection.quantity > 0)) {
			throw new Error("flow_selection_incomplete");
		}
		const method = readText(data.payment_method, 40);
		if (!method || !(method in PAYMENT_LABELS)) {
			throw new Error("flow_payment_method_invalid");
		}
		if (componentAction === "back") {
			const customer = await loadCustomerContext(supabase, session.customer_id);
			if (customer.customer_mode === "existing") {
				return {
					screen: "CUSTOMER_ADDRESS",
					data: {
						selected_items: selections,
						payment_method: method,
						payment_label: PAYMENT_LABELS[method],
						...customer,
					},
				};
			}
			return {
				screen: "PAYMENT",
				data: {
					selected_items: selections,
					payment_method: method,
					payment_methods: Object.keys(PAYMENT_LABELS)
						.sort()
						.map((candidate) => ({
							id: candidate,
							title: PAYMENT_LABELS[candidate],
						})),
				},
			};
		}
		if (componentAction !== "review_order")
			throw new Error("flow_action_unsupported");

		let customerId: string | null = null;
		let customerName = readText(data.customer_name, 180);
		if (session.customer_id) {
			const customerResult = await supabase
				.from("customers")
				.select("id,name,is_active")
				.eq("id", session.customer_id)
				.eq("is_active", true)
				.maybeSingle();
			if (customerResult.error || !customerResult.data) {
				return customerReviewResponse(session.id, selections, method);
			}
			customerId = customerResult.data.id;
			customerName = readText(customerResult.data.name, 180);
			if (!customerName) {
				return customerReviewResponse(session.id, selections, method);
			}
		}
		const address = normalizeAddress(
			isRecord(data.new_address) ? data.new_address : {},
		);
		if (!customerName || !address)
			throw new Error("flow_customer_address_invalid");
		return orderReviewResponse(
			snapshot,
			session.id,
			selections,
			method,
			customerId,
			customerName,
			null,
			address,
		);
	}

	throw new Error("flow_screen_unsupported");
}

export default {
	fetch: withSupabase({ auth: "none" }, async (request, { supabaseAdmin }) => {
		const requestId = crypto.randomUUID();
		if (request.method !== "POST") return plain("method_not_allowed", 405);
		if (
			!(request.headers.get("content-type") ?? "")
				.toLowerCase()
				.includes("application/json")
		) {
			return plain("content_type_required", 415);
		}

		const url = new URL(request.url);
		const accountSlug = url.searchParams.get("account") ?? "";
		if (!ROUTABLE_ACCOUNTS.has(accountSlug))
			return plain("flow_account_required", 404);
		const rawBody = await readBodyLimited(request);
		if (rawBody === null) return plain("request_too_large", 413);
		const appSecretEnv = APP_SECRET_ENV_BY_ACCOUNT[accountSlug];
		const appSecret = appSecretEnv ? Deno.env.get(appSecretEnv) : null;
		if (!appSecret) return plain("flow_signature_secret_not_configured", 503);
		const signatureValid = await verifyMetaFlowSignature(
			rawBody,
			request.headers.get("x-hub-signature-256"),
			appSecret,
		);
		if (!signatureValid) return plain("", 432);

		let envelope: unknown;
		try {
			envelope = JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(rawBody),
			) as unknown;
		} catch {
			return plain("invalid_json", 400);
		}
		if (!isRecord(envelope)) return plain("invalid_encrypted_request", 400);

		const { data: account, error: keyError } = await supabaseAdmin.rpc(
			"whatsapp_flow_private_key_resolve_v1",
			{ p_account_slug: accountSlug },
		);
		if (keyError || !isRecord(account) || account.ok !== true) {
			return plain("flow_key_not_ready", 503);
		}
		const privateKey = readText(account.private_key_pkcs8, 16_384);
		const supabaseUrl = Deno.env.get("SUPABASE_URL");
		if (!privateKey || !supabaseUrl) return plain("server_config", 503);

		let decrypted: DecryptedFlowRequest;
		try {
			decrypted = await decryptMetaFlowRequest(envelope, privateKey);
		} catch (error) {
			const code =
				error instanceof FlowCryptoError
					? error.code
					: "invalid_encrypted_request";
			const status =
				code === "aes_key_decryption_failed" || code === "invalid_private_key"
					? 421
					: 400;
			console.error(
				JSON.stringify({ request_id: requestId, error_code: code }),
			);
			return plain("", status);
		}

		try {
			const responseBody = await handleFlowAction(
				supabaseAdmin,
				decrypted,
				account,
				supabaseUrl,
				appSecret,
			);
			if (
				new TextEncoder().encode(JSON.stringify(responseBody)).byteLength >
				RESPONSE_LIMIT_BYTES
			) {
				throw new Error("flow_response_too_large");
			}
			const encrypted = await encryptMetaFlowResponse(
				responseBody,
				decrypted.aesKey,
				decrypted.initialVector,
			);
			if (
				new TextEncoder().encode(encrypted).byteLength > RESPONSE_LIMIT_BYTES
			) {
				throw new Error("flow_response_too_large");
			}
			return plain(encrypted, 200);
		} catch (error) {
			if (error instanceof FlowTokenError) {
				console.error(
					JSON.stringify({ request_id: requestId, error_code: error.code }),
				);
				const encryptedError = await encryptMetaFlowResponse(
					{
						error_msg:
							"Este formulário não está mais disponível. Inicie um novo pedido pelo atendimento.",
					},
					decrypted.aesKey,
					decrypted.initialVector,
				);
				return plain(encryptedError, 427);
			}
			const code =
				error instanceof Error && /^[a-z0-9_]{1,64}$/.test(error.message)
					? error.message
					: "flow_endpoint_error";
			console.error(
				JSON.stringify({ request_id: requestId, error_code: code }),
			);
			try {
				const encryptedError = await encryptMetaFlowResponse(
					{ data: { error: true, error_code: code } },
					decrypted.aesKey,
					decrypted.initialVector,
				);
				return plain(encryptedError, 200);
			} catch {
				return plain("flow_endpoint_error", 500);
			}
		}
	}),
};

"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;

export type AdminCatalogAddress = {
	id: string;
	label: string | null;
	street: string;
	number: string;
	complement: string | null;
	neighborhood: string;
	city: string;
	state: string;
	postalCode: string;
	reference: string | null;
	isDefault: boolean;
};

export type AdminCatalogPreparation = {
	statusReady: boolean;
	serviceWindowOpen: boolean;
	customerState:
		| "phone_missing"
		| "phone_conflict"
		| "not_found"
		| "inactive"
		| "matched";
	addressState:
		| "address_review"
		| "address_suggested"
		| "address_choice_required"
		| "address_missing";
	customer: { id: string; name: string } | null;
	addresses: AdminCatalogAddress[];
	suggestedAddressId: string | null;
	customerName: string | null;
	paymentMethod:
		| "pix"
		| "cash"
		| "debit_card"
		| "credit_card"
		| "food_card"
		| "meal_card"
		| null;
	selectedAddressId: string | null;
	newAddress: {
		street: string | null;
		number: string | null;
		complement: string | null;
		neighborhood: string | null;
		city: string | null;
		state: string | null;
		postalCode: string | null;
		reference: string | null;
	} | null;
};

export type AdminWhatsAppOrderIntent = {
	id: string;
	source: "flow" | "catalog";
	intentKind: "order" | "customer_review";
	status:
		| "received"
		| "needs_review"
		| "awaiting_confirmation"
		| "reprice_required"
		| "declined"
		| "converted";
	quoteRevision: number;
	quoteTotalCents: number | null;
	currentEstimateTotalCents: number | null;
	currency: string | null;
	catalogPreparation: AdminCatalogPreparation | null;
	items: Array<{
		key: string;
		name: string;
		quantity: number | null;
		available: boolean;
	}>;
	createdAt: string | null;
	updatedAt: string | null;
	orderId: string | null;
	orderStatus: string | null;
};

export type AdminWhatsAppOrderIntentsResult = {
	intents: AdminWhatsAppOrderIntent[];
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| "invalid_response"
		| null;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT_STATUSES = new Set([
	"received",
	"needs_review",
	"awaiting_confirmation",
	"reprice_required",
	"declined",
	"converted",
]);
const ORDER_STATUSES = new Set([
	"storefront_received",
	"confirmed",
	"sent_to_bling",
	"processing",
	"ready",
	"out_for_delivery",
	"delivered",
	"cancelled",
	"returned",
]);
const PAYMENT_METHODS = new Set([
	"pix",
	"cash",
	"debit_card",
	"credit_card",
	"food_card",
	"meal_card",
]);

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function text(value: unknown, maxLength = 80): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function nonNegativeInteger(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isSafeInteger(value) && value >= 0 ? value : null;
	}
	if (typeof value === "string" && /^\d{1,16}$/.test(value)) {
		const parsed = Number(value);
		return Number.isSafeInteger(parsed) ? parsed : null;
	}
	return null;
}

function timestamp(value: unknown): string | null {
	const normalized = text(value, 64);
	return normalized && !Number.isNaN(Date.parse(normalized))
		? normalized
		: null;
}

function parseIntentItems(
	value: unknown,
	intentId: string,
	source: "flow" | "catalog",
): Array<{
	key: string;
	name: string;
	quantity: number | null;
	available: boolean;
}> | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 100) return null;
	const items: Array<{
		key: string;
		name: string;
		quantity: number | null;
		available: boolean;
	}> = [];
	for (const rawItem of value) {
		const item = record(rawItem);
		const key = item ? text(item.key, 128) : null;
		const name = item ? text(item.name, 180) : null;
		const quantity =
			item?.quantity === null ? null : nonNegativeInteger(item?.quantity);
		if (
			!item ||
			!key ||
			!name ||
			(quantity === null && source !== "catalog") ||
			typeof item.available !== "boolean"
		) {
			return null;
		}
		items.push({
			key: `${intentId}-${key}`,
			name,
			quantity,
			available: item.available,
		});
	}
	return items;
}

function parseCatalogPreparation(
	value: unknown,
): AdminCatalogPreparation | null {
	const row = record(value);
	if (!row) return null;
	const customerState = row.customer_state;
	const addressState = row.address_state;
	if (
		typeof row.status_ready !== "boolean" ||
		typeof row.service_window_open !== "boolean" ||
		(customerState !== "phone_missing" &&
			customerState !== "phone_conflict" &&
			customerState !== "not_found" &&
			customerState !== "inactive" &&
			customerState !== "matched") ||
		(addressState !== "address_review" &&
			addressState !== "address_suggested" &&
			addressState !== "address_choice_required" &&
			addressState !== "address_missing") ||
		!Array.isArray(row.addresses) ||
		row.addresses.length > 20
	) {
		return null;
	}
	const rawCustomer = row.customer === null ? null : record(row.customer);
	let customer: AdminCatalogPreparation["customer"] = null;
	if (rawCustomer) {
		const id = text(rawCustomer.id, 36);
		const name = text(rawCustomer.name, 180) ?? "";
		if (!id || !UUID_PATTERN.test(id)) return null;
		customer = { id, name };
	} else if (row.customer !== null) {
		return null;
	}
	const addresses: AdminCatalogAddress[] = [];
	for (const rawAddress of row.addresses) {
		const address = record(rawAddress);
		const id = address ? text(address.id, 36) : null;
		const street = address ? text(address.street, 180) : null;
		const number = address ? text(address.number, 40) : null;
		const neighborhood = address ? text(address.neighborhood, 120) : null;
		const city = address ? text(address.city, 120) : null;
		const state = address ? text(address.state, 2) : null;
		const postalCode = address ? text(address.postal_code, 16) : null;
		if (
			!address ||
			!id ||
			!UUID_PATTERN.test(id) ||
			!street ||
			!number ||
			!neighborhood ||
			!city ||
			!state ||
			!/^[A-Za-z]{2}$/.test(state) ||
			!postalCode ||
			typeof address.is_default !== "boolean"
		) {
			continue;
		}
		addresses.push({
			id,
			label: text(address.label, 80),
			street,
			number,
			complement: text(address.complement, 120),
			neighborhood,
			city,
			state: state.toUpperCase(),
			postalCode,
			reference: text(address.reference, 180),
			isDefault: address.is_default,
		});
	}
	const suggestedAddressId =
		row.suggested_address_id === null
			? null
			: text(row.suggested_address_id, 36);
	const selectedAddressId =
		row.selected_address_id === null ? null : text(row.selected_address_id, 36);
	if (
		(suggestedAddressId !== null && !UUID_PATTERN.test(suggestedAddressId)) ||
		(selectedAddressId !== null && !UUID_PATTERN.test(selectedAddressId))
	) {
		return null;
	}
	let newAddress: AdminCatalogPreparation["newAddress"] = null;
	if (row.new_address !== null) {
		const draft = record(row.new_address);
		if (!draft) return null;
		newAddress = {
			street: text(draft.street, 180),
			number: text(draft.number, 40),
			complement: text(draft.complement, 120),
			neighborhood: text(draft.neighborhood, 120),
			city: text(draft.city, 120),
			state: text(draft.state, 2),
			postalCode: text(draft.postal_code, 16),
			reference: text(draft.reference, 180),
		};
	}
	const paymentMethod =
		typeof row.payment_method === "string" &&
		PAYMENT_METHODS.has(row.payment_method)
			? (row.payment_method as AdminCatalogPreparation["paymentMethod"])
			: null;
	return {
		statusReady: row.status_ready,
		serviceWindowOpen: row.service_window_open,
		customerState,
		addressState,
		customer,
		addresses,
		suggestedAddressId,
		customerName: text(row.draft_customer_name, 180),
		paymentMethod,
		selectedAddressId,
		newAddress,
	};
}

function parseIntent(value: unknown): AdminWhatsAppOrderIntent | null {
	const row = record(value);
	if (!row) return null;
	const id = text(row.id, 36);
	const source = row.source_kind;
	const intentKind = row.intent_kind;
	const status = row.status;
	if (
		!id ||
		!UUID_PATTERN.test(id) ||
		(source !== "flow" && source !== "catalog") ||
		(intentKind !== undefined &&
			intentKind !== "order" &&
			intentKind !== "customer_review") ||
		typeof status !== "string" ||
		!INTENT_STATUSES.has(status)
	) {
		return null;
	}
	const currency = text(row.currency, 3);
	const orderId = text(row.order_id, 36);
	const orderStatus = text(row.order_status, 40);
	const items = parseIntentItems(row.items, id, source);
	if (!items) return null;
	const catalogPreparation =
		source === "catalog" && row.catalog_preparation !== undefined
			? parseCatalogPreparation(row.catalog_preparation)
			: null;
	if (
		source === "catalog" &&
		row.catalog_preparation !== undefined &&
		!catalogPreparation
	) {
		return null;
	}

	return {
		id,
		source,
		intentKind: intentKind === "customer_review" ? "customer_review" : "order",
		status: status as AdminWhatsAppOrderIntent["status"],
		quoteRevision: nonNegativeInteger(row.quote_revision) ?? 0,
		quoteTotalCents: nonNegativeInteger(row.quote_total_cents),
		currentEstimateTotalCents: nonNegativeInteger(
			row.current_estimate_total_cents,
		),
		currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
		catalogPreparation,
		items,
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
		orderId: orderId && UUID_PATTERN.test(orderId) ? orderId : null,
		orderStatus:
			orderStatus && ORDER_STATUSES.has(orderStatus) ? orderStatus : null,
	};
}

export type PrepareAdminCatalogIntentInput = {
	intentId: string;
	paymentMethod: string;
	customerName: string | null;
	addressId: string | null;
	newAddress: {
		street: string;
		number: string;
		complement: string | null;
		neighborhood: string;
		city: string;
		state: string;
		postalCode: string;
		reference: string | null;
	} | null;
};

export type PrepareAdminCatalogIntentResult = {
	ok: boolean;
	error:
		| "invalid_request"
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "intent_not_found"
		| "catalog_intent_required"
		| "catalog_intent_not_ready"
		| "catalog_customer_phone_conflict"
		| "catalog_customer_name_required"
		| "catalog_address_choice_invalid"
		| "catalog_address_customer_missing"
		| "catalog_address_unavailable"
		| "catalog_address_invalid"
		| "catalog_address_required"
		| "catalog_quote_unavailable"
		| "unavailable"
		| null;
};

export async function prepareAdminCatalogIntent(
	input: PrepareAdminCatalogIntentInput,
): Promise<PrepareAdminCatalogIntentResult> {
	const fail = (
		error: PrepareAdminCatalogIntentResult["error"],
	): PrepareAdminCatalogIntentResult => ({ ok: false, error });
	if (!supabaseUrl || !supabasePublishableKey) return fail("not_configured");
	if (
		!UUID_PATTERN.test(input.intentId) ||
		!PAYMENT_METHODS.has(input.paymentMethod) ||
		(input.addressId !== null && !UUID_PATTERN.test(input.addressId))
	) {
		return fail("invalid_request");
	}
	let supabase: Awaited<ReturnType<typeof createClient>>;
	try {
		supabase = await createClient();
	} catch {
		return fail("not_configured");
	}
	const { data: authData, error: authError } = await supabase.auth.getClaims();
	if (authError || !authData?.claims?.sub) return fail("not_authenticated");
	const { data, error } = await supabase.rpc(
		"whatsapp_order_intent_catalog_prepare_admin_v1",
		{
			p_intent_id: input.intentId,
			p_payment_method: input.paymentMethod,
			p_customer_name: input.customerName,
			p_address_id: input.addressId,
			p_new_address: input.newAddress
				? {
						street: input.newAddress.street,
						number: input.newAddress.number,
						complement: input.newAddress.complement,
						neighborhood: input.newAddress.neighborhood,
						city: input.newAddress.city,
						state: input.newAddress.state,
						postal_code: input.newAddress.postalCode,
						reference: input.newAddress.reference,
					}
				: null,
		},
	);
	if (error) {
		return fail(
			error.code === "42501" || error.code === "PGRST301"
				? "not_authorized"
				: "unavailable",
		);
	}
	const payload = record(data);
	if (!payload || typeof payload.ok !== "boolean") return fail("unavailable");
	if (payload.ok) {
		return payload.preparation_ready === true &&
			payload.intent_id === input.intentId
			? { ok: true, error: null }
			: fail("unavailable");
	}
	const knownErrors = new Set<
		NonNullable<PrepareAdminCatalogIntentResult["error"]>
	>([
		"intent_not_found",
		"catalog_intent_required",
		"catalog_intent_not_ready",
		"catalog_customer_phone_conflict",
		"catalog_customer_name_required",
		"catalog_address_choice_invalid",
		"catalog_address_customer_missing",
		"catalog_address_unavailable",
		"catalog_address_invalid",
		"catalog_address_required",
		"catalog_quote_unavailable",
		"not_authorized",
	]);
	return fail(
		typeof payload.error === "string" &&
			knownErrors.has(
				payload.error as NonNullable<PrepareAdminCatalogIntentResult["error"]>,
			)
			? (payload.error as PrepareAdminCatalogIntentResult["error"])
			: "unavailable",
	);
}

export type SendAdminCatalogConfirmationResult = {
	ok: boolean;
	status:
		| "awaiting_confirmation"
		| "sent"
		| "sending"
		| "failed"
		| "delivery_unknown"
		| "needs_review"
		| "reprice_required"
		| null;
	error:
		| "invalid_request"
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "intent_not_found"
		| "catalog_intent_required"
		| "catalog_intent_not_ready"
		| "catalog_confirmation_identity_unavailable"
		| "catalog_confirmation_customer_conflict"
		| "catalog_confirmation_customer_name_missing"
		| "catalog_confirmation_address_invalid"
		| "catalog_confirmation_address_unavailable"
		| "catalog_confirmation_payment_missing"
		| "catalog_confirmation_quote_unavailable"
		| "catalog_confirmation_items_invalid"
		| "catalog_confirmation_summary_too_long"
		| "catalog_confirmation_outbox_missing"
		| "catalog_confirmation_outbox_conflict"
		| "catalog_confirmation_dispatch_unavailable"
		| "service_window_closed"
		| "unavailable"
		| null;
	issueCode: string | null;
};

const CATALOG_CONFIRMATION_STATUSES = new Set<
	NonNullable<SendAdminCatalogConfirmationResult["status"]>
>([
	"awaiting_confirmation",
	"sent",
	"sending",
	"failed",
	"delivery_unknown",
	"needs_review",
	"reprice_required",
]);

export async function sendAdminCatalogConfirmation(
	intentId: string,
): Promise<SendAdminCatalogConfirmationResult> {
	const fail = (
		error: SendAdminCatalogConfirmationResult["error"],
	): SendAdminCatalogConfirmationResult => ({
		ok: false,
		status: null,
		error,
		issueCode: null,
	});
	if (!supabaseUrl || !supabasePublishableKey) return fail("not_configured");
	if (!UUID_PATTERN.test(intentId)) return fail("invalid_request");

	let supabase: Awaited<ReturnType<typeof createClient>>;
	try {
		supabase = await createClient();
	} catch {
		return fail("not_configured");
	}
	const { data: authData, error: authError } = await supabase.auth.getClaims();
	if (authError || !authData?.claims?.sub) return fail("not_authenticated");
	const { data, error } = await supabase.functions.invoke(
		"whatsapp-order-catalog-confirmation-v1",
		{ body: { intentId } },
	);
	if (error) return fail("unavailable");
	const payload = record(data);
	if (!payload || typeof payload.ok !== "boolean") return fail("unavailable");
	if (payload.ok !== true) {
		const knownErrors = new Set<
			NonNullable<SendAdminCatalogConfirmationResult["error"]>
		>([
			"intent_not_found",
			"catalog_intent_required",
			"catalog_intent_not_ready",
			"catalog_confirmation_identity_unavailable",
			"catalog_confirmation_customer_conflict",
			"catalog_confirmation_customer_name_missing",
			"catalog_confirmation_address_invalid",
			"catalog_confirmation_address_unavailable",
			"catalog_confirmation_payment_missing",
			"catalog_confirmation_quote_unavailable",
			"catalog_confirmation_items_invalid",
			"catalog_confirmation_summary_too_long",
			"catalog_confirmation_outbox_missing",
			"catalog_confirmation_outbox_conflict",
			"catalog_confirmation_dispatch_unavailable",
			"service_window_closed",
			"not_authorized",
		]);
		return fail(
			typeof payload.error === "string" &&
				knownErrors.has(
					payload.error as NonNullable<
						SendAdminCatalogConfirmationResult["error"]
					>,
				)
				? (payload.error as SendAdminCatalogConfirmationResult["error"])
				: "unavailable",
		);
	}
	const status = payload.status;
	if (
		payload.intent_id !== intentId ||
		typeof status !== "string" ||
		!CATALOG_CONFIRMATION_STATUSES.has(
			status as NonNullable<SendAdminCatalogConfirmationResult["status"]>,
		)
	) {
		return fail("unavailable");
	}
	return {
		ok: true,
		status: status as SendAdminCatalogConfirmationResult["status"],
		error: null,
		issueCode:
			typeof payload.issue_code === "string" &&
			/^[a-z0-9_]{1,80}$/.test(payload.issue_code)
				? payload.issue_code
				: null,
	};
}

function result(
	error: AdminWhatsAppOrderIntentsResult["error"],
): AdminWhatsAppOrderIntentsResult {
	return { intents: [], error };
}

export async function getAdminWhatsAppOrderIntents(
	conversationId: string,
): Promise<AdminWhatsAppOrderIntentsResult> {
	if (!supabaseUrl || !supabasePublishableKey) return result("not_configured");
	if (!UUID_PATTERN.test(conversationId)) return result("invalid_response");

	let supabase: Awaited<ReturnType<typeof createClient>>;
	try {
		supabase = await createClient();
	} catch {
		return result("not_configured");
	}
	const { data: authData, error: authError } = await supabase.auth.getClaims();
	if (authError || !authData?.claims?.sub) return result("not_authenticated");

	const { data, error } = await supabase.rpc(
		"whatsapp_order_intents_admin_list_v1",
		{ p_conversation_id: conversationId },
	);
	if (error) {
		return result(
			error.code === "42501" || error.code === "PGRST301"
				? "not_authorized"
				: "unavailable",
		);
	}

	const payload = record(data);
	if (!payload || typeof payload.ok !== "boolean") {
		return result("invalid_response");
	}
	if (payload.ok !== true) {
		return result(
			payload.error === "admin_not_authorized"
				? "not_authorized"
				: "unavailable",
		);
	}
	if (!Array.isArray(payload.items) || payload.items.length > 20) {
		return result("invalid_response");
	}

	const intents = payload.items
		.map(parseIntent)
		.filter((intent): intent is AdminWhatsAppOrderIntent => intent !== null);
	if (intents.length !== payload.items.length)
		return result("invalid_response");
	return { intents, error: null };
}

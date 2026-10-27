import "server-only";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type OrderLane = "new" | "separate" | "ready" | "delivered";
type WhatsAppOrderOrigin = "flow" | "catalog";
export type OrderListItem = {
	id: string;
	orderNumber: string | null;
	publicCode: string | null;
	status: string;
	lane: OrderLane | null;
	customerName: string;
	phone: string | null;
	totalCents: number;
	createdAt: string | null;
	registrationComplete: boolean;
	sourceLabel: string;
};

export type OrderAddress = {
	street: string;
	number: string;
	complement: string;
	district: string;
	city: string;
	state: string;
	postalCode: string;
	reference: string;
};

export type OrderSeparationItem = {
	id: string;
	orderItemId: string;
	productId: string | null;
	state: "pending" | "separated" | "missing";
	name: string;
	sku: string | null;
	quantity: number;
	imageUrl: string | null;
};

export type OrderSeparation = {
	orderUpdatedAt: string | null;
	status: string;
	assignment: {
		separatorKey: string | null;
		separatorLabel: string | null;
		assignedAt: string | null;
	} | null;
	completion: {
		phase: string | null;
		completedAt: string | null;
	} | null;
	counts: {
		pending: number;
		separated: number;
		missing: number;
		total: number;
	};
	items: OrderSeparationItem[];
};

export type OrderFiscalStatus = {
	stage: string;
	authorized: boolean;
	canDispatch: boolean;
	canIssue: boolean;
	issueEnabled: boolean;
	invoiceNumber: string | null;
	sefazStatus: string | null;
	paymentStatus: string;
	paymentSource: string | null;
	blockers: string[];
};

export type AdminOrderDetail = OrderListItem & {
	customerId: string | null;
	address: OrderAddress;
	paymentMethod: string;
	items: Array<{
		id: string;
		name: string;
		quantity: number;
		totalCents: number | null;
		components: Array<{ id: string; name: string; quantity: number }>;
	}>;
	blingState: string | null;
	blingOrderId: string | null;
	separation: OrderSeparation | null;
	fiscalStatus: OrderFiscalStatus | null;
	fiscalError: OrderMutationError | null;
};

export type OrderGatewayError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "unavailable"
	| "not_found";

export type OrderBoardResult = {
	orders: OrderListItem[];
	total: number;
	hasMore: boolean;
	counts: Record<OrderLane, number> | null;
	error: OrderGatewayError | null;
};

export type OrderDetailResult = {
	order: AdminOrderDetail | null;
	error: OrderGatewayError | null;
};

export type OrderMutationError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "conflict"
	| "fiscal_blocked"
	| "invalid_input"
	| "unavailable";

export type OrderMutationResult =
	| {
			ok: true;
			warning: "bling_approval_pending" | null;
			customerNotified: boolean | null;
			integrationsQueued: boolean | null;
	  }
	| { ok: false; error: OrderMutationError };

export type OrderFiscalIssueResult =
	| {
			ok: true;
			requestAccepted: boolean;
			alreadyAuthorized: boolean;
			stage: string | null;
			invoiceNumber: string | null;
	  }
	| { ok: false; error: OrderMutationError };

export type OrderBlingRecoveryResult =
	| { ok: true; recovered: boolean }
	| { ok: false; error: OrderMutationError };

type JsonRecord = Record<string, unknown>;

const EMPTY_ADDRESS: OrderAddress = {
	street: "",
	number: "",
	complement: "",
	district: "",
	city: "",
	state: "",
	postalCode: "",
	reference: "",
};
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function string(value: unknown, limit = 300): string | null {
	if (typeof value !== "string") return null;
	const clean = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.trim();
	return clean ? clean.slice(0, limit) : null;
}

function integer(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value)
		? Math.round(value)
		: null;
}

function quantity(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? Math.max(0, Math.min(1_000_000, parsed)) : 0;
}

function safeHttpsUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" ? url.toString() : null;
	} catch {
		return null;
	}
}

function orderLane(status: string): OrderLane | null {
	if (status === "created" || status === "storefront_received") return "new";
	if (status === "confirmed" || status === "processing") return "separate";
	if (status === "ready" || status === "out_for_delivery") return "ready";
	if (status === "delivered") return "delivered";
	return null;
}

function orderSourceLabel(
	value: unknown,
	whatsAppOrigin: WhatsAppOrderOrigin | null,
): string {
	const source = string(value, 40)?.toLowerCase();
	if (source === "manual_whatsapp") {
		if (whatsAppOrigin === "flow") return "WhatsApp · Flow";
		if (whatsAppOrigin === "catalog") return "WhatsApp · catálogo";
	}
	const labels: Record<string, string> = {
		manual_whatsapp: "WhatsApp · atendimento",
		papoai: "WhatsApp · assistente",
		vitrine: "Loja",
		reorder: "Recompra",
	};
	return source
		? (labels[source] ?? "Origem não identificada")
		: "Origem não identificada";
}

function checkoutOrigin(value: unknown): WhatsAppOrderOrigin | null {
	const snapshot = record(value);
	if (
		snapshot?.schema_version !== "sucedoan.whatsapp_checkout.v1" ||
		snapshot.source !== "whatsapp_order_intent"
	) {
		return null;
	}
	return snapshot.origin === "flow" || snapshot.origin === "catalog"
		? snapshot.origin
		: null;
}

function mapOrderListItem(
	value: unknown,
	originOverride?: WhatsAppOrderOrigin,
): OrderListItem | null {
	const row = record(value);
	if (!row || typeof row.id !== "string") return null;
	const status = string(row.status, 40) ?? "unknown";
	return {
		id: row.id,
		orderNumber: string(row.order_number, 80),
		publicCode: string(row.public_code, 40),
		status,
		lane: orderLane(status),
		customerName: string(row.customer_name, 160) ?? "Cliente",
		phone: string(row.whatsapp_phone_e164, 40),
		totalCents: Math.max(0, integer(row.total_cents) ?? 0),
		createdAt: string(row.created_at, 60),
		registrationComplete: row.registration_complete === true,
		sourceLabel: orderSourceLabel(
			row.source,
			originOverride ?? checkoutOrigin(row.checkout_snapshot),
		),
	};
}

async function getWhatsAppOrderOrigins(
	orderIds: string[],
): Promise<Map<string, WhatsAppOrderOrigin>> {
	const origins = new Map<string, WhatsAppOrderOrigin>();
	const boundedIds = [
		...new Set(
			orderIds
				.filter((id) => UUID_PATTERN.test(id))
				.map((id) => id.toLowerCase()),
		),
	].slice(0, 50);
	if (!boundedIds.length || !supabaseUrl || !supabasePublishableKey) {
		return origins;
	}

	try {
		const supabase = await createClient();
		const { data: authData, error: authError } =
			await supabase.auth.getClaims();
		if (authError || !authData?.claims?.sub) return origins;

		const { data, error } = await supabase.rpc(
			"whatsapp_order_intent_origins_admin_v1",
			{ p_order_ids: boundedIds },
		);
		if (error) return origins;

		const payload = record(data);
		if (
			payload?.ok !== true ||
			!Array.isArray(payload.origins) ||
			payload.origins.length > boundedIds.length
		) {
			return origins;
		}

		for (const value of payload.origins) {
			const row = record(value);
			const orderId = string(row?.order_id, 36);
			const origin = row?.origin;
			if (
				orderId &&
				UUID_PATTERN.test(orderId) &&
				(origin === "flow" || origin === "catalog")
			) {
				origins.set(orderId.toLowerCase(), origin);
			}
		}
	} catch {
		return origins;
	}
	return origins;
}

function mapAddress(value: unknown): OrderAddress {
	const row = record(value);
	if (!row) return EMPTY_ADDRESS;
	return {
		street: string(row.street, 180) ?? "",
		number: string(row.number, 40) ?? "",
		complement: string(row.complement, 140) ?? "",
		district: string(row.district ?? row.neighborhood, 140) ?? "",
		city: string(row.city, 120) ?? "",
		state: string(row.state, 30) ?? "",
		postalCode: string(row.postal_code, 20) ?? "",
		reference: string(row.reference ?? row.raw_text, 300) ?? "",
	};
}

function mapDetail(
	value: unknown,
	originOverride?: WhatsAppOrderOrigin,
): AdminOrderDetail | null {
	const root = record(value);
	const order = record(root?.order);
	if (!order) return null;
	const itemRows = Array.isArray(root?.items) ? root.items : [];
	const items = itemRows
		.map((value) => {
			const row = record(value);
			if (!row || typeof row.id !== "string") return null;
			const components = Array.isArray(row.components)
				? row.components
						.map((componentValue) => {
							const component = record(componentValue);
							if (!component || typeof component.id !== "string") return null;
							return {
								id: component.id,
								name: string(component.name_snapshot, 180) ?? "Produto",
								quantity: quantity(component.quantity),
							};
						})
						.filter(
							(component): component is NonNullable<typeof component> =>
								component !== null,
						)
				: [];
			return {
				id: row.id,
				name: string(row.name_snapshot, 220) ?? "Item do pedido",
				quantity: quantity(row.quantity),
				totalCents: integer(row.total_cents),
				components,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);
	const customer = record(root?.customer);
	const payment = record(order.payment_method_snapshot);
	const bling = record(root?.bling_link);
	const listItem = mapOrderListItem(
		{
			id: order.id,
			order_number: order.order_number,
			public_code: order.public_code,
			status: order.status,
			customer_name: customer?.display_name,
			whatsapp_phone_e164: customer?.phone ?? order.whatsapp_phone_e164,
			total_cents: order.total_cents,
			created_at: order.created_at,
			registration_complete: order.registration_complete,
			source: order.source,
			checkout_snapshot: order.checkout_snapshot,
		},
		originOverride,
	);
	if (!listItem) return null;
	return {
		...listItem,
		customerId: string(order.customer_id, 80),
		address: mapAddress(order.delivery_address_snapshot ?? customer?.address),
		paymentMethod:
			string(payment?.planned_method, 80) ??
			string(order.payment_method, 80) ??
			"A confirmar",
		items,
		blingState: string(bling?.status, 60),
		blingOrderId: string(bling?.bling_order_id, 80),
		separation: null,
		fiscalStatus: null,
		fiscalError: null,
	};
}

function mapSeparation(value: unknown): OrderSeparation | null {
	const root = record(value);
	const row = record(root?.separation);
	if (row?.ok !== true) return null;
	const assignmentRow = record(row.assignment);
	const completionRow = record(row.completion);
	const rawCounts = record(row.counts);
	const rawItems = Array.isArray(row.items) ? row.items : [];
	const items = rawItems
		.map((value) => {
			const item = record(value);
			const itemId = string(item?.id, 80);
			const orderItemId = string(item?.order_item_id, 80);
			if (!item || !itemId || !orderItemId) return null;
			const state: OrderSeparationItem["state"] =
				item.state === "separated" || item.state === "missing"
					? item.state
					: "pending";
			return {
				id: itemId,
				orderItemId,
				productId: string(item.product_id, 80),
				state,
				name: string(item.name, 220) ?? "Produto",
				sku: string(item.sku, 80),
				quantity: quantity(item.quantity),
				imageUrl: safeHttpsUrl(item.image_url),
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	return {
		orderUpdatedAt: string(row.order_updated_at, 80),
		status: string(row.status, 40) ?? "unknown",
		assignment: assignmentRow
			? {
					separatorKey: string(assignmentRow.separator_key, 30),
					separatorLabel: string(assignmentRow.separator_label, 80),
					assignedAt: string(assignmentRow.assigned_at, 80),
				}
			: null,
		completion: completionRow
			? {
					phase: string(completionRow.phase, 40),
					completedAt: string(completionRow.completed_at, 80),
				}
			: null,
		counts: {
			pending: Math.max(0, integer(rawCounts?.pending) ?? 0),
			separated: Math.max(0, integer(rawCounts?.separated) ?? 0),
			missing: Math.max(0, integer(rawCounts?.missing) ?? 0),
			total: Math.max(0, integer(rawCounts?.total) ?? items.length),
		},
		items,
	};
}

async function gatewayGet(
	action: "orders" | "order" | "order_separation_get",
	params: Record<string, string>,
): Promise<
	{ ok: true; payload: JsonRecord } | { ok: false; error: OrderGatewayError }
> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", action);
	for (const [key, value] of Object.entries(params)) {
		endpoint.searchParams.set(key, value);
	}
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
		return { ok: false, error: "unavailable" };
	}
	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (response.status === 404) return { ok: false, error: "not_found" };
	if (!response.ok) return { ok: false, error: "unavailable" };
	try {
		const payload = record(await response.json());
		if (payload?.ok !== true) {
			return { ok: false, error: "unavailable" };
		}
		return { ok: true, payload };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

export async function getAdminOrderBoard(input: {
	lane: OrderLane;
	query: string;
	offset: number;
}): Promise<OrderBoardResult> {
	const result = await gatewayGet("orders", {
		limit: "5",
		offset: String(Math.max(0, Math.min(50_000, input.offset))),
		...(input.query ? { q: input.query.slice(0, 80) } : { tab: input.lane }),
	});
	if (!result.ok) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: result.error,
		};
	}
	const rows = Array.isArray(result.payload.orders)
		? result.payload.orders
		: [];
	const orderIds = rows
		.map((value) => string(record(value)?.id, 36))
		.filter((id): id is string => id !== null);
	const origins = await getWhatsAppOrderOrigins(orderIds);
	const counts = record(result.payload.counts);
	return {
		orders: rows
			.map((value) => {
				const id = string(record(value)?.id, 36);
				return mapOrderListItem(
					value,
					id ? origins.get(id.toLowerCase()) : undefined,
				);
			})
			.filter((order): order is OrderListItem => order !== null),
		total: Math.max(0, integer(result.payload.total) ?? 0),
		hasMore: result.payload.has_more === true,
		counts: counts
			? {
					new: Math.max(0, integer(counts.new) ?? 0),
					separate: Math.max(0, integer(counts.separate) ?? 0),
					ready: Math.max(0, integer(counts.ready) ?? 0),
					delivered: Math.max(0, integer(counts.delivered) ?? 0),
				}
			: null,
		error: null,
	};
}

export async function getAdminOrderDetail(
	orderId: string,
): Promise<OrderDetailResult> {
	const [result, separationResult, origins] = await Promise.all([
		gatewayGet("order", { id: orderId }),
		gatewayGet("order_separation_get", { id: orderId }),
		getWhatsAppOrderOrigins([orderId]),
	]);
	if (!result.ok) return { order: null, error: result.error };
	const order = mapDetail(result.payload, origins.get(orderId.toLowerCase()));
	if (!order) return { order: null, error: "unavailable" };
	order.separation = separationResult.ok
		? mapSeparation(separationResult.payload)
		: null;
	if (order.status === "ready" || order.status === "out_for_delivery") {
		const fiscal = await getAdminOrderFiscalStatus(orderId);
		order.fiscalStatus = fiscal.status;
		order.fiscalError = fiscal.error;
	}
	return { order, error: null };
}

export async function getAdminOrderFiscalStatus(orderId: string): Promise<{
	status: OrderFiscalStatus | null;
	error: OrderMutationError | null;
}> {
	const result = await gatewayPost("order_fiscal_status", { id: orderId });
	if (!result.ok) return { status: null, error: result.error };
	const blockers = Array.isArray(result.payload.blockers)
		? result.payload.blockers
				.map((value) => string(value, 180))
				.filter((value): value is string => value !== null)
				.slice(0, 8)
		: [];
	return {
		status: {
			stage: string(result.payload.stage, 40) ?? "blocked",
			authorized: result.payload.authorized === true,
			canDispatch: result.payload.can_dispatch === true,
			canIssue: result.payload.can_issue === true,
			issueEnabled: result.payload.issue_enabled === true,
			invoiceNumber: string(result.payload.bling_invoice_number, 80),
			sefazStatus: string(result.payload.sefaz_status, 80),
			paymentStatus: string(result.payload.payment_status, 40) ?? "unknown",
			paymentSource: string(result.payload.payment_source, 40),
			blockers,
		},
		error: null,
	};
}

async function gatewayPost(
	action:
		| "order_separation_assign"
		| "order_separation_item_set"
		| "order_separation_complete"
		| "order_fiscal_status"
		| "order_fiscal_issue_v4"
		| "order_dispatch_start_v4"
		| "order_delivery_complete_v3"
		| "order_delivery_finalize_v4"
		| "order_fiscal_recover_bling_v1",
	body: JsonRecord,
): Promise<
	{ ok: true; payload: JsonRecord } | { ok: false; error: OrderMutationError }
> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", action);
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}

	if (response.status === 401) return { ok: false, error: "not_authenticated" };
	if (response.status === 403) return { ok: false, error: "not_authorized" };
	if (response.status === 409) {
		try {
			const payload = record(await response.clone().json());
			if (payload?.error === "fiscal_authorization_required_before_dispatch") {
				return { ok: false, error: "fiscal_blocked" };
			}
		} catch {
			return { ok: false, error: "conflict" };
		}
		return { ok: false, error: "conflict" };
	}
	if (response.status === 400) return { ok: false, error: "invalid_input" };
	if (!response.ok) return { ok: false, error: "unavailable" };

	try {
		const payload = record(await response.json());
		if (payload?.ok !== true) {
			const code = string(payload?.error, 80);
			return {
				ok: false,
				error: code === "forbidden" ? "not_authorized" : "unavailable",
			};
		}
		return { ok: true, payload };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

export async function issueOrderFiscal(
	orderId: string,
): Promise<OrderFiscalIssueResult> {
	const result = await gatewayPost("order_fiscal_issue_v4", {
		id: orderId,
		confirmation: "EMITIR_NFE",
	});
	if (!result.ok) return result;
	const fiscal = record(result.payload.fiscal);
	return {
		ok: true,
		requestAccepted: result.payload.issued === true,
		alreadyAuthorized: fiscal?.authorized === true,
		stage: string(fiscal?.stage, 40),
		invoiceNumber: string(fiscal?.bling_invoice_number, 80),
	};
}

export async function recoverAdminOrderBling(
	orderId: string,
): Promise<OrderBlingRecoveryResult> {
	const result = await gatewayPost("order_fiscal_recover_bling_v1", {
		id: orderId,
	});
	if (!result.ok) return result;
	return {
		ok: true,
		recovered: result.payload.recovered === true,
	};
}

export type OrderDispatchResult =
	| {
			ok: true;
			physicalStockSynced: boolean;
			physicalStockPending: boolean;
	  }
	| { ok: false; error: OrderMutationError };

export async function startOrderDispatch(
	orderId: string,
): Promise<OrderDispatchResult> {
	const result = await gatewayPost("order_dispatch_start_v4", {
		id: orderId,
		idempotency_key: `dispatch-v4:${orderId}`,
	});
	if (!result.ok) return result;
	const stock = record(result.payload.physical_stock);
	return {
		ok: true,
		physicalStockSynced: stock?.ok === true,
		physicalStockPending: stock?.attempted === true && stock?.ok !== true,
	};
}

export type OrderDeliveryResult =
	| {
			ok: true;
			blingPending: boolean;
			blingSynced: boolean;
	  }
	| { ok: false; error: OrderMutationError };

async function finishOrderDelivery(
	action: "order_delivery_complete_v3" | "order_delivery_finalize_v4",
	body: JsonRecord,
): Promise<OrderDeliveryResult> {
	const result = await gatewayPost(action, body);
	if (!result.ok) return result;
	const bling = record(result.payload.bling_completion);
	return {
		ok: true,
		blingPending: bling?.attempted === true && bling?.ok !== true,
		blingSynced: bling?.ok === true,
	};
}

export async function completeOrderDelivery(input: {
	orderId: string;
	method: "pix" | "cash" | "credit_card" | "food_card" | "meal_card" | "other";
	amountCents: number;
}): Promise<OrderDeliveryResult> {
	return finishOrderDelivery("order_delivery_complete_v3", {
		id: input.orderId,
		method: input.method,
		amount_cents: input.amountCents,
		idempotency_key: `delivery-v3:${input.orderId}`,
	});
}

export async function finalizeCapturedOrderDelivery(
	orderId: string,
): Promise<OrderDeliveryResult> {
	return finishOrderDelivery("order_delivery_finalize_v4", {
		id: orderId,
	});
}

export async function assignOrderSeparator(input: {
	orderId: string;
	separatorKey: string;
}): Promise<OrderMutationResult> {
	const result = await gatewayPost("order_separation_assign", {
		id: input.orderId,
		separator_key: input.separatorKey,
	});
	return result.ok
		? {
				ok: true,
				warning: null,
				customerNotified: null,
				integrationsQueued: null,
			}
		: result;
}

export async function setOrderSeparationItem(input: {
	orderId: string;
	orderItemId: string;
	state: "separated" | "missing";
	expectedOrderUpdatedAt: string;
	separatorKey: string;
}): Promise<OrderMutationResult> {
	const result = await gatewayPost("order_separation_item_set", {
		id: input.orderId,
		order_item_id: input.orderItemId,
		state: input.state,
		expected_order_updated_at: input.expectedOrderUpdatedAt,
		separator_key: input.separatorKey,
	});
	if (!result.ok) return result;
	return {
		ok: true,
		warning:
			result.payload.warning === "bling_approval_pending"
				? "bling_approval_pending"
				: null,
		customerNotified: null,
		integrationsQueued: null,
	};
}

export async function completeOrderSeparation(input: {
	orderId: string;
	expectedOrderUpdatedAt: string;
}): Promise<OrderMutationResult> {
	const result = await gatewayPost("order_separation_complete", {
		id: input.orderId,
		expected_order_updated_at: input.expectedOrderUpdatedAt,
	});
	if (!result.ok) return result;
	const notification = record(result.payload.customer_notification);
	return {
		ok: true,
		warning: null,
		customerNotified:
			typeof notification?.ok === "boolean" ? notification.ok : null,
		integrationsQueued:
			typeof result.payload.integrations_queued === "boolean"
				? result.payload.integrations_queued
				: null,
	};
}

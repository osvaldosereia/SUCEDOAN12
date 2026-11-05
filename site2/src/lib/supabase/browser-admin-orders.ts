import { isOrderSeparatorKey } from "@/lib/orders/separators";
import type {
	AdminOrderDetail,
	OrderBoardResult,
	OrderDetailResult,
	OrderFiscalStatus,
	OrderGatewayError,
	OrderLane,
	OrderListItem,
	OrderMutationError,
	OrderMutationResult,
	OrderSeparation,
	OrderSeparationItem,
} from "@/lib/supabase/admin-orders";
import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;
type WhatsAppOrigin = "flow" | "catalog";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function safeString(value: unknown, limit = 300): string | null {
	if (typeof value !== "string") return null;
	const clean = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.trim();
	return clean ? clean.slice(0, limit) : null;
}

function safeInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value)
		? Math.round(value)
		: null;
}

function safeQuantity(value: unknown): number {
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

function laneForStatus(status: string): OrderLane | null {
	if (status === "created" || status === "storefront_received") return "new";
	if (status === "confirmed" || status === "processing") return "separate";
	if (status === "ready" || status === "out_for_delivery") return "ready";
	if (status === "delivered") return "delivered";
	return null;
}

function checkoutOrigin(value: unknown): WhatsAppOrigin | null {
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

function sourceLabel(
	value: unknown,
	origin: WhatsAppOrigin | undefined,
): string {
	const source = safeString(value, 40)?.toLowerCase();
	if (source === "manual_whatsapp") {
		if (origin === "flow") return "WhatsApp · Flow";
		if (origin === "catalog") return "WhatsApp · catálogo";
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

function mapOrder(
	value: unknown,
	origin?: WhatsAppOrigin,
): OrderListItem | null {
	const row = record(value);
	if (!row || typeof row.id !== "string" || !UUID.test(row.id)) return null;
	const status = safeString(row.status, 40) ?? "unknown";
	return {
		id: row.id,
		orderNumber: safeString(row.order_number, 80),
		publicCode: safeString(row.public_code, 40),
		status,
		lane: laneForStatus(status),
		customerName: safeString(row.customer_name, 160) ?? "Cliente",
		phone: safeString(row.whatsapp_phone_e164, 40),
		totalCents: Math.max(0, safeInteger(row.total_cents) ?? 0),
		createdAt: safeString(row.created_at, 60),
		registrationComplete: row.registration_complete === true,
		sourceLabel: sourceLabel(
			row.source,
			origin ?? checkoutOrigin(row.checkout_snapshot) ?? undefined,
		),
	};
}

async function orderOrigins(
	orderIds: string[],
): Promise<Map<string, WhatsAppOrigin>> {
	const result = new Map<string, WhatsAppOrigin>();
	const ids = [
		...new Set(
			orderIds.filter((id) => UUID.test(id)).map((id) => id.toLowerCase()),
		),
	].slice(0, 50);
	if (!ids.length) return result;

	try {
		const supabase = createClient();
		const { data: claims, error: claimsError } =
			await supabase.auth.getClaims();
		if (claimsError || !claims?.claims?.sub) return result;
		const { data, error } = await supabase.rpc(
			"whatsapp_order_intent_origins_admin_v1",
			{
				p_order_ids: ids,
			},
		);
		const payload = record(data);
		if (
			error ||
			payload?.ok !== true ||
			!Array.isArray(payload.origins) ||
			payload.origins.length > ids.length
		) {
			return result;
		}
		for (const value of payload.origins) {
			const row = record(value);
			const id = safeString(row?.order_id, 36);
			if (
				id &&
				UUID.test(id) &&
				(row?.origin === "flow" || row?.origin === "catalog")
			) {
				result.set(id.toLowerCase(), row.origin);
			}
		}
	} catch {
		return result;
	}
	return result;
}

type BrowserGatewayResult =
	| { ok: true; payload: JsonRecord }
	| { ok: false; error: OrderGatewayError };

type BrowserAccessError = Exclude<OrderGatewayError, "not_found">;

async function browserAccessToken(): Promise<
	{ ok: true; token: string } | { ok: false; error: BrowserAccessError }
> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	try {
		const supabase = createClient();
		const { data, error } = await supabase.auth.getSession();
		const token = data.session?.access_token;
		return error || !token
			? { ok: false, error: "not_authenticated" }
			: { ok: true, token };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

async function browserGatewayGet(
	token: string,
	action: "order" | "order_separation_get",
	orderId: string,
): Promise<BrowserGatewayResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", action);
	endpoint.searchParams.set("id", orderId);
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}
	if (response.status === 401) return { ok: false, error: "not_authenticated" };
	if (response.status === 403) return { ok: false, error: "not_authorized" };
	if (response.status === 404) return { ok: false, error: "not_found" };
	if (!response.ok) return { ok: false, error: "unavailable" };
	try {
		const payload = record(await response.json());
		return payload?.ok === true
			? { ok: true, payload }
			: { ok: false, error: "unavailable" };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

type BrowserGatewayPostResult =
	| { ok: true; payload: JsonRecord }
	| { ok: false; error: OrderMutationError };

async function browserGatewayPost(
	token: string,
	action:
		| "order_separation_assign"
		| "order_separation_item_set"
		| "order_separation_complete"
		| "order_fiscal_status",
	body: JsonRecord,
): Promise<BrowserGatewayPostResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", action);
	let response: Response;
	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
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
	if (response.status === 409) return { ok: false, error: "conflict" };
	if (response.status === 404) return { ok: false, error: "unavailable" };
	if (!response.ok) return { ok: false, error: "unavailable" };
	try {
		const payload = record(await response.json());
		return payload?.ok === true
			? { ok: true, payload }
			: { ok: false, error: "unavailable" };
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

function mapAddress(value: unknown): AdminOrderDetail["address"] {
	const row = record(value);
	return {
		street: safeString(row?.street, 180) ?? "",
		number: safeString(row?.number, 40) ?? "",
		complement: safeString(row?.complement, 140) ?? "",
		district: safeString(row?.district ?? row?.neighborhood, 140) ?? "",
		city: safeString(row?.city, 120) ?? "",
		state: safeString(row?.state, 30) ?? "",
		postalCode: safeString(row?.postal_code, 20) ?? "",
		reference: safeString(row?.reference ?? row?.raw_text, 300) ?? "",
	};
}

function mapOrderDetail(
	value: unknown,
	origin?: WhatsAppOrigin,
): AdminOrderDetail | null {
	const root = record(value);
	const order = record(root?.order);
	if (!order) return null;
	const customer = record(root?.customer);
	const payment = record(order.payment_method_snapshot);
	const bling = record(root?.bling_link);
	const listItem = mapOrder(
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
		origin,
	);
	if (!listItem) return null;
	const rawItems = Array.isArray(root?.items) ? root.items : [];
	const items = rawItems
		.map((value) => {
			const item = record(value);
			if (!item || typeof item.id !== "string") return null;
			const components = Array.isArray(item.components)
				? item.components
						.map((value) => {
							const component = record(value);
							return !component || typeof component.id !== "string"
								? null
								: {
										id: component.id,
										name: safeString(component.name_snapshot, 180) ?? "Produto",
										quantity: safeQuantity(component.quantity),
									};
						})
						.filter(
							(value): value is NonNullable<typeof value> => value !== null,
						)
				: [];
			return {
				id: item.id,
				name: safeString(item.name_snapshot, 220) ?? "Item do pedido",
				quantity: safeQuantity(item.quantity),
				totalCents: safeInteger(item.total_cents),
				components,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	return {
		...listItem,
		customerId: safeString(order.customer_id, 80),
		address: mapAddress(order.delivery_address_snapshot ?? customer?.address),
		paymentMethod:
			safeString(payment?.planned_method, 80) ??
			safeString(order.payment_method, 80) ??
			"A confirmar",
		items,
		blingState: safeString(bling?.status, 60),
		blingOrderId: safeString(bling?.bling_order_id, 80),
		separation: null,
		fiscalStatus: null,
		fiscalError: null,
	};
}

function mapSeparation(value: unknown): OrderSeparation | null {
	const root = record(value);
	const row = record(root?.separation);
	if (row?.ok !== true) return null;
	const assignment = record(row.assignment);
	const completion = record(row.completion);
	const counts = record(row.counts);
	const rawItems = Array.isArray(row.items) ? row.items : [];
	const items = rawItems
		.map((value) => {
			const item = record(value);
			const id = safeString(item?.id, 80);
			const orderItemId = safeString(item?.order_item_id, 80);
			if (!item || !id || !orderItemId) return null;
			const state: OrderSeparationItem["state"] =
				item.state === "separated" || item.state === "missing"
					? item.state
					: "pending";
			return {
				id,
				orderItemId,
				productId: safeString(item.product_id, 80),
				state,
				name: safeString(item.name, 220) ?? "Produto",
				sku: safeString(item.sku, 80),
				quantity: safeQuantity(item.quantity),
				imageUrl: safeHttpsUrl(item.image_url),
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);
	return {
		orderUpdatedAt: safeString(row.order_updated_at, 80),
		status: safeString(row.status, 40) ?? "unknown",
		assignment: assignment
			? {
					separatorKey: safeString(assignment.separator_key, 40),
					separatorLabel: safeString(assignment.separator_label, 120),
					assignedAt: safeString(assignment.assigned_at, 80),
				}
			: null,
		completion: completion
			? {
					phase: safeString(completion.phase, 40),
					completedAt: safeString(completion.completed_at, 80),
				}
			: null,
		counts: {
			pending: Math.max(0, safeInteger(counts?.pending) ?? 0),
			separated: Math.max(0, safeInteger(counts?.separated) ?? 0),
			missing: Math.max(0, safeInteger(counts?.missing) ?? 0),
			total: Math.max(0, safeInteger(counts?.total) ?? items.length),
		},
		items,
	};
}

export async function getBrowserAdminOrderDetail(
	orderId: string,
): Promise<OrderDetailResult> {
	if (!UUID.test(orderId)) return { order: null, error: "not_found" };
	const access = await browserAccessToken();
	if (!access.ok) return { order: null, error: access.error };
	const [orderResult, separationResult, origins] = await Promise.all([
		browserGatewayGet(access.token, "order", orderId),
		browserGatewayGet(access.token, "order_separation_get", orderId),
		orderOrigins([orderId]),
	]);
	if (!orderResult.ok) return { order: null, error: orderResult.error };
	const order = mapOrderDetail(
		orderResult.payload,
		origins.get(orderId.toLowerCase()),
	);
	if (!order) return { order: null, error: "unavailable" };
	order.separation = separationResult.ok
		? mapSeparation(separationResult.payload)
		: null;
	return { order, error: null };
}

export async function getBrowserOrderFiscalStatus(orderId: string): Promise<{
	status: OrderFiscalStatus | null;
	error: OrderMutationError | null;
}> {
	if (!UUID.test(orderId)) return { status: null, error: "invalid_input" };
	const access = await browserAccessToken();
	if (!access.ok) return { status: null, error: access.error };
	const result = await browserGatewayPost(access.token, "order_fiscal_status", {
		id: orderId,
	});
	if (!result.ok) return { status: null, error: result.error };
	const blockers = Array.isArray(result.payload.blockers)
		? result.payload.blockers
				.map((value) => safeString(value, 180))
				.filter((value): value is string => value !== null)
				.slice(0, 8)
		: [];
	return {
		status: {
			stage: safeString(result.payload.stage, 40) ?? "blocked",
			authorized: result.payload.authorized === true,
			canDispatch: result.payload.can_dispatch === true,
			canIssue: result.payload.can_issue === true,
			issueEnabled: result.payload.issue_enabled === true,
			invoiceNumber: safeString(result.payload.bling_invoice_number, 80),
			sefazStatus: safeString(result.payload.sefaz_status, 80),
			paymentStatus: safeString(result.payload.payment_status, 40) ?? "unknown",
			paymentSource: safeString(result.payload.payment_source, 40),
			blockers,
		},
		error: null,
	};
}

export async function assignBrowserOrderSeparator(input: {
	orderId: string;
	separatorKey: string;
}): Promise<OrderMutationResult> {
	if (!UUID.test(input.orderId) || !isOrderSeparatorKey(input.separatorKey)) {
		return { ok: false, error: "invalid_input" };
	}
	const access = await browserAccessToken();
	if (!access.ok) return { ok: false, error: access.error };
	const result = await browserGatewayPost(
		access.token,
		"order_separation_assign",
		{ id: input.orderId, separator_key: input.separatorKey },
	);
	return result.ok
		? {
				ok: true,
				warning: null,
				customerNotified: null,
				integrationsQueued: null,
			}
		: result;
}

export async function setBrowserOrderSeparationItem(input: {
	orderId: string;
	orderItemId: string;
	state: "separated" | "missing";
	expectedOrderUpdatedAt: string;
	separatorKey: string;
}): Promise<OrderMutationResult> {
	if (
		!UUID.test(input.orderId) ||
		!UUID.test(input.orderItemId) ||
		!Number.isFinite(Date.parse(input.expectedOrderUpdatedAt)) ||
		!isOrderSeparatorKey(input.separatorKey)
	) {
		return { ok: false, error: "invalid_input" };
	}
	const access = await browserAccessToken();
	if (!access.ok) return { ok: false, error: access.error };
	const result = await browserGatewayPost(
		access.token,
		"order_separation_item_set",
		{
			id: input.orderId,
			order_item_id: input.orderItemId,
			state: input.state,
			expected_order_updated_at: input.expectedOrderUpdatedAt,
			separator_key: input.separatorKey,
		},
	);
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

export async function completeBrowserOrderSeparation(input: {
	orderId: string;
	expectedOrderUpdatedAt: string;
}): Promise<OrderMutationResult> {
	if (
		!UUID.test(input.orderId) ||
		!Number.isFinite(Date.parse(input.expectedOrderUpdatedAt))
	) {
		return { ok: false, error: "invalid_input" };
	}
	const current = await getBrowserAdminOrderDetail(input.orderId);
	const separation = current.order?.separation;
	if (!current.order) {
		return {
			ok: false,
			error:
				current.error === "not_found"
					? "unavailable"
					: (current.error ?? "unavailable"),
		};
	}
	if (
		!separation ||
		separation.orderUpdatedAt !== input.expectedOrderUpdatedAt
	) {
		return { ok: false, error: "conflict" };
	}
	if (
		!separation.assignment?.separatorKey ||
		separation.items.length === 0 ||
		separation.counts.pending > 0 ||
		separation.counts.missing > 0 ||
		separation.items.some((item) => item.state !== "separated")
	) {
		return { ok: false, error: "invalid_input" };
	}
	const fiscal = await getBrowserOrderFiscalStatus(input.orderId);
	if (!fiscal.status || fiscal.status.issueEnabled) {
		return { ok: false, error: "fiscal_blocked" };
	}
	const access = await browserAccessToken();
	if (!access.ok) return { ok: false, error: access.error };
	const result = await browserGatewayPost(
		access.token,
		"order_separation_complete",
		{
			id: input.orderId,
			expected_order_updated_at: input.expectedOrderUpdatedAt,
		},
	);
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

export async function getBrowserAdminOrderBoard(input: {
	lane: OrderLane;
	query: string;
	offset: number;
}): Promise<OrderBoardResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_configured",
		};
	}

	const supabase = createClient();
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	const accessToken = sessionData.session?.access_token;
	if (sessionError || !accessToken) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_authenticated",
		};
	}

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", "orders");
	endpoint.searchParams.set("limit", "5");
	endpoint.searchParams.set(
		"offset",
		String(Math.max(0, Math.min(50_000, input.offset))),
	);
	if (input.query) endpoint.searchParams.set("q", input.query.slice(0, 80));
	else endpoint.searchParams.set("tab", input.lane);

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
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "unavailable",
		};
	}
	if (response.status === 401) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_authenticated",
		};
	}
	if (response.status === 403) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_authorized",
		};
	}
	if (response.status === 404) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "not_found",
		};
	}
	if (!response.ok) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "unavailable",
		};
	}

	let payload: JsonRecord | null;
	try {
		payload = record(await response.json());
	} catch {
		payload = null;
	}
	if (payload?.ok !== true) {
		return {
			orders: [],
			total: 0,
			hasMore: false,
			counts: null,
			error: "unavailable",
		};
	}

	const rows = Array.isArray(payload.orders) ? payload.orders : [];
	const ids = rows
		.map((row) => safeString(record(row)?.id, 36))
		.filter((id): id is string => Boolean(id));
	const origins = await orderOrigins(ids);
	const counts = record(payload.counts);
	return {
		orders: rows
			.map((row) => {
				const id = safeString(record(row)?.id, 36);
				return mapOrder(row, id ? origins.get(id.toLowerCase()) : undefined);
			})
			.filter((row): row is OrderListItem => row !== null),
		total: Math.max(0, safeInteger(payload.total) ?? 0),
		hasMore: payload.has_more === true,
		counts: counts
			? {
					new: Math.max(0, safeInteger(counts.new) ?? 0),
					separate: Math.max(0, safeInteger(counts.separate) ?? 0),
					ready: Math.max(0, safeInteger(counts.ready) ?? 0),
					delivered: Math.max(0, safeInteger(counts.delivered) ?? 0),
				}
			: null,
		error: null,
	};
}

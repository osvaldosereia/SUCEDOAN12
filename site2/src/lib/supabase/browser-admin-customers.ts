"use client";

import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

type JsonRecord = Record<string, unknown>;
const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminCustomerSearchItem = {
	id: string;
	name: string;
	phone: string | null;
	maskedDocument: string | null;
	active: boolean;
};

export type AdminCustomerAddress = {
	id: string;
	label: string;
	isDefault: boolean;
	updatedAt: string;
	street: string;
	number: string;
	complement: string;
	district: string;
	city: string;
	state: string;
	postalCode: string;
	reference: string;
};

type LegacyAdminCustomerAddress = Omit<
	AdminCustomerAddress,
	"id" | "updatedAt"
> & { id: null; updatedAt: null };

export type AdminCustomerEditor = {
	canEdit: boolean;
	conversationPhone: string | null;
	selectedAddressId: string | null;
	addressRequiresChoice: boolean;
	addresses: AdminCustomerAddress[];
	legacyAddress: LegacyAdminCustomerAddress | null;
	customer: {
		updatedAt: string;
		name: string;
		phone: string | null;
		maskedDocument: string | null;
		email: string;
		status: "active" | "inactive";
	};
};

export type CustomerRpcResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: string };

const SAFE_ERROR_CODES = new Set([
	"admin_not_authorized",
	"admin_write_forbidden",
	"conversation_already_linked",
	"conversation_not_found",
	"cpf_already_in_use",
	"customer_not_found",
	"customer_not_linked",
	"customer_resolution_failed",
	"customer_save_failed",
	"duplicate_customer_identity",
	"address_list_too_large",
	"invalid_address",
	"invalid_address_fields",
	"stale_address",
	"stale_customer",
	"invalid_conversation_id",
	"invalid_customer",
	"invalid_customer_id",
	"invalid_phone",
	"phone_already_in_use",
]);

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function string(value: unknown, limit = 500): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, limit) : null;
}

function safeError(value: unknown): string {
	return typeof value === "string" && SAFE_ERROR_CODES.has(value)
		? value
		: "unavailable";
}

async function callCustomerRpc(
	functionName: string,
	parameters: Record<string, unknown>,
): Promise<CustomerRpcResult<JsonRecord>> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}

	let supabase: Awaited<ReturnType<typeof createClient>>;
	try {
		supabase = await createClient();
	} catch {
		return { ok: false, error: "not_configured" };
	}

	const { data: authData, error: authError } = await supabase.auth.getClaims();
	if (authError || !authData?.claims?.sub) {
		return { ok: false, error: "not_authenticated" };
	}

	const { data, error } = await supabase.rpc(functionName, parameters);
	if (error) {
		return {
			ok: false,
			error:
				error.code === "42501" || error.code === "PGRST301"
					? "not_authorized"
					: "unavailable",
		};
	}

	const payload = record(data);
	if (!payload || typeof payload.ok !== "boolean") {
		return { ok: false, error: "invalid_response" };
	}
	if (payload.ok !== true) {
		return { ok: false, error: safeError(payload.error) };
	}
	return { ok: true, data: payload };
}

export async function searchAdminCustomers(
	query: string,
): Promise<CustomerRpcResult<AdminCustomerSearchItem[]>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_search_browser_v1",
		{ p_query: query.trim().slice(0, 180), p_limit: 20 },
	);
	if (!result.ok) return result;
	if (!Array.isArray(result.data.items)) {
		return { ok: false, error: "invalid_response" };
	}

	const items = result.data.items
		.map((value) => {
			const row = record(value);
			if (!row || typeof row.customer_id !== "string") return null;
			return {
				id: row.customer_id,
				name: string(row.customer_name, 180) ?? "Cliente sem nome",
				phone: string(row.phone_e164, 40),
				maskedDocument: string(row.masked_document, 30),
				active: row.is_active === true,
			} satisfies AdminCustomerSearchItem;
		})
		.filter((item): item is AdminCustomerSearchItem => item !== null);

	return { ok: true, data: items };
}

export async function getAdminCustomerEditor(
	conversationId: string,
	addressId?: string | null,
): Promise<CustomerRpcResult<AdminCustomerEditor>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_editor_safe_browser_v1",
		{ p_conversation_id: conversationId, p_address_id: addressId ?? null },
	);
	if (!result.ok) {
		return result.error === "unavailable"
			? getLegacyAdminCustomerEditor(conversationId)
			: result;
	}

	const customer = record(result.data.customer);
	if (!customer || !Array.isArray(result.data.addresses)) {
		return { ok: false, error: "invalid_response" };
	}
	const addresses = result.data.addresses
		.map((value): AdminCustomerAddress | null => {
			const address = record(value);
			if (
				!address ||
				typeof address.id !== "string" ||
				typeof address.updated_at !== "string"
			) {
				return null;
			}
			return {
				id: address.id,
				label: string(address.label, 80) ?? "Endereço",
				isDefault: address.is_default === true,
				updatedAt: address.updated_at,
				street: string(address.street, 180) ?? "",
				number: string(address.number, 40) ?? "",
				complement: string(address.complement, 140) ?? "",
				district: string(address.neighborhood, 140) ?? "",
				city: string(address.city, 120) ?? "",
				state: string(address.state, 2) ?? "",
				postalCode: string(address.postal_code, 8) ?? "",
				reference: string(address.reference, 400) ?? "",
			};
		})
		.filter((address): address is AdminCustomerAddress => address !== null);
	const updatedAt = string(customer.updated_at, 64);
	const selectedAddressId = string(result.data.selected_address_id, 64);
	if (!updatedAt) return { ok: false, error: "invalid_response" };

	return {
		ok: true,
		data: {
			canEdit: true,
			conversationPhone: string(result.data.conversation_phone_e164, 40),
			selectedAddressId,
			addressRequiresChoice: result.data.address_requires_choice === true,
			addresses,
			legacyAddress: null,
			customer: {
				updatedAt,
				name: string(customer.display_name, 180) ?? "",
				phone: string(customer.phone_e164, 40),
				maskedDocument: string(customer.masked_document, 30),
				email: string(customer.email, 180) ?? "",
				status: customer.status === "inactive" ? "inactive" : "active",
			},
		},
	};
}

function maskedDocument(value: unknown): string | null {
	const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
	if (digits.length === 11) return `***.***.${digits.slice(-3)}-**`;
	if (digits.length === 14) return `**.***.***/****-${digits.slice(-2)}`;
	return digits ? "Documento salvo" : null;
}

async function getLegacyAdminCustomerEditor(
	conversationId: string,
): Promise<CustomerRpcResult<AdminCustomerEditor>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_editor_browser_v1",
		{ p_conversation_id: conversationId },
	);
	if (!result.ok) return result;
	const customer = record(result.data.customer);
	const address = record(customer?.address);
	if (!customer || !address) return { ok: false, error: "invalid_response" };
	const legacyAddress: LegacyAdminCustomerAddress = {
		id: null,
		label: "Endereço principal",
		isDefault: true,
		updatedAt: null,
		street: string(address.street, 180) ?? "",
		number: string(address.number, 40) ?? "",
		complement: string(address.complement, 140) ?? "",
		district: string(address.district, 140) ?? "",
		city: string(address.city, 120) ?? "",
		state: string(address.state, 2) ?? "",
		postalCode: string(address.postal_code, 8) ?? "",
		reference: string(address.raw_text, 400) ?? "",
	};
	return {
		ok: true,
		data: {
			canEdit: false,
			conversationPhone: string(result.data.conversation_phone_e164, 40),
			selectedAddressId: null,
			addressRequiresChoice: false,
			addresses: [],
			legacyAddress,
			customer: {
				updatedAt: "",
				name: string(customer.display_name, 180) ?? "",
				phone: string(customer.phone_e164, 40),
				maskedDocument: maskedDocument(customer.cpf),
				email: string(customer.email, 180) ?? "",
				status: customer.status === "inactive" ? "inactive" : "active",
			},
		},
	};
}

export async function updateAdminCustomer(input: {
	conversationId: string;
	expectedCustomerUpdatedAt: string;
	name: string;
	addressId: string | null;
	expectedAddressUpdatedAt: string | null;
	address: Omit<
		AdminCustomerAddress,
		"id" | "label" | "isDefault" | "updatedAt"
	> | null;
}): Promise<CustomerRpcResult<{ saved: boolean }>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_update_browser_v1",
		{
			p_conversation_id: input.conversationId,
			p_expected_customer_updated_at: input.expectedCustomerUpdatedAt,
			p_customer_name: input.name,
			p_address_id: input.addressId,
			p_expected_address_updated_at: input.expectedAddressUpdatedAt,
			p_address: input.address
				? {
						street: input.address.street,
						number: input.address.number,
						complement: input.address.complement,
						neighborhood: input.address.district,
						city: input.address.city,
						state: input.address.state,
						postal_code: input.address.postalCode,
						reference: input.address.reference,
					}
				: null,
		},
	);
	return result.ok
		? { ok: true, data: { saved: result.data.saved === true } }
		: result;
}

export async function reconcileAdminCustomer(
	conversationId: string,
): Promise<CustomerRpcResult<{ matchStatus: string; linked: boolean }>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_reconcile_browser_v1",
		{ p_conversation_id: conversationId },
	);
	if (!result.ok) return result;

	const matchStatus = string(result.data.match_status, 30);
	if (!matchStatus) return { ok: false, error: "invalid_response" };
	return {
		ok: true,
		data: { matchStatus, linked: result.data.linked === true },
	};
}

export async function linkAdminCustomer(
	conversationId: string,
	customerId: string,
): Promise<CustomerRpcResult<null>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_link_browser_v1",
		{ p_conversation_id: conversationId, p_customer_id: customerId },
	);
	return result.ok ? { ok: true, data: null } : result;
}

export async function createAdminCustomer(
	conversationId: string,
	customer: JsonRecord,
): Promise<CustomerRpcResult<null>> {
	const result = await callCustomerRpc(
		"ops2_admin_attendance_customer_create_browser_v1",
		{ p_conversation_id: conversationId, p_customer: customer },
	);
	return result.ok ? { ok: true, data: null } : result;
}

export type BrowserCustomerConversationContext = {
	conversation: {
		id: string;
		customerId: string | null;
		phone: string | null;
	} | null;
	customer: { name: string } | null;
};

export async function getBrowserCustomerConversationContext(
	conversationId: string,
): Promise<CustomerRpcResult<BrowserCustomerConversationContext>> {
	if (!UUID.test(conversationId))
		return { ok: false, error: "invalid_conversation_id" };
	if (!supabaseUrl || !supabasePublishableKey)
		return { ok: false, error: "not_configured" };
	try {
		const client = await createClient();
		const { data, error } = await client.auth.getSession();
		const token = data.session?.access_token;
		if (error || !token) return { ok: false, error: "not_authenticated" };
		const endpoint = new URL(
			"/functions/v1/admin-whatsapp-ops-v1",
			supabaseUrl,
		);
		endpoint.searchParams.set("action", "context");
		endpoint.searchParams.set("conversation_id", conversationId);
		const response = await fetch(endpoint, {
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
		const payload = record(await response.json());
		if (!payload || !response.ok || payload.ok !== true)
			return {
				ok: false,
				error:
					response.status === 401 || response.status === 403
						? "not_authorized"
						: "unavailable",
			};
		const conversation = record(payload.conversation);
		if (!conversation)
			return { ok: true, data: { conversation: null, customer: null } };
		const customer = record(payload.customer);
		return {
			ok: true,
			data: {
				conversation: {
					id:
						typeof conversation.id === "string" && UUID.test(conversation.id)
							? conversation.id
							: conversationId,
					customerId:
						typeof conversation.customer_id === "string" &&
						UUID.test(conversation.customer_id)
							? conversation.customer_id
							: null,
					phone:
						typeof conversation.phone_e164 === "string"
							? conversation.phone_e164.slice(0, 40)
							: null,
				},
				customer:
					customer && typeof customer.name === "string"
						? { name: customer.name.slice(0, 120) }
						: null,
			},
		};
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

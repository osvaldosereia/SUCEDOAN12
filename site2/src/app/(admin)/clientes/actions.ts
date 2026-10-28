"use server";

import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import type { AdminCustomerSearchItem } from "@/lib/supabase/admin-customers";
import {
	createAdminCustomer,
	linkAdminCustomer,
	reconcileAdminCustomer,
	searchAdminCustomers,
	updateAdminCustomer,
} from "@/lib/supabase/admin-customers";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CustomerActionState = {
	items: AdminCustomerSearchItem[] | null;
	message: string | null;
};

function customerHref(conversationId: string, notice: string): string {
	const params = new URLSearchParams({
		conversation_id: conversationId,
		notice,
	});
	return `/clientes?${params.toString()}`;
}

function textField(
	formData: FormData,
	key: string,
	max: number,
): string | null {
	const value = formData.get(key);
	if (typeof value !== "string" || value.length > max) return null;
	return value.trim();
}

function customerPayload(
	formData: FormData,
): { ok: true; value: Record<string, unknown>; cpf: string } | { ok: false } {
	const name = textField(formData, "display_name", 180);
	const submittedCpf = textField(formData, "cpf", 30);
	const email = textField(formData, "email", 180);
	const street = textField(formData, "street", 180);
	const number = textField(formData, "number", 40);
	const complement = textField(formData, "complement", 140);
	const district = textField(formData, "district", 140);
	const city = textField(formData, "city", 120);
	const state = textField(formData, "state", 2);
	const postalCode = textField(formData, "postal_code", 9);
	const reference = textField(formData, "reference", 400);
	if (
		name === null ||
		submittedCpf === null ||
		email === null ||
		street === null ||
		number === null ||
		complement === null ||
		district === null ||
		city === null ||
		state === null ||
		postalCode === null ||
		reference === null ||
		!name
	) {
		return { ok: false };
	}

	const cpf = submittedCpf.replace(/\D/g, "");
	if (cpf && cpf.length !== 11 && cpf.length !== 14) return { ok: false };
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		return { ok: false };
	}
	const postalDigits = postalCode.replace(/\D/g, "");
	if (postalDigits.length > 8 || (state && !/^[a-z]{2}$/i.test(state))) {
		return { ok: false };
	}

	return {
		ok: true,
		cpf,
		value: {
			display_name: name,
			cpf,
			email,
			status: "active",
			address: {
				street,
				number,
				complement,
				district,
				city,
				state: state.toUpperCase(),
				postal_code: postalDigits,
				raw_text: reference,
			},
		},
	};
}

function actionNotice(error: string): string {
	if (error === "admin_write_forbidden") return "write_forbidden";
	if (error === "not_authorized" || error === "admin_not_authorized") {
		return "not_authorized";
	}
	if (error === "cpf_already_in_use") return "duplicate_document";
	if (error === "phone_already_in_use") return "duplicate_phone";
	if (error === "customer_not_linked") return "not_linked";
	return "unavailable";
}

function timestampField(formData: FormData, key: string): string | null {
	const value = textField(formData, key, 64);
	if (
		!value ||
		!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
			value,
		) ||
		Number.isNaN(Date.parse(value))
	) {
		return null;
	}
	return value;
}

export async function searchAdminCustomersAction(
	_previous: CustomerActionState,
	formData: FormData,
): Promise<CustomerActionState> {
	await requireAdminSession();
	const query = formData.get("query");
	if (typeof query !== "string" || query.trim().length < 2) {
		return {
			items: [],
			message: "Digite pelo menos dois caracteres para buscar.",
		};
	}
	if (query.length > 180) {
		return {
			items: [],
			message: "A busca é muito longa. Reduza o texto e tente de novo.",
		};
	}

	const result = await searchAdminCustomers(query.trim());
	if (!result.ok) {
		return {
			items: [],
			message:
				result.error === "not_authorized"
					? "Esta conta não tem acesso aos cadastros de clientes."
					: "Não foi possível buscar os clientes agora. Tente novamente.",
		};
	}
	return {
		items: result.data,
		message: result.data.length
			? null
			: "Nenhum cliente encontrado com esses dados.",
	};
}

export async function reconcileCustomerWithConversation(
	formData: FormData,
): Promise<void> {
	await requireAdminSession();
	const conversationId = String(formData.get("conversation_id") ?? "");
	if (!UUID.test(conversationId))
		redirect("/clientes?notice=invalid_conversation");

	const result = await reconcileAdminCustomer(conversationId);
	if (!result.ok) {
		redirect(customerHref(conversationId, actionNotice(result.error)));
	}
	if (result.data.linked || result.data.matchStatus === "matched") {
		redirect(customerHref(conversationId, "linked"));
	}
	if (result.data.matchStatus === "none") {
		redirect(customerHref(conversationId, "not_found"));
	}
	if (result.data.matchStatus === "ambiguous") {
		redirect(customerHref(conversationId, "ambiguous"));
	}
	redirect(customerHref(conversationId, "unavailable"));
}

export async function linkCustomerToConversation(
	formData: FormData,
): Promise<void> {
	await requireAdminSession();
	const conversationId = String(formData.get("conversation_id") ?? "");
	const customerId = String(formData.get("customer_id") ?? "");
	if (!UUID.test(conversationId) || !UUID.test(customerId)) {
		redirect("/clientes?notice=invalid_conversation");
	}

	const result = await linkAdminCustomer(conversationId, customerId);
	redirect(
		customerHref(
			conversationId,
			result.ok ? "linked" : actionNotice(result.error),
		),
	);
}

export async function createCustomerForConversation(
	formData: FormData,
): Promise<void> {
	await requireAdminSession();
	const conversationId = String(formData.get("conversation_id") ?? "");
	if (!UUID.test(conversationId))
		redirect("/clientes?notice=invalid_conversation");
	const parsed = customerPayload(formData);
	if (!parsed.ok) redirect(customerHref(conversationId, "invalid_form"));

	const result = await createAdminCustomer(conversationId, parsed.value);
	redirect(
		customerHref(
			conversationId,
			result.ok ? "created" : actionNotice(result.error),
		),
	);
}

export async function updateCustomerForConversation(
	formData: FormData,
): Promise<void> {
	await requireAdminSession();
	const conversationId = String(formData.get("conversation_id") ?? "");
	if (!UUID.test(conversationId))
		redirect("/clientes?notice=invalid_conversation");

	const name = textField(formData, "display_name", 180);
	const expectedCustomerUpdatedAt = timestampField(
		formData,
		"customer_updated_at",
	);
	const rawAddressId = textField(formData, "address_id", 64);
	const addressId = rawAddressId ? rawAddressId : null;
	const expectedAddressUpdatedAt = addressId
		? timestampField(formData, "address_updated_at")
		: null;
	if (
		name === null ||
		!name ||
		!expectedCustomerUpdatedAt ||
		(addressId !== null && (!UUID.test(addressId) || !expectedAddressUpdatedAt))
	) {
		redirect(customerHref(conversationId, "invalid_form"));
	}

	let address: {
		street: string;
		number: string;
		complement: string;
		district: string;
		city: string;
		state: string;
		postalCode: string;
		reference: string;
	} | null = null;
	if (addressId) {
		const street = textField(formData, "street", 180);
		const number = textField(formData, "number", 40);
		const complement = textField(formData, "complement", 140);
		const district = textField(formData, "district", 140);
		const city = textField(formData, "city", 120);
		const state = textField(formData, "state", 2);
		const postalCode = textField(formData, "postal_code", 9);
		const reference = textField(formData, "reference", 400);
		if (
			street === null ||
			number === null ||
			complement === null ||
			district === null ||
			city === null ||
			state === null ||
			postalCode === null ||
			reference === null
		) {
			redirect(customerHref(conversationId, "invalid_form"));
		}
		const postalDigits = postalCode.replace(/\D/g, "");
		if (
			!street.trim() ||
			!city.trim() ||
			postalDigits.length > 8 ||
			(state && !/^[a-z]{2}$/i.test(state))
		) {
			redirect(customerHref(conversationId, "invalid_form"));
		}
		address = {
			street,
			number,
			complement,
			district,
			city,
			state: state.toUpperCase(),
			postalCode: postalDigits,
			reference,
		};
	}

	const result = await updateAdminCustomer({
		conversationId,
		expectedCustomerUpdatedAt,
		name,
		addressId,
		expectedAddressUpdatedAt,
		address: address
			? {
					street: address.street,
					number: address.number,
					complement: address.complement,
					district: address.district,
					city: address.city,
					state: address.state,
					postalCode: address.postalCode,
					reference: address.reference,
				}
			: null,
	});
	if (result.ok) {
		redirect(customerHref(conversationId, "updated"));
	}
	const notice =
		result.error === "stale_customer" || result.error === "stale_address"
			? "stale"
			: result.error === "invalid_address_fields" ||
					result.error === "invalid_address"
				? "invalid_form"
				: actionNotice(result.error);
	redirect(customerHref(conversationId, notice));
}

"use client";

import { acknowledgeAdminIdentityReview } from "@/lib/supabase/browser-admin-identity-reviews";
import { sendAdminBasketFlow } from "@/lib/supabase/browser-admin-order-flow";
import {
	prepareAdminCatalogIntent,
	sendAdminCatalogConfirmation,
} from "@/lib/supabase/browser-admin-order-intents";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = new Set([
	"pix",
	"cash",
	"debit_card",
	"credit_card",
	"food_card",
	"meal_card",
]);

function navigate(path: string): void {
	window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`);
}

function returnToCatalogIntent(formData: FormData, notice: string): void {
	const params = new URLSearchParams();
	const accountId = String(formData.get("account_id") ?? "");
	const conversationId = String(formData.get("conversation_id") ?? "");
	const search = String(formData.get("search") ?? "")
		.trim()
		.slice(0, 80);
	if (UUID.test(accountId)) params.set("account_id", accountId);
	if (UUID.test(conversationId)) params.set("conversation_id", conversationId);
	if (search) params.set("search", search);
	params.set("notice", notice);
	navigate(`/atendimento?${params.toString()}#pedidos-whatsapp`);
}

function returnToFlow(formData: FormData, notice: string): void {
	const params = new URLSearchParams();
	const accountId = String(formData.get("account_id") ?? "");
	const conversationId = String(formData.get("conversation_id") ?? "");
	const search = String(formData.get("search") ?? "")
		.trim()
		.slice(0, 80);
	if (UUID.test(accountId)) params.set("account_id", accountId);
	if (UUID.test(conversationId)) params.set("conversation_id", conversationId);
	if (search) params.set("search", search);
	params.set("notice", notice);
	navigate(`/atendimento?${params.toString()}#enviar-flow`);
}

function returnToReview(state: string, notice: string): void {
	const safeState = state === "acknowledged" ? "acknowledged" : "pending";
	const params = new URLSearchParams({
		identity_state: safeState,
		identity_notice: notice,
	});
	navigate(`/atendimento?${params.toString()}#identidades-sem-telefone`);
}

export async function acknowledgeIdentityReview(
	formData: FormData,
): Promise<void> {
	const eventId = String(formData.get("event_id") ?? "");
	const state = String(formData.get("identity_state") ?? "pending");
	if (!UUID.test(eventId)) return returnToReview(state, "invalid_event");

	const result = await acknowledgeAdminIdentityReview(eventId);
	if (result.ok) {
		return returnToReview("acknowledged", "reviewed");
	}
	return returnToReview(state, result.error ?? "unavailable");
}

export async function prepareCatalogOrderIntent(
	formData: FormData,
): Promise<void> {
	const intentId = String(formData.get("intent_id") ?? "");
	const paymentMethod = String(formData.get("payment_method") ?? "");
	const customerName = String(formData.get("customer_name") ?? "").trim();
	const addressId = String(formData.get("address_id") ?? "");
	const read = (name: string, maxLength: number): string | null => {
		const value = String(formData.get(name) ?? "").trim();
		return value && value.length <= maxLength ? value : null;
	};
	if (
		!UUID.test(intentId) ||
		!PAYMENT_METHODS.has(paymentMethod) ||
		customerName.length > 180 ||
		(addressId !== "" && !UUID.test(addressId))
	) {
		return returnToCatalogIntent(formData, "catalog_preparation_invalid");
	}
	const newAddress = addressId
		? null
		: {
				street: read("street", 180) ?? "",
				number: read("number", 40) ?? "",
				complement: read("complement", 120),
				neighborhood: read("neighborhood", 120) ?? "",
				city: read("city", 120) ?? "",
				state: (read("state", 2) ?? "").toUpperCase(),
				postalCode: read("postal_code", 16) ?? "",
				reference: read("reference", 180),
			};
	if (
		newAddress &&
		[
			["street", 180],
			["number", 40],
			["complement", 120],
			["neighborhood", 120],
			["city", 120],
			["state", 2],
			["postal_code", 16],
			["reference", 180],
		].some(
			([name, maxLength]) =>
				String(formData.get(String(name)) ?? "").trim().length >
				Number(maxLength),
		)
	) {
		return returnToCatalogIntent(formData, "catalog_preparation_invalid");
	}
	const result = await prepareAdminCatalogIntent({
		intentId,
		paymentMethod,
		customerName: customerName || null,
		addressId: addressId || null,
		newAddress,
	});
	if (result.ok) {
		return returnToCatalogIntent(formData, "catalog_prepared");
	}
	return returnToCatalogIntent(formData, result.error ?? "unavailable");
}

export async function sendCatalogOrderConfirmation(
	formData: FormData,
): Promise<void> {
	const intentId = String(formData.get("intent_id") ?? "");
	if (!UUID.test(intentId)) {
		return returnToCatalogIntent(formData, "catalog_confirmation_invalid");
	}
	const result = await sendAdminCatalogConfirmation(intentId);
	if (!result.ok) {
		return returnToCatalogIntent(formData, result.error ?? "unavailable");
	}
	const notice =
		result.issueCode === "service_window_closed"
			? "service_window_closed"
			: result.status === "sent"
				? "catalog_confirmation_sent"
				: result.status === "sending"
					? "catalog_confirmation_sending"
					: result.status === "reprice_required"
						? "catalog_confirmation_reprice_required"
						: result.status === "delivery_unknown"
							? "catalog_confirmation_delivery_unknown"
							: result.status === "failed"
								? "catalog_confirmation_failed"
								: "catalog_confirmation_needs_review";
	return returnToCatalogIntent(formData, notice);
}

export async function sendBasketFlow(formData: FormData): Promise<void> {
	const conversationId = String(formData.get("conversation_id") ?? "");
	const basketTemplateId = String(formData.get("basket_template_id") ?? "");
	const idempotencyKey = String(formData.get("idempotency_key") ?? "");
	if (
		!UUID.test(conversationId) ||
		!UUID.test(basketTemplateId) ||
		!UUID.test(idempotencyKey)
	) {
		return returnToFlow(formData, "flow_send_request_invalid");
	}
	const result = await sendAdminBasketFlow({
		conversationId,
		basketTemplateId,
		idempotencyKey,
	});
	if (!result.ok) return returnToFlow(formData, result.error);
	const notice =
		result.status === "sent"
			? "flow_send_sent"
			: result.status === "sending" || result.status === "preparing"
				? "flow_send_processing"
				: result.status === "needs_review"
					? "flow_send_needs_review"
					: "flow_send_failed";
	return returnToFlow(formData, notice);
}

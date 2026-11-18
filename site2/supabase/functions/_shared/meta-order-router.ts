import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import type { MetaOrderIngressEvent } from "./meta-order-events.ts";

type JsonRecord = Record<string, unknown>;

export type PersistedMetaOrderContext = {
	sourceEventId: string;
	whatsappAccountId: string;
	conversationId: string | null;
	customerId?: string | null;
};

export type MetaOrderRouteResult =
	| { handled: false; reason: "not_order_confirmation" }
	| { handled: true; retryable: true; reason: string }
	| {
			handled: true;
			retryable: false;
			status: string | null;
			duplicate: boolean;
	  };

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

/**
 * Call only after the raw Meta webhook signature has passed and
 * whatsapp_ingest_event_v1 has durably returned its event/conversation IDs.
 * The caller must skip ANA for handled Flow/Catalog/confirmation messages and
 * ask Meta to retry only when this returns retryable=true.
 */
export async function routeMetaOrderIngressEvent(
	supabaseAdmin: SupabaseClient,
	event: MetaOrderIngressEvent,
	context: PersistedMetaOrderContext,
): Promise<MetaOrderRouteResult> {
	if (
		!isUuid(context.sourceEventId) ||
		!isUuid(context.whatsappAccountId) ||
		!readText(event.messageId, 256)
	) {
		return {
			handled: true,
			retryable: true,
			reason: "durable_order_event_context_missing",
		};
	}
	const conversationId = isUuid(context.conversationId)
		? context.conversationId.toLowerCase()
		: null;

	if (event.kind === "confirmation_reply") {
		if (
			!event.replyId?.startsWith("order-confirm-v1:") ||
			event.replyTitle !== "Confirmar pedido"
		) {
			return { handled: false, reason: "not_order_confirmation" };
		}
		if (!conversationId || !event.senderPhoneE164) {
			return {
				handled: true,
				retryable: false,
				status: "needs_review",
				duplicate: false,
			};
		}
		const { data, error } = await supabaseAdmin.functions.invoke(
			"whatsapp-order-confirmation-v1",
			{
				body: {
					sourceEventId: context.sourceEventId,
					whatsappAccountId: context.whatsappAccountId,
					metaWabaId: event.metaWabaId,
					metaPhoneNumberId: event.metaPhoneNumberId,
					conversationId,
					messageId: event.messageId,
					replyToMessageId: event.replyToMessageId,
					senderPhoneE164: event.senderPhoneE164,
					senderProviderId: event.senderProviderId,
					replyId: event.replyId,
					replyTitle: event.replyTitle,
					issues: event.issues,
				},
			},
		);
		if (error || !isRecord(data) || data.ok !== true) {
			return {
				handled: true,
				retryable: true,
				reason: "order_confirmation_handler_unavailable",
			};
		}
		return {
			handled: true,
			retryable: false,
			status: readText(data.status, 40),
			duplicate: data.duplicate === true,
		};
	}

	if (!event.senderPhoneE164 && !event.senderProviderId) {
		return {
			handled: true,
			retryable: false,
			status: "needs_review",
			duplicate: false,
		};
	}
	const routingIssues = [
		...event.issues,
		...(!event.senderPhoneE164 ? ["sender_phone_unavailable"] : []),
		...(!conversationId ? ["conversation_unresolved"] : []),
	];
	const normalizedEvent =
		event.kind === "catalog_order"
			? {
					kind: event.kind,
					messageId: event.messageId,
					metaPhoneNumberId: event.metaPhoneNumberId,
					metaWabaId: event.metaWabaId,
					senderPhoneE164: event.senderPhoneE164,
					senderProviderId: event.senderProviderId,
					replyToMessageId: event.replyToMessageId,
					catalogId: event.catalogId,
					currency: event.currency,
					items: event.items,
					issues: routingIssues,
				}
			: {
					kind: event.kind,
					messageId: event.messageId,
					metaPhoneNumberId: event.metaPhoneNumberId,
					metaWabaId: event.metaWabaId,
					senderPhoneE164: event.senderPhoneE164,
					senderProviderId: event.senderProviderId,
					replyToMessageId: event.replyToMessageId,
					flowName: event.flowName,
					flowToken: event.flowToken,
					responseJson: event.responseJson,
					responseJsonValid: event.responseJsonValid,
					issues: routingIssues,
				};
	const { data, error } = await supabaseAdmin.functions.invoke(
		"whatsapp-order-intake-v1",
		{
			body: {
				sourceEventId: context.sourceEventId,
				whatsappAccountId: context.whatsappAccountId,
				conversationId,
				customerId: context.customerId ?? null,
				event: normalizedEvent,
			},
		},
	);
	if (error || !isRecord(data) || data.ok !== true) {
		return {
			handled: true,
			retryable: true,
			reason: "order_intake_handler_unavailable",
		};
	}
	return {
		handled: true,
		retryable: false,
		status: readText(data.status, 40),
		duplicate: data.duplicate === true,
	};
}

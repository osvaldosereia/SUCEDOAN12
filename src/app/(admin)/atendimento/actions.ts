"use server";

import { redirect } from "next/navigation";
import { sendAttendanceTextThroughGateway } from "@/lib/supabase/admin-attendance";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_ERRORS = new Set([
	"service_window_closed",
	"human_send_not_homologated",
	"meta_transport_not_configured",
	"meta_send_uncertain",
	"rate_limited",
	"invalid_text",
	"invalid_idempotency_key",
	"not_configured",
	"not_authenticated",
	"not_authorized",
	"unavailable",
]);

function inboxHref(input: {
	accountId: string;
	conversationId: string;
	search: string;
	notice: string;
}): string {
	const params = new URLSearchParams({
		account_id: input.accountId,
		conversation_id: input.conversationId,
		notice: input.notice,
	});
	if (input.search) params.set("search", input.search.slice(0, 80));
	return `/atendimento?${params.toString()}`;
}

export async function sendAttendanceText(formData: FormData): Promise<void> {
	const accountId = String(formData.get("account_id") ?? "");
	const conversationId = String(formData.get("conversation_id") ?? "");
	const search = String(formData.get("search") ?? "")
		.trim()
		.slice(0, 80);
	const text = String(formData.get("text") ?? "").trim();
	const idempotencyKey = String(formData.get("idempotency_key") ?? "");

	if (!UUID.test(accountId) || !UUID.test(conversationId)) {
		redirect("/atendimento?notice=invalid_conversation");
	}
	if (!text || text.length > 4000 || !UUID.test(idempotencyKey)) {
		redirect(
			inboxHref({
				accountId,
				conversationId,
				search,
				notice: "invalid_text",
			}),
		);
	}

	const result = await sendAttendanceTextThroughGateway({
		conversationId,
		text,
		idempotencyKey,
	});
	const notice = result.ok
		? "message_accepted"
		: ACTION_ERRORS.has(result.error)
			? result.error
			: "unavailable";

	redirect(inboxHref({ accountId, conversationId, search, notice }));
}

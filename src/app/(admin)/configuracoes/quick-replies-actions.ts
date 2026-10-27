"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import {
	deactivateAttendanceQuickReplyThroughGateway,
	saveAttendanceQuickReplyThroughGateway,
} from "@/lib/supabase/admin-attendance";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const KNOWN_ERRORS = new Set([
	"quick_reply_title_required",
	"quick_reply_content_required",
	"quick_reply_title_conflict",
	"quick_reply_not_found",
	"invalid_quick_reply_id",
	"invalid_quick_reply_order",
	"not_configured",
	"not_authenticated",
	"not_authorized",
	"unavailable",
	"invalid_response",
]);

function resultHref(notice: string): string {
	return `/configuracoes/respostas-rapidas?notice=${encodeURIComponent(notice)}`;
}

function safeError(error: string): string {
	return KNOWN_ERRORS.has(error) ? error : "unavailable";
}

export async function saveQuickReply(formData: FormData): Promise<void> {
	await requireAdminSession();
	const rawId = String(formData.get("id") ?? "").trim();
	const id = rawId || null;
	const title = String(formData.get("title") ?? "");
	const content = String(formData.get("content") ?? "");
	const sortOrder = Number(formData.get("sort_order") ?? 0);
	if (id && !UUID.test(id)) redirect(resultHref("invalid_quick_reply_id"));

	let failure: string | null = null;
	try {
		const result = await saveAttendanceQuickReplyThroughGateway({
			id,
			title,
			content,
			isFavorite: formData.get("is_favorite") === "on",
			sortOrder,
		});
		if (!result.ok) failure = safeError(result.error);
	} catch {
		failure = "unavailable";
	}
	if (failure) redirect(resultHref(failure));

	revalidatePath("/atendimento");
	revalidatePath("/configuracoes/respostas-rapidas");
	redirect(resultHref("saved"));
}

export async function pauseQuickReply(formData: FormData): Promise<void> {
	await requireAdminSession();
	const id = String(formData.get("id") ?? "").trim();
	if (!UUID.test(id)) redirect(resultHref("invalid_quick_reply_id"));

	let failure: string | null = null;
	try {
		const result = await deactivateAttendanceQuickReplyThroughGateway(id);
		if (!result.ok) failure = safeError(result.error);
	} catch {
		failure = "unavailable";
	}
	if (failure) redirect(resultHref(failure));

	revalidatePath("/atendimento");
	revalidatePath("/configuracoes/respostas-rapidas");
	redirect(resultHref("paused"));
}

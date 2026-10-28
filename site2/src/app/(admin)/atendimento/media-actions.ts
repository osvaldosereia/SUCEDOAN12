"use server";

import { requireAdminSession } from "@/lib/auth/require-admin-session";
import {
	completeAttendanceLibraryUploadThroughGateway,
	getAttendanceMessageMedia,
	prepareAttendanceLibraryUploadThroughGateway,
	sendAttendanceLibraryItemThroughGateway,
} from "@/lib/supabase/admin-attendance";

const LIBRARY_ERROR_CODES = new Set([
	"invalid_media_file",
	"invalid_media_request",
	"media_size_invalid",
	"library_media_kind_invalid",
	"library_mime_invalid",
	"library_title_required",
	"library_mime_type_invalid",
	"library_filename_required",
	"library_original_size_invalid",
	"library_original_size_too_large",
	"library_signed_upload_failed",
	"library_item_invalid",
	"library_upload_expired",
	"library_storage_object_missing",
	"library_stored_size_invalid",
	"library_stored_size_mismatch",
	"library_storage_mime_mismatch",
	"library_thumbnail_missing",
	"library_upload_not_pending",
	"library_upload_incomplete",
	"library_item_inactive",
	"service_window_closed",
	"human_send_not_homologated",
	"meta_transport_not_configured",
	"meta_media_content_mismatch",
	"media_mime_not_allowed",
	"media_send_uncertain",
	"meta_send_uncertain",
	"meta_canary_destination_blocked",
	"media_provider_unavailable",
	"rate_limited",
	"duplicate_not_dispatchable",
	"not_configured",
	"not_authenticated",
	"not_authorized",
	"unavailable",
	"invalid_response",
]);

function mediaError(error: string): string {
	return LIBRARY_ERROR_CODES.has(error) ? error : "unavailable";
}

export async function loadAttendanceMedia(messageId: string) {
	await requireAdminSession();
	try {
		return await getAttendanceMessageMedia(messageId);
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
}

export async function prepareAttendanceMediaUpload(input: {
	title: string;
	mimeType: string;
	filename: string;
	sizeBytes: number;
}) {
	await requireAdminSession();
	try {
		const result = await prepareAttendanceLibraryUploadThroughGateway(input);
		return result.ok
			? result
			: { ok: false as const, error: mediaError(result.error) };
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
}

export async function completeAttendanceMediaUpload(input: {
	itemId: string;
	sizeBytes: number;
}) {
	await requireAdminSession();
	try {
		const result = await completeAttendanceLibraryUploadThroughGateway(input);
		return result.ok
			? result
			: { ok: false as const, error: mediaError(result.error) };
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
}

export async function sendAttendanceMedia(input: {
	conversationId: string;
	itemId: string;
	caption: string;
	idempotencyKey: string;
}) {
	await requireAdminSession();
	try {
		const result = await sendAttendanceLibraryItemThroughGateway(input);
		return result.ok
			? result
			: { ok: false as const, error: mediaError(result.error) };
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
}

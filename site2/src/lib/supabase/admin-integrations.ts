import "server-only";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

export type AdminIntegrationError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "account_not_found"
	| "endpoint_not_deployed"
	| "unavailable";

export type BlingIntegrationReadiness = {
	hubEnabled: boolean | null;
	lastOAuthOkAt: string | null;
	lastReadOnlyOkAt: string | null;
	fiscalSafeOff: boolean | null;
};

export type BlingIntegrationResult =
	| { ok: true; readiness: BlingIntegrationReadiness }
	| { ok: false; error: AdminIntegrationError };

export type MetaChannelStatus =
	| "connected"
	| "not_configured"
	| "account_inactive"
	| "provider_rejected"
	| "provider_unavailable"
	| "provider_invalid_response"
	| "phone_not_in_waba"
	| "phone_mapping_mismatch"
	| "check_incomplete";

export type MetaAccountReadiness = {
	status: MetaChannelStatus;
	verifiedName: string | null;
	qualityRating: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | null;
	checkedAt: string | null;
};

export type MetaAccountReadinessResult =
	| { ok: true; readiness: MetaAccountReadiness }
	| { ok: false; error: AdminIntegrationError };

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function booleanOrNull(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function safeTimestamp(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 40) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeQualityRating(
	value: unknown,
): MetaAccountReadiness["qualityRating"] {
	return value === "GREEN" || value === "YELLOW" || value === "RED"
		? value
		: value === "UNKNOWN"
			? "UNKNOWN"
			: null;
}

/** Reads the canonical gateway readiness and returns only safe display fields. */
export async function getBlingIntegrationReadiness(): Promise<BlingIntegrationResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	const endpoint = new URL("/functions/v1/admin-products-live-v1", supabaseUrl);
	endpoint.searchParams.set("action", "bling_status");

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

	if (response.status === 401) {
		return { ok: false, error: "not_authenticated" };
	}
	if (response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (!response.ok) return { ok: false, error: "unavailable" };

	try {
		const payload = record(await response.json());
		const bling = record(payload?.bling);
		if (payload?.ok !== true || !bling) {
			return { ok: false, error: "unavailable" };
		}

		const fiscal = record(bling.fiscal_readiness);
		return {
			ok: true,
			readiness: {
				hubEnabled: booleanOrNull(bling.hub_enabled),
				lastOAuthOkAt: safeTimestamp(bling.last_oauth_ok_at),
				lastReadOnlyOkAt: safeTimestamp(bling.last_readonly_ok_at),
				fiscalSafeOff: booleanOrNull(fiscal?.safe_off),
			},
		};
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

/**
 * Requests a bounded, read-only Meta Graph check through the authenticated
 * Edge Function. No Meta credential or provider response reaches the browser.
 */
export async function getMetaAccountReadiness(
	whatsappAccountId: string,
): Promise<MetaAccountReadinessResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
			whatsappAccountId,
		)
	) {
		return { ok: false, error: "unavailable" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	let response: Response;
	try {
		response = await fetch(
			new URL("/functions/v1/meta-account-readiness-v1", supabaseUrl),
			{
				method: "POST",
				headers: {
					apikey: supabasePublishableKey,
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/json",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ whatsapp_account_id: whatsappAccountId }),
				cache: "no-store",
			},
		);
	} catch {
		return { ok: false, error: "unavailable" };
	}

	if (response.status === 401) {
		return { ok: false, error: "not_authenticated" };
	}
	if (response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (response.status === 404) {
		try {
			const payload = record(await response.clone().json());
			if (payload?.error === "account_not_found") {
				return { ok: false, error: "account_not_found" };
			}
		} catch {
			// An empty/unrecognized 404 is treated as a missing Edge Function.
		}
		return { ok: false, error: "endpoint_not_deployed" };
	}
	if (!response.ok) return { ok: false, error: "unavailable" };

	try {
		const payload = record(await response.json());
		const readiness = record(payload?.readiness);
		const allowedStatuses = new Set<MetaChannelStatus>([
			"connected",
			"not_configured",
			"account_inactive",
			"provider_rejected",
			"provider_unavailable",
			"provider_invalid_response",
			"phone_not_in_waba",
			"phone_mapping_mismatch",
			"check_incomplete",
		]);
		if (
			payload?.ok !== true ||
			!readiness ||
			typeof readiness.status !== "string" ||
			!allowedStatuses.has(readiness.status as MetaChannelStatus)
		) {
			return { ok: false, error: "unavailable" };
		}
		return {
			ok: true,
			readiness: {
				status: readiness.status as MetaChannelStatus,
				verifiedName:
					typeof readiness.verified_name === "string" &&
					readiness.verified_name.length <= 120
						? readiness.verified_name
						: null,
				qualityRating: safeQualityRating(readiness.quality_rating),
				checkedAt: safeTimestamp(readiness.checked_at),
			},
		};
	} catch {
		return { ok: false, error: "unavailable" };
	}
}

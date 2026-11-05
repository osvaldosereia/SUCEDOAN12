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

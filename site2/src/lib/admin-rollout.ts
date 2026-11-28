import "server-only";

export function isAdminFiscalIssuanceEnabled(): boolean {
	return process.env.ADMIN_FISCAL_ISSUANCE_ENABLED === "true";
}

export function isAdminBlingOrderRecoveryEnabled(): boolean {
	return process.env.ADMIN_BLING_ORDER_RECOVERY_ENABLED === "true";
}

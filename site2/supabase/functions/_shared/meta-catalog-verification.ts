const GRAPH_ORIGIN = "https://graph.facebook.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 256;
const MAX_PAGE_BYTES = 512_000;
const MAX_TOTAL_BYTES = 32_000_000;
const MAX_ELAPSED_MS = 45_000;
const REQUEST_TIMEOUT_MS = 8_000;

type JsonRecord = Record<string, unknown>;

export type MetaCatalogVerificationResult =
	| {
			status: "complete";
			retailerIds: Array<{
				productRetailerId: string;
				status: "verified" | "not_found" | "duplicate";
			}>;
	  }
	| { status: "catalog_not_linked_to_waba" }
	| { status: "catalog_link_ambiguous" }
	| {
			status: "unavailable";
			reason:
				| "invalid_input"
				| "provider_error"
				| "invalid_provider_response"
				| "unsafe_pagination"
				| "scan_limit_reached"
				| "request_failed";
	  };

export type MetaCatalogVerificationInput = {
	wabaId: string;
	catalogId: string;
	productRetailerIds: string[];
	graphApiVersion: string;
	accessToken: string;
	appSecret: string;
	fetcher?: typeof fetch;
};

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (codePoint <= 31 || codePoint === 127) return true;
	}
	return false;
}

function isValidInput(input: MetaCatalogVerificationInput): boolean {
	return (
		typeof input.wabaId === "string" &&
		/^\d{1,256}$/u.test(input.wabaId) &&
		typeof input.catalogId === "string" &&
		/^\d{1,256}$/u.test(input.catalogId) &&
		Array.isArray(input.productRetailerIds) &&
		input.productRetailerIds.length > 0 &&
		input.productRetailerIds.length <= 200 &&
		new Set(input.productRetailerIds).size ===
			input.productRetailerIds.length &&
		input.productRetailerIds.every(
			(retailerId) =>
				typeof retailerId === "string" &&
				retailerId.length > 0 &&
				retailerId.length <= 256 &&
				retailerId.trim() === retailerId &&
				!hasControlCharacters(retailerId),
		) &&
		typeof input.graphApiVersion === "string" &&
		/^v\d+\.\d+$/u.test(input.graphApiVersion) &&
		typeof input.accessToken === "string" &&
		input.accessToken.length > 0 &&
		input.accessToken.length <= 8_192 &&
		typeof input.appSecret === "string" &&
		input.appSecret.length > 0 &&
		input.appSecret.length <= 4_096
	);
}

async function createAppSecretProof(
	accessToken: string,
	appSecret: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(appSecret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(accessToken),
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

type MetaCatalogEdge = "product_catalogs" | "products";

function graphEdgePath(
	version: string,
	parentId: string,
	edge: MetaCatalogEdge,
): string {
	return `/${version}/${parentId}/${edge}`;
}

function createFirstPageUrl(
	version: string,
	parentId: string,
	edge: MetaCatalogEdge,
	field: "id" | "retailer_id",
	appSecretProof: string,
): URL {
	const url = new URL(
		`${GRAPH_ORIGIN}${graphEdgePath(version, parentId, edge)}`,
	);
	url.searchParams.set("fields", field);
	url.searchParams.set("limit", String(PAGE_SIZE));
	url.searchParams.set("appsecret_proof", appSecretProof);
	return url;
}

function createNextPageUrl(
	value: unknown,
	expectedPath: string,
	field: "id" | "retailer_id",
	appSecretProof: string,
): URL | null {
	if (typeof value !== "string" || value.length > 8_192) return null;
	let candidate: URL;
	try {
		candidate = new URL(value);
	} catch {
		return null;
	}
	if (
		candidate.origin !== GRAPH_ORIGIN ||
		candidate.pathname !== expectedPath ||
		candidate.username.length > 0 ||
		candidate.password.length > 0 ||
		candidate.hash.length > 0
	) {
		return null;
	}
	const after = candidate.searchParams.get("after");
	if (!after || after.length > 2_048 || hasControlCharacters(after))
		return null;
	const url = new URL(`${GRAPH_ORIGIN}${expectedPath}`);
	url.searchParams.set("fields", field);
	url.searchParams.set("limit", String(PAGE_SIZE));
	url.searchParams.set("after", after);
	url.searchParams.set("appsecret_proof", appSecretProof);
	return url;
}

async function readJsonBody(
	response: Response,
	maximumBytes: number,
): Promise<{ value: unknown; bytesRead: number } | null> {
	const declaredLength = Number(response.headers.get("Content-Length"));
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
		return null;
	if (!response.body) return null;

	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let bytesRead = 0;
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytesRead += value.byteLength;
			if (bytesRead > maximumBytes) {
				await reader.cancel();
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
		return { value: JSON.parse(text) as unknown, bytesRead };
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

type ScanBudget = {
	pages: number;
	bytes: number;
	startedAt: number;
};

type GraphScanResult =
	| { status: "complete"; matches: Map<string, number> }
	| {
			status: "unavailable";
			reason: Extract<
				MetaCatalogVerificationResult,
				{ status: "unavailable" }
			>["reason"];
	  };

async function scanGraphEdge(
	input: MetaCatalogVerificationInput,
	budget: ScanBudget,
	appSecretProof: string,
	parentId: string,
	edge: MetaCatalogEdge,
	field: "id" | "retailer_id",
	wantedIds: Set<string>,
): Promise<GraphScanResult> {
	const expectedPath = graphEdgePath(input.graphApiVersion, parentId, edge);
	let nextUrl: URL | null = createFirstPageUrl(
		input.graphApiVersion,
		parentId,
		edge,
		field,
		appSecretProof,
	);
	const matches = new Map<string, number>();
	const fetcher = input.fetcher ?? fetch;

	while (nextUrl) {
		const elapsed = Date.now() - budget.startedAt;
		const remainingTime = MAX_ELAPSED_MS - elapsed;
		const remainingBytes = MAX_TOTAL_BYTES - budget.bytes;
		if (
			budget.pages >= MAX_PAGES ||
			remainingBytes <= 0 ||
			remainingTime <= 0
		) {
			return { status: "unavailable", reason: "scan_limit_reached" };
		}
		budget.pages += 1;

		let response: Response;
		try {
			response = await fetcher(nextUrl, {
				method: "GET",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${input.accessToken}`,
				},
				redirect: "manual",
				signal: AbortSignal.timeout(
					Math.min(REQUEST_TIMEOUT_MS, remainingTime),
				),
			});
		} catch {
			return { status: "unavailable", reason: "request_failed" };
		}

		if (
			response.redirected ||
			(response.status >= 300 && response.status < 400)
		) {
			return { status: "unavailable", reason: "unsafe_pagination" };
		}
		if (!response.ok) {
			return { status: "unavailable", reason: "provider_error" };
		}
		if (!response.headers.get("Content-Type")?.includes("application/json")) {
			return { status: "unavailable", reason: "invalid_provider_response" };
		}

		const body = await readJsonBody(
			response,
			Math.min(MAX_PAGE_BYTES, remainingBytes),
		);
		if (!body) {
			return { status: "unavailable", reason: "invalid_provider_response" };
		}
		budget.bytes += body.bytesRead;
		if (budget.bytes > MAX_TOTAL_BYTES) {
			return { status: "unavailable", reason: "scan_limit_reached" };
		}
		if (!isRecord(body.value)) {
			return { status: "unavailable", reason: "invalid_provider_response" };
		}
		if ("error" in body.value) {
			return { status: "unavailable", reason: "provider_error" };
		}
		if (!Array.isArray(body.value.data) || body.value.data.length > PAGE_SIZE) {
			return { status: "unavailable", reason: "invalid_provider_response" };
		}

		for (const row of body.value.data) {
			if (!isRecord(row)) {
				return { status: "unavailable", reason: "invalid_provider_response" };
			}
			const value = row[field];
			if (typeof value !== "string") {
				return { status: "unavailable", reason: "invalid_provider_response" };
			}
			if (wantedIds.has(value)) {
				const count = matches.get(value) ?? 0;
				matches.set(value, Math.min(count + 1, 2));
			}
		}

		const paging = body.value.paging;
		if (paging === undefined || paging === null) {
			nextUrl = null;
			continue;
		}
		if (!isRecord(paging) || !("next" in paging)) {
			return { status: "unavailable", reason: "invalid_provider_response" };
		}
		if (paging.next === undefined || paging.next === null) {
			nextUrl = null;
			continue;
		}
		nextUrl = createNextPageUrl(
			paging.next,
			expectedPath,
			field,
			appSecretProof,
		);
		if (!nextUrl) {
			return { status: "unavailable", reason: "unsafe_pagination" };
		}
	}

	return { status: "complete", matches };
}

/**
 * Confirms that the catalog is linked to the supplied WABA and then performs
 * a bounded, read-only scan for up to 200 exact retailer IDs. The WABA ID must
 * come from the active account record, never from the browser request.
 * Never log this input, request URL, response body, or provider exception.
 */
export async function verifyMetaCatalogRetailerIds(
	input: MetaCatalogVerificationInput,
): Promise<MetaCatalogVerificationResult> {
	if (!isValidInput(input)) {
		return { status: "unavailable", reason: "invalid_input" };
	}

	let appSecretProof: string;
	try {
		appSecretProof = await createAppSecretProof(
			input.accessToken,
			input.appSecret,
		);
	} catch {
		return { status: "unavailable", reason: "invalid_input" };
	}

	const budget: ScanBudget = { pages: 0, bytes: 0, startedAt: Date.now() };
	const catalogLinkScan = await scanGraphEdge(
		input,
		budget,
		appSecretProof,
		input.wabaId,
		"product_catalogs",
		"id",
		new Set([input.catalogId]),
	);
	if (catalogLinkScan.status === "unavailable") return catalogLinkScan;
	const catalogMatches = catalogLinkScan.matches.get(input.catalogId) ?? 0;
	if (catalogMatches === 0) return { status: "catalog_not_linked_to_waba" };
	if (catalogMatches > 1) return { status: "catalog_link_ambiguous" };

	const productScan = await scanGraphEdge(
		input,
		budget,
		appSecretProof,
		input.catalogId,
		"products",
		"retailer_id",
		new Set(input.productRetailerIds),
	);
	if (productScan.status === "unavailable") return productScan;

	return {
		status: "complete",
		retailerIds: input.productRetailerIds.map((productRetailerId) => {
			const matchCount = productScan.matches.get(productRetailerId) ?? 0;
			return {
				productRetailerId,
				status:
					matchCount === 1
						? "verified"
						: matchCount === 0
							? "not_found"
							: "duplicate",
			};
		}),
	};
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
	createClient,
	type SupabaseClient,
} from "npm:@supabase/supabase-js@2.118.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const GRAPH_ORIGIN = "https://graph.facebook.com";
const BODY_LIMIT = 8_000;
const GRAPH_BODY_LIMIT = 256_000;
const TIMEOUT_MS = 12_000;
const ALLOWED_ROLES = new Set(["owner", "admin", "catalog_manager"]);
const ALLOWED_ORIGINS = new Set([
	"https://donaantonia.com.br",
	"https://www.donaantonia.com.br",
	"http://localhost:3000",
	"http://127.0.0.1:3000",
]);
const CHANNELS = new Map([
	["dona-antonia-0975", "0975"],
	["dona-antonia-1018", "1018"],
]);
const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const FLOW_ID = /^[0-9]{6,32}$/u;
const FLOW_JSON_VERSION = "7.3";
const DATA_API_VERSION = "3.0";
const FLOW_MESSAGE_VERSION = "3";

type JsonRecord = Record<string, unknown>;
type AuthResult =
	| { ok: true; client: SupabaseClient; userId: string }
	| { ok: false; status: number; error: string };
type Channel = {
	id: string;
	slug: string;
	wabaId: string;
	phoneNumberId: string;
	channel: string;
};
type Snapshot = {
	ok: true;
	account_id: string;
	account_slug: string;
	key_status:
		| "pending_key_provisioning"
		| "pending_meta_verification"
		| "ready"
		| "disabled";
	vault_secret_present: boolean;
	private_key_sha256: string | null;
	meta_public_key_fingerprint: string | null;
	verified_at: string | null;
	bindings: Binding[];
};
type Binding = {
	id: string;
	meta_flow_id: string;
	flow_json_version: string;
	data_api_version: string;
	flow_message_version: string;
	flow_status: string;
	flow_cta: string;
	body_text: string;
	is_verified: boolean;
	is_send_enabled: boolean;
	verified_at: string | null;
};
type FlowView = {
	id: string;
	name: string;
	status: string;
	jsonVersion: string | null;
	dataApiVersion: string | null;
	endpointMatches: boolean;
	validationErrorCount: number;
	canBind: boolean;
	bound: boolean;
	sendEnabled: boolean;
};
type GraphResult =
	| { ok: true; payload: JsonRecord }
	| {
			ok: false;
			error:
				| "provider_rejected"
				| "provider_unavailable"
				| "provider_invalid_response";
	  };

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const text = value.trim();
	if (!text || text.length > max || containsControl(text, false)) return null;
	return text;
}

function containsControl(value: string, allowLineBreaks: boolean): boolean {
	return Array.from(value).some((character) => {
		const code = character.codePointAt(0) ?? 0;
		return (
			code === 127 ||
			(code < 32 && !(allowLineBreaks && (code === 10 || code === 13)))
		);
	});
}

function readPem(
	value: unknown,
	label: "PRIVATE KEY" | "PUBLIC KEY",
	max: number,
): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.replace(/\\n/gu, "\n");
	if (
		normalized.length > max ||
		containsControl(normalized, true) ||
		!normalized.includes(`-----BEGIN ${label}-----`) ||
		!normalized.includes(`-----END ${label}-----`)
	)
		return null;
	return value;
}

function serviceKey(): string {
	const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
	if (raw) {
		try {
			const keys = JSON.parse(raw) as JsonRecord;
			if (typeof keys.default === "string" && keys.default) return keys.default;
		} catch {
			// Older Supabase projects use the service role key environment variable.
		}
	}
	return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function serviceClient(): SupabaseClient {
	const key = serviceKey();
	if (!SUPABASE_URL || !key) throw new Error("service_not_configured");
	return createClient(SUPABASE_URL, key, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

function corsHeaders(request: Request): HeadersInit {
	const origin = request.headers.get("origin") ?? "";
	const allowed = ALLOWED_ORIGINS.has(origin)
		? origin
		: "https://www.donaantonia.com.br";
	return {
		"Access-Control-Allow-Origin": allowed,
		"Access-Control-Allow-Headers":
			"authorization, apikey, content-type, x-client-info",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Cache-Control": "no-store",
		Vary: "Origin",
	};
}

function json(request: Request, value: JsonRecord, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			...corsHeaders(request),
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

async function readBody(request: Request): Promise<unknown | null> {
	const length = Number(request.headers.get("content-length"));
	if (Number.isFinite(length) && length > BODY_LIMIT) return null;
	if (!request.body) return null;
	const reader = request.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let size = 0;
	let body = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > BODY_LIMIT) {
				await reader.cancel();
				return null;
			}
			body += decoder.decode(value, { stream: true });
		}
		return JSON.parse(body + decoder.decode()) as unknown;
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

async function authorize(request: Request): Promise<AuthResult> {
	const match = /^Bearer\s+([^\s]+)$/iu.exec(
		request.headers.get("authorization") ?? "",
	);
	if (!match) return { ok: false, status: 401, error: "admin_auth_required" };
	const client = serviceClient();
	const { data, error } = await client.auth.getUser(match[1]);
	const userId = data.user?.id;
	if (error || !userId)
		return { ok: false, status: 401, error: "admin_session_invalid" };
	const membership = await client
		.from("admin_users")
		.select("role,is_active")
		.eq("user_id", userId)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS))
		.maybeSingle();
	if (membership.error)
		return { ok: false, status: 503, error: "admin_lookup_failed" };
	const role =
		typeof membership.data?.role === "string" ? membership.data.role : "";
	if (membership.data?.is_active !== true || !ALLOWED_ROLES.has(role)) {
		return { ok: false, status: 403, error: "admin_not_authorized" };
	}
	return { ok: true, client, userId };
}

async function readJson(response: Response): Promise<unknown | null> {
	const length = Number(response.headers.get("content-length"));
	if (Number.isFinite(length) && length > GRAPH_BODY_LIMIT) return null;
	if (!response.body) return null;
	const reader = response.body.getReader();
	const decoder = new TextDecoder("utf-8", { fatal: true });
	let size = 0;
	let body = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > GRAPH_BODY_LIMIT) {
				await reader.cancel();
				return null;
			}
			body += decoder.decode(value, { stream: true });
		}
		return JSON.parse(body + decoder.decode()) as unknown;
	} catch {
		return null;
	} finally {
		reader.releaseLock();
	}
}

async function appSecretProof(token: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

type GraphContext = {
	version: string;
	token: string;
	proof: string;
	channel: Channel;
};

async function graphRequest(
	url: URL,
	context: GraphContext,
	method = "GET",
	body?: URLSearchParams,
): Promise<GraphResult> {
	url.searchParams.set("appsecret_proof", context.proof);
	let response: Response;
	try {
		response = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${context.token}`,
				Accept: "application/json",
				...(body
					? { "Content-Type": "application/x-www-form-urlencoded" }
					: {}),
			},
			body,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		return { ok: false, error: "provider_unavailable" };
	}
	const payload = await readJson(response);
	if (!isRecord(payload))
		return { ok: false, error: "provider_invalid_response" };
	if (!response.ok) {
		return {
			ok: false,
			error:
				response.status === 408 ||
				response.status === 429 ||
				response.status >= 500
					? "provider_unavailable"
					: "provider_rejected",
		};
	}
	return { ok: true, payload };
}

async function graphContext(
	client: SupabaseClient,
	accountId: string,
): Promise<GraphContext | { error: string; status: number }> {
	const { data, error } = await client
		.from("whatsapp_accounts")
		.select("id,slug,waba_id,phone_number_id,is_active")
		.eq("id", accountId)
		.abortSignal(AbortSignal.timeout(TIMEOUT_MS))
		.maybeSingle();
	if (error) return { error: "account_lookup_failed", status: 503 };
	const slug = safeText(data?.slug, 80);
	const channel = slug ? CHANNELS.get(slug) : undefined;
	const wabaId = safeText(data?.waba_id, 256);
	const phoneNumberId = safeText(data?.phone_number_id, 256);
	if (
		!data ||
		!channel ||
		data.is_active !== true ||
		!wabaId ||
		!phoneNumberId ||
		!/^\d{1,256}$/u.test(wabaId) ||
		!/^\d{1,256}$/u.test(phoneNumberId)
	) {
		return { error: "account_not_found", status: 404 };
	}
	const version = safeText(Deno.env.get("META_GRAPH_API_VERSION"), 32);
	const token = safeText(Deno.env.get(`META_ACCESS_TOKEN_${channel}`), 8_192);
	const secret = safeText(
		Deno.env.get(`META_WHATSAPP_APP_SECRET_${channel}`),
		4_096,
	);
	if (!version || !/^v\d+\.\d+$/u.test(version) || !token || !secret) {
		return { error: "meta_credentials_not_configured", status: 503 };
	}
	return {
		channel: { id: data.id, slug, channel, wabaId, phoneNumberId },
		version,
		token,
		proof: await appSecretProof(token, secret),
	};
}

async function setupSnapshot(
	client: SupabaseClient,
	accountId: string,
): Promise<Snapshot | null> {
	const { data, error } = await client.rpc(
		"admin_whatsapp_flow_setup_snapshot_v1",
		{ p_account_id: accountId },
	);
	return !error && isRecord(data) && data.ok === true
		? (data as unknown as Snapshot)
		: null;
}

function expectedEndpoint(channel: Channel): string | null {
	if (!SUPABASE_URL) return null;
	try {
		const url = new URL(
			`/functions/v1/whatsapp-flow-data-exchange-greenfield-v1`,
			SUPABASE_URL,
		);
		url.searchParams.set("account", channel.slug);
		return url.toString();
	} catch {
		return null;
	}
}

function hex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

async function sha256(text: string): Promise<string> {
	return hex(
		new Uint8Array(
			await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
		),
	);
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
	return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 32_768) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
	}
	return btoa(binary);
}

function pem(label: string, bytes: Uint8Array): string {
	const base64 = encodeBase64(bytes);
	const lines = base64.match(/.{1,64}/gu) ?? [];
	return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function decodePem(value: string, label: string): Uint8Array | null {
	const normalized = value.trim().replace(/\\n/gu, "\n");
	const match = new RegExp(
		`-----BEGIN ${label}-----([\\s\\S]+?)-----END ${label}-----`,
		"u",
	).exec(normalized);
	if (!match) return null;
	const base64 = match[1].replace(/\s/gu, "");
	try {
		const binary = atob(base64);
		return Uint8Array.from(binary, (character) => character.charCodeAt(0));
	} catch {
		return null;
	}
}

async function publicFromPrivate(
	privatePem: string,
): Promise<{ publicPem: string; fingerprint: string } | null> {
	const der = decodePem(privatePem, "PRIVATE KEY");
	if (!der) return null;
	try {
		const privateKey = await crypto.subtle.importKey(
			"pkcs8",
			der,
			{ name: "RSA-OAEP", hash: "SHA-256" },
			true,
			["decrypt"],
		);
		const jwk = await crypto.subtle.exportKey("jwk", privateKey);
		const publicKey = await crypto.subtle.importKey(
			"jwk",
			{ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true },
			{ name: "RSA-OAEP", hash: "SHA-256" },
			true,
			["encrypt"],
		);
		const publicDer = new Uint8Array(
			await crypto.subtle.exportKey("spki", publicKey),
		);
		return {
			publicPem: pem("PUBLIC KEY", publicDer),
			fingerprint: await sha256Bytes(publicDer),
		};
	} catch {
		return null;
	}
}

async function publicKeyFingerprint(publicPem: string): Promise<string | null> {
	const der = decodePem(publicPem, "PUBLIC KEY");
	if (!der) return null;
	try {
		const key = await crypto.subtle.importKey(
			"spki",
			der,
			{ name: "RSA-OAEP", hash: "SHA-256" },
			true,
			["encrypt"],
		);
		return await sha256Bytes(
			new Uint8Array(await crypto.subtle.exportKey("spki", key)),
		);
	} catch {
		return null;
	}
}

async function metaEncryptionKey(context: GraphContext): Promise<
	| {
			ok: true;
			keyPem: string | null;
			fingerprint: string | null;
			signatureStatus: string | null;
	  }
	| { ok: false; error: string }
> {
	const url = new URL(
		`/${context.version}/${context.channel.phoneNumberId}/whatsapp_business_encryption`,
		GRAPH_ORIGIN,
	);
	const result = await graphRequest(url, context);
	if (!result.ok) return result;
	const keyPem = readPem(
		result.payload.business_public_key,
		"PUBLIC KEY",
		8_000,
	);
	const signatureStatus =
		safeText(
			result.payload.business_public_key_signature_status,
			32,
		)?.toUpperCase() ?? null;
	if (!keyPem)
		return { ok: true, keyPem: null, fingerprint: null, signatureStatus };
	const fingerprint = await publicKeyFingerprint(keyPem);
	if (!fingerprint) return { ok: false, error: "provider_invalid_response" };
	return { ok: true, keyPem, fingerprint, signatureStatus };
}

async function markKeyReady(
	client: SupabaseClient,
	accountId: string,
	privateHash: string,
	publicFingerprint: string,
): Promise<boolean> {
	const { data, error } = await client.rpc(
		"admin_whatsapp_flow_key_mark_ready_v1",
		{
			p_account_id: accountId,
			p_private_key_sha256: privateHash,
			p_meta_public_key_fingerprint: publicFingerprint,
		},
	);
	return !error && isRecord(data) && data.ok === true;
}

async function listFlows(
	context: GraphContext,
	snapshot: Snapshot,
	keyMatchesMeta: boolean,
): Promise<FlowView[] | { error: string }> {
	const expected = expectedEndpoint(context.channel);
	if (!expected) return { error: "endpoint_not_configured" };
	const byFlow = new Map<string, Binding>();
	for (const binding of snapshot.bindings) {
		const current = byFlow.get(binding.meta_flow_id);
		if (!current || (!current.is_send_enabled && binding.is_send_enabled)) {
			byFlow.set(binding.meta_flow_id, binding);
		}
	}
	const flows: FlowView[] = [];
	const seen = new Set<string>();
	let after: string | null = null;
	for (let page = 0; page < 3; page += 1) {
		const url = new URL(
			`/${context.version}/${context.channel.wabaId}/flows`,
			GRAPH_ORIGIN,
		);
		url.searchParams.set(
			"fields",
			"id,name,status,json_version,data_api_version,data_channel_uri,validation_errors",
		);
		url.searchParams.set("limit", "50");
		if (after) url.searchParams.set("after", after);
		const result = await graphRequest(url, context);
		if (!result.ok) return { error: result.error };
		if (!Array.isArray(result.payload.data) || result.payload.data.length > 50)
			return { error: "provider_invalid_response" };
		for (const item of result.payload.data) {
			if (!isRecord(item)) return { error: "provider_invalid_response" };
			const id = safeText(item.id, 32);
			if (!id || !FLOW_ID.test(id))
				return { error: "provider_invalid_response" };
			const name = safeText(item.name, 120) ?? "Flow sem nome";
			const status = safeText(item.status, 32)?.toUpperCase() ?? "UNKNOWN";
			const jsonVersion = safeText(item.json_version, 16);
			const dataApiVersion = safeText(item.data_api_version, 32);
			const endpoint = safeText(item.data_channel_uri, 1_024);
			const validationErrorCount = Array.isArray(item.validation_errors)
				? item.validation_errors.length
				: isRecord(item.validation_errors)
					? Object.keys(item.validation_errors).length
					: 0;
			const binding = byFlow.get(id);
			const endpointMatches = endpoint === expected;
			const canBind =
				status === "PUBLISHED" &&
				validationErrorCount === 0 &&
				endpointMatches &&
				jsonVersion === FLOW_JSON_VERSION &&
				dataApiVersion === DATA_API_VERSION &&
				snapshot.key_status === "ready" &&
				keyMatchesMeta;
			flows.push({
				id,
				name,
				status,
				jsonVersion,
				dataApiVersion,
				endpointMatches,
				validationErrorCount,
				canBind,
				bound: binding?.is_verified === true,
				sendEnabled: binding?.is_send_enabled === true,
			});
		}
		const paging = isRecord(result.payload.paging)
			? result.payload.paging
			: null;
		if (typeof paging?.next !== "string") break;
		const cursors = isRecord(paging.cursors) ? paging.cursors : null;
		after = safeText(cursors?.after, 2_048);
		if (!after || seen.has(after))
			return { error: "provider_pagination_invalid" };
		seen.add(after);
	}
	return flows;
}

async function inspect(
	context: GraphContext,
	client: SupabaseClient,
): Promise<JsonRecord> {
	const snapshot = await setupSnapshot(client, context.channel.id);
	if (!snapshot) return { ok: false, error: "flow_setup_snapshot_unavailable" };
	const encryption = await metaEncryptionKey(context);
	const keyMatchesMeta =
		encryption.ok &&
		snapshot.key_status === "ready" &&
		encryption.fingerprint !== null &&
		encryption.fingerprint === snapshot.meta_public_key_fingerprint &&
		encryption.signatureStatus === "VALID";
	const flows = await listFlows(context, snapshot, keyMatchesMeta);
	return {
		ok: true,
		account: { id: snapshot.account_id, slug: snapshot.account_slug },
		key: {
			status: snapshot.key_status,
			vaultSecretPresent: snapshot.vault_secret_present,
			metaKeyPresent: encryption.ok ? encryption.keyPem !== null : null,
			metaFingerprint: encryption.ok ? encryption.fingerprint : null,
			verifiedMetaFingerprint: snapshot.meta_public_key_fingerprint,
			metaSignatureStatus: encryption.ok ? encryption.signatureStatus : null,
			verifiedAt: snapshot.verified_at,
			issue: encryption.ok ? null : encryption.error,
		},
		bindings: snapshot.bindings,
		flows: Array.isArray(flows) ? flows : [],
		flowListIssue: Array.isArray(flows) ? null : flows.error,
	};
}

async function generatePrivateKey(): Promise<{
	privatePem: string;
	publicPem: string;
	publicFingerprint: string;
}> {
	const pair = (await crypto.subtle.generateKey(
		{
			name: "RSA-OAEP",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["encrypt", "decrypt"],
	)) as CryptoKeyPair;
	const privateDer = new Uint8Array(
		await crypto.subtle.exportKey("pkcs8", pair.privateKey),
	);
	const publicDer = new Uint8Array(
		await crypto.subtle.exportKey("spki", pair.publicKey),
	);
	const publicPem = pem("PUBLIC KEY", publicDer);
	return {
		privatePem: pem("PRIVATE KEY", privateDer),
		publicPem,
		publicFingerprint: await sha256Bytes(publicDer),
	};
}

async function setupKey(
	context: GraphContext,
	client: SupabaseClient,
): Promise<JsonRecord> {
	const snapshot = await setupSnapshot(client, context.channel.id);
	if (!snapshot) return { ok: false, error: "flow_setup_snapshot_unavailable" };
	if (snapshot.key_status === "disabled")
		return { ok: false, error: "flow_key_disabled" };
	const metaKey = await metaEncryptionKey(context);
	if (!metaKey.ok) return { ok: false, error: metaKey.error };

	const { data: candidateResult, error: candidateError } = await client.rpc(
		"admin_whatsapp_flow_key_candidate_resolve_v1",
		{ p_account_id: context.channel.id },
	);
	let privatePem: string | null = null;
	if (
		!candidateError &&
		isRecord(candidateResult) &&
		candidateResult.ok === true
	) {
		privatePem = readPem(
			candidateResult.private_key_pkcs8,
			"PRIVATE KEY",
			16_000,
		);
	}
	if (!privatePem && metaKey.keyPem) {
		return { ok: false, error: "meta_key_exists_without_local_key" };
	}
	if (!privatePem) {
		if (
			snapshot.vault_secret_present ||
			snapshot.key_status !== "pending_key_provisioning"
		) {
			return { ok: false, error: "local_key_state_conflict" };
		}
		const generated = await generatePrivateKey();
		privatePem = generated.privatePem;
	}

	const derived = await publicFromPrivate(privatePem);
	if (!derived) return { ok: false, error: "local_private_key_invalid" };
	const privateHash = await sha256(privatePem);
	const { data: stored, error: storeError } = await client.rpc(
		"admin_whatsapp_flow_key_store_v1",
		{
			p_account_id: context.channel.id,
			p_private_key_pkcs8: privatePem,
			p_private_key_sha256: privateHash,
		},
	);
	privatePem = null;
	if (storeError || !isRecord(stored) || stored.ok !== true) {
		return {
			ok: false,
			error:
				isRecord(stored) && typeof stored.error === "string"
					? stored.error
					: "key_vault_store_failed",
		};
	}

	if (metaKey.keyPem && metaKey.fingerprint !== derived.fingerprint) {
		return { ok: false, error: "meta_key_mismatch" };
	}
	if (!metaKey.keyPem) {
		const url = new URL(
			`/${context.version}/${context.channel.phoneNumberId}/whatsapp_business_encryption`,
			GRAPH_ORIGIN,
		);
		const body = new URLSearchParams({
			business_public_key: derived.publicPem,
		});
		await graphRequest(url, context, "POST", body);
	}

	const readback = await metaEncryptionKey(context);
	if (!readback.ok) return { ok: false, error: "meta_key_readback_failed" };
	if (
		readback.fingerprint !== derived.fingerprint ||
		readback.signatureStatus !== "VALID"
	) {
		return {
			ok: false,
			error: readback.keyPem ? "meta_key_mismatch" : "meta_key_not_verified",
		};
	}
	const markedReady = await markKeyReady(
		client,
		context.channel.id,
		privateHash,
		derived.fingerprint,
	);
	return markedReady
		? { ok: true, key: { status: "ready", fingerprint: derived.fingerprint } }
		: { ok: false, error: "key_state_update_failed" };
}

async function readFlow(
	context: GraphContext,
	flowId: string,
): Promise<{ ok: true; flow: FlowView } | { ok: false; error: string }> {
	const url = new URL(`/${context.version}/${flowId}`, GRAPH_ORIGIN);
	url.searchParams.set(
		"fields",
		"id,name,status,json_version,data_api_version,data_channel_uri,validation_errors,whatsapp_business_account",
	);
	const result = await graphRequest(url, context);
	if (!result.ok) return result;
	const item = result.payload;
	const id = safeText(item.id, 32);
	const status = safeText(item.status, 32)?.toUpperCase() ?? "UNKNOWN";
	const waba = isRecord(item.whatsapp_business_account)
		? safeText(item.whatsapp_business_account.id, 256)
		: null;
	const jsonVersion = safeText(item.json_version, 16);
	const dataApiVersion = safeText(item.data_api_version, 32);
	const endpoint = safeText(item.data_channel_uri, 1_024);
	const expected = expectedEndpoint(context.channel);
	const validationErrorCount = Array.isArray(item.validation_errors)
		? item.validation_errors.length
		: isRecord(item.validation_errors)
			? Object.keys(item.validation_errors).length
			: 0;
	if (!id || id !== flowId || (waba && waba !== context.channel.wabaId))
		return { ok: false, error: "flow_account_mismatch" };
	const endpointMatches = endpoint === expected;
	const flow: FlowView = {
		id,
		name: safeText(item.name, 120) ?? "Flow sem nome",
		status,
		jsonVersion,
		dataApiVersion,
		endpointMatches,
		validationErrorCount,
		canBind:
			status === "PUBLISHED" &&
			validationErrorCount === 0 &&
			endpointMatches &&
			jsonVersion === FLOW_JSON_VERSION &&
			dataApiVersion === DATA_API_VERSION,
		bound: false,
		sendEnabled: false,
	};
	return { ok: true, flow };
}

async function bindFlow(
	context: GraphContext,
	client: SupabaseClient,
	actorId: string,
	flowId: string,
): Promise<JsonRecord> {
	if (!FLOW_ID.test(flowId)) return { ok: false, error: "flow_id_invalid" };
	const snapshot = await setupSnapshot(client, context.channel.id);
	if (snapshot?.key_status !== "ready")
		return { ok: false, error: "flow_key_not_ready" };
	const encryption = await metaEncryptionKey(context);
	if (!encryption.ok) return { ok: false, error: encryption.error };
	if (
		encryption.signatureStatus !== "VALID" ||
		encryption.fingerprint !== snapshot.meta_public_key_fingerprint
	) {
		return { ok: false, error: "meta_key_mismatch" };
	}
	const accountFlows = await listFlows(context, snapshot, true);
	if (!Array.isArray(accountFlows))
		return { ok: false, error: accountFlows.error };
	if (!accountFlows.some((flow) => flow.id === flowId))
		return { ok: false, error: "flow_account_mismatch" };
	const detail = await readFlow(context, flowId);
	if (!detail.ok) return { ok: false, error: detail.error };
	if (!detail.flow.canBind) {
		return {
			ok: false,
			error:
				detail.flow.status !== "PUBLISHED"
					? "flow_not_published"
					: !detail.flow.endpointMatches
						? "flow_endpoint_mismatch"
						: detail.flow.validationErrorCount
							? "flow_validation_errors"
							: "flow_version_unsupported",
		};
	}
	const { data, error } = await client.rpc(
		"admin_whatsapp_flow_binding_upsert_v1",
		{
			p_account_id: context.channel.id,
			p_actor_id: actorId,
			p_meta_flow_id: detail.flow.id,
			p_flow_json_version: detail.flow.jsonVersion,
			p_data_api_version: detail.flow.dataApiVersion,
			p_flow_message_version: FLOW_MESSAGE_VERSION,
			p_flow_status: detail.flow.status,
			p_flow_cta: "Montar cesta",
			p_body_text:
				"Monte sua cesta básica escolhendo os produtos e as quantidades.",
		},
	);
	return !error && isRecord(data) && data.ok === true
		? { ok: true, bindingId: data.binding_id, sendEnabled: false }
		: {
				ok: false,
				error:
					isRecord(data) && typeof data.error === "string"
						? data.error
						: "flow_binding_save_failed",
			};
}

async function enableFlow(
	context: GraphContext,
	client: SupabaseClient,
	bindingId: string,
): Promise<JsonRecord> {
	if (!UUID.test(bindingId)) return { ok: false, error: "binding_id_invalid" };
	const snapshot = await setupSnapshot(client, context.channel.id);
	if (snapshot?.key_status !== "ready")
		return { ok: false, error: "flow_key_not_ready" };
	const binding = snapshot.bindings.find((item) => item.id === bindingId);
	if (!binding) return { ok: false, error: "flow_binding_not_found" };
	const encryption = await metaEncryptionKey(context);
	if (!encryption.ok) return { ok: false, error: encryption.error };
	if (
		encryption.signatureStatus !== "VALID" ||
		encryption.fingerprint !== snapshot.meta_public_key_fingerprint
	) {
		return { ok: false, error: "meta_key_mismatch" };
	}
	const accountFlows = await listFlows(context, snapshot, true);
	if (
		!Array.isArray(accountFlows) ||
		!accountFlows.some((flow) => flow.id === binding.meta_flow_id)
	) {
		return { ok: false, error: "flow_account_mismatch" };
	}
	const detail = await readFlow(context, binding.meta_flow_id);
	if (!detail.ok) return { ok: false, error: detail.error };
	if (
		!detail.flow.canBind ||
		detail.flow.jsonVersion !== binding.flow_json_version ||
		detail.flow.dataApiVersion !== binding.data_api_version
	) {
		return { ok: false, error: "flow_binding_no_longer_valid" };
	}
	const { data, error } = await client.rpc(
		"admin_whatsapp_flow_binding_enable_v1",
		{
			p_account_id: context.channel.id,
			p_binding_id: bindingId,
		},
	);
	return !error && isRecord(data) && data.ok === true
		? { ok: true, bindingId, sendEnabled: true }
		: {
				ok: false,
				error:
					isRecord(data) && typeof data.error === "string"
						? data.error
						: "flow_enable_failed",
			};
}

async function disableFlow(
	client: SupabaseClient,
	accountId: string,
	bindingId: string,
): Promise<JsonRecord> {
	if (!UUID.test(bindingId)) return { ok: false, error: "binding_id_invalid" };
	const { data, error } = await client.rpc(
		"admin_whatsapp_flow_binding_disable_v1",
		{
			p_account_id: accountId,
			p_binding_id: bindingId,
		},
	);
	return !error && isRecord(data) && data.ok === true
		? { ok: true, bindingId, sendEnabled: false }
		: {
				ok: false,
				error:
					isRecord(data) && typeof data.error === "string"
						? data.error
						: "flow_disable_failed",
			};
}

async function handle(request: Request): Promise<Response> {
	const body = await readBody(request);
	if (
		!isRecord(body) ||
		!UUID.test(String(body.accountId ?? "")) ||
		typeof body.action !== "string"
	) {
		return json(request, { ok: false, error: "invalid_request" }, 400);
	}
	const auth = await authorize(request);
	if (!auth.ok)
		return json(request, { ok: false, error: auth.error }, auth.status);
	const accountId = String(body.accountId).toLowerCase();
	if (body.action === "disable_flow") {
		const bindingId = safeText(body.bindingId, 36) ?? "";
		return json(request, await disableFlow(auth.client, accountId, bindingId));
	}
	const context = await graphContext(auth.client, accountId);
	if ("error" in context)
		return json(request, { ok: false, error: context.error }, context.status);

	if (body.action === "inspect")
		return json(request, await inspect(context, auth.client));
	if (body.action === "setup_key")
		return json(request, await setupKey(context, auth.client));
	if (body.action === "bind_flow") {
		const flowId = safeText(body.flowId, 32) ?? "";
		return json(
			request,
			await bindFlow(context, auth.client, auth.userId, flowId),
		);
	}
	if (body.action === "enable_flow") {
		const bindingId = safeText(body.bindingId, 36) ?? "";
		return json(request, await enableFlow(context, auth.client, bindingId));
	}
	return json(request, { ok: false, error: "unsupported_action" }, 400);
}

Deno.serve(async (request: Request) => {
	const origin = request.headers.get("origin") ?? "";
	if (origin && !ALLOWED_ORIGINS.has(origin))
		return json(request, { ok: false, error: "origin_not_allowed" }, 403);
	if (request.method === "OPTIONS")
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	if (request.method !== "POST")
		return json(request, { ok: false, error: "method_not_allowed" }, 405);
	try {
		return await handle(request);
	} catch {
		return json(request, { ok: false, error: "service_unavailable" }, 503);
	}
});

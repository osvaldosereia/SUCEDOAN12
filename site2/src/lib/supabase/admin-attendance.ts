import "server-only";
import {
	type AdminFlowSendAttempt,
	getAdminFlowSendAttempts,
} from "@/lib/supabase/admin-order-flow";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type GatewayError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "unavailable"
	| "invalid_response";

type GatewayResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: GatewayError; gatewayCode?: string };

type JsonRecord = Record<string, unknown>;

export type AttendanceAccount = {
	id: string;
	slug: string;
	name: string;
	phone: string;
};

export type AttendanceLabel = {
	id: string;
	name: string;
	color: string | null;
};

export type AttendanceQueueItem = {
	conversationId: string;
	accountId: string;
	customerId: string | null;
	displayName: string;
	phone: string | null;
	status: string;
	mode: string;
	humanRequired: boolean;
	unreadCount: number;
	lastMessageText: string;
	lastMessageType: string;
	lastMessageDirection: string;
	lastMessageAt: string | null;
	serviceWindowExpiresAt: string | null;
	hasOrder: boolean;
	orderNumber: string | null;
	registrationIncomplete: boolean;
	labels: AttendanceLabel[];
};

export type AttendanceMessage = {
	id: string;
	direction: string;
	type: string;
	text: string;
	interactiveSummary: string | null;
	status: string;
	messageAt: string | null;
};

export type AttendanceMedia = {
	url: string;
	mimeType: string;
	filename: string | null;
	expiresAt: string;
};

export type AttendanceQuickReply = {
	id: string;
	title: string;
	content: string;
	isFavorite: boolean;
	sortOrder: number;
	isActive: boolean;
};

export type AttendanceLibraryItem = {
	id: string;
	title: string;
	mediaKind: "image" | "video" | "audio" | "document";
	mimeType: string;
	filename: string;
	sizeBytes: number;
	createdAt: string | null;
};

export type AttendanceLibraryUpload = {
	itemId: string;
	path: string;
	token: string;
	mediaKind: AttendanceLibraryItem["mediaKind"];
	mimeType: string;
	thumbnail: { path: string; token: string } | null;
};

export type AttendanceMediaError =
	| "invalid_message_id"
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "media_too_large"
	| "media_unavailable"
	| "unavailable";

export type AttendanceMediaResult =
	| { ok: true; media: AttendanceMedia }
	| { ok: false; error: AttendanceMediaError };

export type AttendanceConversation = {
	id: string;
	accountId: string;
	phone: string | null;
	status: string;
	mode: string;
	humanRequired: boolean;
	lastInboundAt: string | null;
	serviceWindowOpen: boolean;
	serviceWindowExpiresAt: string | null;
	canSendText: boolean;
	canSendInteractive: boolean;
	interactiveBlockReason: string | null;
	sendBlockReason: string | null;
	flowSendAttempts: AdminFlowSendAttempt[];
	flowSendStatusUnavailable: boolean;
	canSendFlow: boolean;
	flowSendBlockReason: string | null;
	nextBefore: string | null;
	messages: AttendanceMessage[];
};

export type AttendanceContext = {
	conversation: {
		id: string;
		accountId: string | null;
		customerId: string | null;
		phone: string | null;
	} | null;
	customer: { name: string; phone: string | null; orderCount: number } | null;
	address: {
		label: string | null;
		street: string | null;
		number: string | null;
		complement: string | null;
		neighborhood: string | null;
		city: string | null;
		state: string | null;
		postalCode: string | null;
		reference: string | null;
	} | null;
	orders: Array<{
		id: string;
		number: string | null;
		status: string;
		total: number | null;
		createdAt: string | null;
	}>;
	registrationIncomplete: boolean;
};

const PAGE_SIZE = 50;

function record(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function string(value: unknown, limit = 500): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, limit) : null;
}

function cleanInlineText(value: unknown, limit: number): string | null {
	const raw = string(value, limit * 2);
	if (!raw) return null;
	const cleaned = raw
		.replace(/[\p{Cc}\p{Cf}]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, limit);
	return cleaned || null;
}

function toInteractiveSummary(
	value: unknown,
	messageType: string,
): {
	text: string | null;
	hideTextBody: boolean;
} {
	const interactive = record(record(value)?.interactive);
	const kind = string(interactive?.type, 40)?.toLowerCase();
	if (kind === "nfm_reply") {
		return { text: "Resposta do Flow recebida", hideTextBody: true };
	}
	if (kind === "list_reply") {
		const title = cleanInlineText(record(interactive?.list_reply)?.title, 160);
		return {
			text: title ? `Selecionou: ${title}` : null,
			hideTextBody: true,
		};
	}
	if (kind === "button_reply") {
		const title = cleanInlineText(
			record(interactive?.button_reply)?.title,
			160,
		);
		return {
			text: title ? `Selecionou: ${title}` : null,
			hideTextBody: true,
		};
	}
	if (messageType === "button") {
		const title = cleanInlineText(record(record(value)?.button)?.text, 160);
		return {
			text: title ? `Selecionou: ${title}` : null,
			hideTextBody: true,
		};
	}
	return {
		text: null,
		hideTextBody: ["interactive", "button", "order"].includes(messageType),
	};
}

function numeric(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const ATTENDANCE_MEDIA_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"audio/ogg",
	"audio/mpeg",
	"audio/mp4",
	"audio/aac",
	"audio/wav",
	"audio/x-wav",
	"video/mp4",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/zip",
	"application/octet-stream",
]);

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function safeAttendanceMediaUrl(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048 || !supabaseUrl) {
		return null;
	}

	try {
		const expected = new URL(supabaseUrl);
		const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
		if (
			expected.protocol !== "https:" &&
			!(expected.protocol === "http:" && localHosts.has(expected.hostname))
		) {
			return null;
		}
		const url = new URL(value);
		if (
			url.origin !== expected.origin ||
			url.username ||
			url.password ||
			url.hash ||
			!url.pathname.startsWith(
				"/storage/v1/object/sign/attendance-media-v1/",
			) ||
			!url.searchParams.get("token")
		) {
			return null;
		}
		return url.toString();
	} catch {
		return null;
	}
}

function safeAttendanceMediaFilename(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const safe = value
		.replace(/\p{Cc}/gu, " ")
		.replace(/[/\\]/gu, " ")
		.replace(/\s+/gu, " ")
		.trim()
		.slice(0, 180);
	return safe || null;
}

function safeAttendanceLibraryPath(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 1024) return null;
	const path = value.trim();
	if (
		!path ||
		path.startsWith("/") ||
		path.includes("\\") ||
		/%2f|%5c/iu.test(path) ||
		/[\p{Cc}]/u.test(path)
	) {
		return null;
	}
	const segments = path.split("/");
	if (
		segments.some((segment) => !segment || segment === "." || segment === "..")
	) {
		return null;
	}
	return path;
}

function safeAttendanceLibraryKind(
	value: unknown,
): AttendanceLibraryItem["mediaKind"] | null {
	return value === "image" ||
		value === "video" ||
		value === "audio" ||
		value === "document"
		? value
		: null;
}

function toAttendanceLibraryItem(value: unknown): AttendanceLibraryItem | null {
	const row = record(value);
	if (!row) return null;
	const id = string(row.id, 80);
	const mediaKind = safeAttendanceLibraryKind(row.media_kind);
	const mimeType = string(row.mime_type, 180)?.toLowerCase();
	const filename = safeAttendanceMediaFilename(row.original_filename);
	const title = string(row.title, 120);
	const sizeBytes = numeric(row.stored_size_bytes);
	if (
		!id ||
		!UUID.test(id) ||
		!mediaKind ||
		!mimeType ||
		!filename ||
		!title ||
		!sizeBytes ||
		sizeBytes < 1
	) {
		return null;
	}
	return {
		id,
		title,
		mediaKind,
		mimeType,
		filename,
		sizeBytes,
		createdAt: string(row.created_at, 60),
	};
}

function safeColor(value: unknown): string | null {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
		? value
		: null;
}

async function callGateway<T>(
	action: string,
	params: Record<string, string>,
	method: "GET" | "POST" = "GET",
	body?: JsonRecord,
): Promise<GatewayResult<T>> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	const accessToken = sessionData.session?.access_token;
	if (sessionError || !accessToken) {
		return { ok: false, error: "not_authenticated" };
	}

	const endpoint = new URL("/functions/v1/admin-whatsapp-ops-v1", supabaseUrl);
	endpoint.searchParams.set("action", action);
	for (const [key, value] of Object.entries(params)) {
		endpoint.searchParams.set(key, value);
	}

	let response: Response;
	try {
		response = await fetch(endpoint, {
			method,
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
				...(method === "POST" ? { "Content-Type": "application/json" } : {}),
			},
			...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}

	let payload: JsonRecord | null;
	try {
		payload = record(await response.json());
	} catch {
		return { ok: false, error: "invalid_response" };
	}

	if (response.status === 401 || response.status === 403) {
		return { ok: false, error: "not_authorized" };
	}
	if (!response.ok) {
		return {
			ok: false,
			error: "unavailable",
			gatewayCode: string(payload?.error, 80) ?? undefined,
		};
	}
	if (payload?.ok !== true) {
		return {
			ok: false,
			error: "invalid_response",
			gatewayCode: string(payload?.error, 80) ?? undefined,
		};
	}
	return { ok: true, data: payload as T };
}

function toAccount(value: unknown): AttendanceAccount | null {
	const row = record(value);
	if (!row) return null;
	const id = string(row.id, 80);
	const slug = string(row.slug, 80);
	const name = string(row.display_name, 120);
	const phone = string(row.phone_e164, 40);
	if (!id || !slug || !name || !phone) return null;
	return { id, slug, name, phone };
}

function toLabel(value: unknown): AttendanceLabel | null {
	const row = record(value);
	if (!row) return null;
	const id = string(row.id, 80);
	const name = string(row.name, 80);
	if (!id || !name) return null;
	return { id, name, color: safeColor(row.color) };
}

function toQueueItem(value: unknown): AttendanceQueueItem | null {
	const row = record(value);
	if (!row) return null;
	const conversationId = string(row.conversation_id, 80);
	const accountId = string(row.whatsapp_account_id, 80);
	if (!conversationId || !accountId) return null;
	const lastMessageType = (
		string(row.last_message_type, 40) ?? "unknown"
	).toLowerCase();
	const lastMessageDirection = (
		string(row.last_message_direction, 20) ?? "inbound"
	).toLowerCase();
	const lastMessageHasStructuredPayload = [
		"interactive",
		"button",
		"order",
	].includes(lastMessageType);
	const labels = Array.isArray(row.labels)
		? row.labels
				.map(toLabel)
				.filter((label): label is AttendanceLabel => label !== null)
		: [];

	return {
		conversationId,
		accountId,
		customerId: string(row.customer_id, 80),
		displayName: string(row.display_name, 120) ?? "Contato WhatsApp",
		phone: string(row.phone_e164, 40),
		status: string(row.status, 40) ?? "open",
		mode: string(row.mode, 40) ?? "bot",
		humanRequired: row.human_required === true,
		unreadCount: Math.max(0, numeric(row.unread_count) ?? 0),
		lastMessageText: lastMessageHasStructuredPayload
			? "Sem mensagem de texto"
			: (string(row.last_message_text, 300) ?? "Sem mensagem de texto"),
		lastMessageType,
		lastMessageDirection,
		lastMessageAt: string(row.last_message_at, 60),
		serviceWindowExpiresAt: string(row.service_window_expires_at, 60),
		hasOrder: row.has_order === true,
		orderNumber: string(row.received_order_number, 80),
		registrationIncomplete: row.registration_incomplete === true,
		labels,
	};
}

function toMessage(value: unknown): AttendanceMessage | null {
	const row = record(value);
	if (!row) return null;
	const id = string(row.id, 80);
	if (!id) return null;
	const type = (string(row.message_type, 40) ?? "unknown").toLowerCase();
	const interactive = toInteractiveSummary(row.metadata, type);
	return {
		id,
		direction: (string(row.direction, 20) ?? "inbound").toLowerCase(),
		type,
		text: interactive.hideTextBody ? "" : (string(row.text_body, 4000) ?? ""),
		interactiveSummary: interactive.text,
		status: string(row.status_current, 40) ?? "received",
		messageAt: string(row.message_at, 60),
	};
}

export async function getAttendanceAccounts(): Promise<
	GatewayResult<AttendanceAccount[]>
> {
	const result = await callGateway<{ items?: unknown[] }>("accounts", {});
	if (!result.ok) return result;
	if (!Array.isArray(result.data.items)) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		data: result.data.items
			.map(toAccount)
			.filter((account): account is AttendanceAccount => account !== null),
	};
}

export async function getAttendanceQueue(
	accountId: string,
	search: string,
): Promise<GatewayResult<AttendanceQueueItem[]>> {
	const result = await callGateway<{
		items?: unknown[];
	}>("queue", {
		account_id: accountId,
		limit: String(PAGE_SIZE),
		...(search ? { search: search.slice(0, 80) } : {}),
	});
	if (!result.ok) return result;
	if (!Array.isArray(result.data.items)) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		data: result.data.items
			.map(toQueueItem)
			.filter((item): item is AttendanceQueueItem => item !== null),
	};
}

export async function getAttendanceConversation(
	conversationId: string,
): Promise<GatewayResult<AttendanceConversation>> {
	const [result, flowSendResult] = await Promise.all([
		callGateway<{
			conversation?: unknown;
			service_window?: unknown;
			send_capability?: unknown;
			next_before?: unknown;
			messages?: unknown[];
		}>("conversation", { conversation_id: conversationId, limit: "30" }),
		getAdminFlowSendAttempts(conversationId),
	]);
	if (!result.ok) return result;
	const row = record(result.data.conversation);
	if (!row) return { ok: false, error: "invalid_response" };
	const serviceWindow = record(result.data.service_window);
	const sendCapability = record(result.data.send_capability);
	const sendProvider = string(sendCapability?.provider, 24);
	const messages = Array.isArray(result.data.messages)
		? result.data.messages
				.map(toMessage)
				.filter((message): message is AttendanceMessage => message !== null)
		: [];
	const flowMessages: AttendanceMessage[] = flowSendResult.items.map(
		(attempt) => {
			const statusText: Record<AdminFlowSendAttempt["status"], string> = {
				preparing: "preparando o envio",
				sending: "enviando",
				sent: "enviado",
				failed: "não foi enviado",
				needs_review: "sem confirmação; confira antes de reenviar",
			};
			return {
				id: `flow-send-${attempt.id}`,
				direction: "outbound",
				type: "interactive",
				text: `Flow de cesta ${attempt.basketName}: ${statusText[attempt.status]}.`,
				interactiveSummary: null,
				status:
					attempt.status === "needs_review"
						? "needs_review"
						: attempt.status === "preparing" || attempt.status === "sending"
							? "sending"
							: attempt.status,
				messageAt: attempt.createdAt,
			};
		},
	);
	const conversationMessages = [...messages, ...flowMessages].sort(
		(left, right) => {
			const leftTime = left.messageAt ? Date.parse(left.messageAt) : 0;
			const rightTime = right.messageAt ? Date.parse(right.messageAt) : 0;
			return leftTime - rightTime || left.id.localeCompare(right.id);
		},
	);

	return {
		ok: true,
		data: {
			id: string(row.id, 80) ?? conversationId,
			accountId: string(row.whatsapp_account_id, 80) ?? "",
			phone: string(row.phone_e164, 40),
			status: string(row.status, 40) ?? "open",
			mode: string(row.mode, 40) ?? "bot",
			humanRequired: row.human_required === true,
			lastInboundAt: string(row.last_inbound_at, 60),
			serviceWindowOpen: serviceWindow?.open === true,
			serviceWindowExpiresAt: string(row.service_window_expires_at, 60),
			canSendText: sendCapability?.enabled === true,
			canSendInteractive:
				sendCapability?.enabled === true && sendProvider === "meta",
			interactiveBlockReason:
				sendCapability?.enabled === true && sendProvider === "meta"
					? null
					: sendProvider === "meta"
						? string(sendCapability?.reason, 80)
						: "interactive_requires_meta",
			sendBlockReason: string(sendCapability?.reason, 80),
			flowSendAttempts: flowSendResult.items,
			flowSendStatusUnavailable: flowSendResult.error !== null,
			canSendFlow: flowSendResult.readyForSend,
			flowSendBlockReason: flowSendResult.blockReason,
			nextBefore: string(result.data.next_before, 60),
			messages: conversationMessages,
		},
	};
}

export async function getAttendanceContext(
	conversationId: string,
): Promise<GatewayResult<AttendanceContext>> {
	const result = await callGateway<{
		conversation?: unknown;
		customer?: unknown;
		address?: unknown;
		orders?: unknown[];
		registration?: unknown;
	}>("context", { conversation_id: conversationId });
	if (!result.ok) return result;
	const conversationRow = record(result.data.conversation);
	const customerRow = record(result.data.customer);
	const addressRow = record(result.data.address);
	const registration = record(result.data.registration);
	const orders = Array.isArray(result.data.orders)
		? result.data.orders
				.map((value) => {
					const row = record(value);
					if (!row) return null;
					const id = string(row.id, 80);
					if (!id) return null;
					return {
						id,
						number: string(row.order_number, 80),
						status: string(row.status, 40) ?? "novo",
						total: numeric(row.total),
						createdAt: string(row.created_at, 60),
					};
				})
				.filter((order): order is NonNullable<typeof order> => order !== null)
		: [];

	return {
		ok: true,
		data: {
			conversation: conversationRow
				? {
						id: string(conversationRow.id, 80) ?? conversationId,
						accountId: string(conversationRow.whatsapp_account_id, 80),
						customerId: string(conversationRow.customer_id, 80),
						phone: string(conversationRow.phone_e164, 40),
					}
				: null,
			customer: customerRow
				? {
						name: string(customerRow.name, 120) ?? "Cliente",
						phone: string(customerRow.phone_e164, 40),
						orderCount: Math.max(0, numeric(customerRow.order_count) ?? 0),
					}
				: null,
			address: addressRow
				? {
						label: string(addressRow.label, 60),
						street: string(addressRow.street, 120),
						number: string(addressRow.number, 30),
						complement: string(addressRow.complement, 100),
						neighborhood: string(addressRow.neighborhood, 100),
						city: string(addressRow.city, 100),
						state: string(addressRow.state, 30),
						postalCode: string(addressRow.postal_code, 20),
						reference: string(addressRow.reference, 160),
					}
				: null,
			orders,
			registrationIncomplete: registration?.complete === false,
		},
	};
}

export async function sendAttendanceTextThroughGateway(input: {
	conversationId: string;
	text: string;
	idempotencyKey: string;
}): Promise<{ ok: true } | { ok: false; error: GatewayError | string }> {
	const result = await callGateway<JsonRecord>("send_text", {}, "POST", {
		conversation_id: input.conversationId,
		text: input.text,
		idempotency_key: input.idempotencyKey,
	});
	if (!result.ok)
		return { ok: false, error: result.gatewayCode ?? result.error };
	return { ok: true };
}

/** Resolves one private inbound attachment only after an authorized staff request. */
export async function getAttendanceMessageMedia(
	messageId: string,
): Promise<AttendanceMediaResult> {
	if (!UUID.test(messageId)) {
		return { ok: false, error: "invalid_message_id" };
	}

	const result = await callGateway<JsonRecord>("media", {
		message_id: messageId,
	});
	if (!result.ok) {
		if (
			result.error === "not_configured" ||
			result.error === "not_authenticated" ||
			result.error === "not_authorized"
		) {
			return { ok: false, error: result.error };
		}
		if (result.gatewayCode === "media_too_large") {
			return { ok: false, error: "media_too_large" };
		}
		return { ok: false, error: "media_unavailable" };
	}

	const payload = record(result.data);
	const url = safeAttendanceMediaUrl(payload?.url);
	const mimeType =
		typeof payload?.mime_type === "string"
			? payload.mime_type.trim().toLowerCase().split(";")[0]
			: "";
	const expiresAt =
		typeof payload?.expires_at === "string" && payload.expires_at.length <= 40
			? new Date(payload.expires_at)
			: null;
	const expiresAtMs = expiresAt?.getTime() ?? Number.NaN;
	const now = Date.now();
	if (
		payload?.ok !== true ||
		!url ||
		!ATTENDANCE_MEDIA_MIME_TYPES.has(mimeType) ||
		!expiresAt ||
		!Number.isFinite(expiresAtMs) ||
		expiresAtMs <= now ||
		expiresAtMs > now + 15 * 60 * 1000
	) {
		return { ok: false, error: "media_unavailable" };
	}

	return {
		ok: true,
		media: {
			url,
			mimeType,
			filename: safeAttendanceMediaFilename(payload.filename),
			expiresAt: expiresAt.toISOString(),
		},
	};
}

const OUTBOUND_MEDIA_LIMITS = new Map<
	string,
	{ kind: AttendanceLibraryItem["mediaKind"]; bytes: number }
>([
	["image/jpeg", { kind: "image", bytes: 5 * 1024 * 1024 }],
	["image/png", { kind: "image", bytes: 5 * 1024 * 1024 }],
	["audio/aac", { kind: "audio", bytes: 16 * 1024 * 1024 }],
	["audio/amr", { kind: "audio", bytes: 16 * 1024 * 1024 }],
	["audio/mpeg", { kind: "audio", bytes: 16 * 1024 * 1024 }],
	["audio/mp4", { kind: "audio", bytes: 16 * 1024 * 1024 }],
	["audio/ogg", { kind: "audio", bytes: 16 * 1024 * 1024 }],
	["video/mp4", { kind: "video", bytes: 16 * 1024 * 1024 }],
	["video/3gpp", { kind: "video", bytes: 16 * 1024 * 1024 }],
	["application/pdf", { kind: "document", bytes: 25 * 1024 * 1024 }],
	["text/plain", { kind: "document", bytes: 25 * 1024 * 1024 }],
	["application/msword", { kind: "document", bytes: 25 * 1024 * 1024 }],
	[
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		{ kind: "document", bytes: 25 * 1024 * 1024 },
	],
	["application/vnd.ms-excel", { kind: "document", bytes: 25 * 1024 * 1024 }],
	[
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		{ kind: "document", bytes: 25 * 1024 * 1024 },
	],
	[
		"application/vnd.ms-powerpoint",
		{ kind: "document", bytes: 25 * 1024 * 1024 },
	],
	[
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		{ kind: "document", bytes: 25 * 1024 * 1024 },
	],
]);

const LIBRARY_EXTENSIONS = new Map<string, string>([
	["image/jpeg", "jpg"],
	["image/png", "png"],
	["audio/aac", "aac"],
	["audio/amr", "amr"],
	["audio/mpeg", "mp3"],
	["audio/mp4", "m4a"],
	["audio/ogg", "ogg"],
	["video/mp4", "mp4"],
	["video/3gpp", "3gp"],
	["application/pdf", "pdf"],
	["text/plain", "txt"],
	["application/msword", "doc"],
	[
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"docx",
	],
	["application/vnd.ms-excel", "xls"],
	["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
	["application/vnd.ms-powerpoint", "ppt"],
	[
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"pptx",
	],
]);

const ATTENDANCE_LIBRARY_ERRORS = new Set([
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
	"media_size_invalid",
	"media_send_uncertain",
	"meta_send_uncertain",
	"meta_canary_destination_blocked",
	"media_provider_unavailable",
	"rate_limited",
	"invalid_idempotency_key",
	"duplicate_not_dispatchable",
]);

function knownAttendanceLibraryError(result: {
	error: GatewayError;
	gatewayCode?: string;
}): string {
	const code = result.gatewayCode ?? result.error;
	return ATTENDANCE_LIBRARY_ERRORS.has(code) ? code : result.error;
}

export async function getAttendanceQuickReplies(
	includeInactive = false,
): Promise<GatewayResult<AttendanceQuickReply[]>> {
	const result = await callGateway<{ items?: unknown[] }>("quick_replies", {
		...(includeInactive ? { include_inactive: "1" } : {}),
	});
	if (!result.ok) return result;
	if (!Array.isArray(result.data.items)) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		data: result.data.items
			.map((value) => {
				const row = record(value);
				const id = string(row?.id, 80);
				const title = string(row?.title, 80);
				const content = string(row?.content, 4000);
				if (!id || !UUID.test(id) || !title || !content) return null;
				return {
					id,
					title,
					content,
					isFavorite: row?.is_favorite === true,
					sortOrder: Math.trunc(numeric(row?.sort_order) ?? 0),
					isActive: row?.is_active === true,
				};
			})
			.filter((item): item is AttendanceQuickReply => item !== null)
			.sort(
				(left, right) =>
					Number(right.isActive) - Number(left.isActive) ||
					Number(right.isFavorite) - Number(left.isFavorite) ||
					left.sortOrder - right.sortOrder,
			),
	};
}

const QUICK_REPLY_ERRORS = new Set([
	"quick_reply_title_required",
	"quick_reply_content_required",
	"quick_reply_title_conflict",
	"quick_reply_not_found",
	"invalid_quick_reply_id",
	"not_configured",
	"not_authenticated",
	"not_authorized",
	"unavailable",
	"invalid_response",
]);

function quickReplyError(result: {
	error: GatewayError;
	gatewayCode?: string;
}): string {
	const code = result.gatewayCode ?? result.error;
	return QUICK_REPLY_ERRORS.has(code) ? code : result.error;
}

export async function saveAttendanceQuickReplyThroughGateway(input: {
	id: string | null;
	title: string;
	content: string;
	isFavorite: boolean;
	sortOrder: number;
}): Promise<
	{ ok: true; item: AttendanceQuickReply } | { ok: false; error: string }
> {
	const title =
		typeof input.title === "string" ? input.title.trim().slice(0, 80) : "";
	const content =
		typeof input.content === "string"
			? input.content.trim().slice(0, 4000)
			: "";
	if (input.id !== null && !UUID.test(input.id)) {
		return { ok: false, error: "invalid_quick_reply_id" };
	}
	if (!title) return { ok: false, error: "quick_reply_title_required" };
	if (!content) return { ok: false, error: "quick_reply_content_required" };
	if (
		!Number.isInteger(input.sortOrder) ||
		input.sortOrder < -9999 ||
		input.sortOrder > 9999
	) {
		return { ok: false, error: "invalid_quick_reply_order" };
	}
	const result = await callGateway<JsonRecord>("quick_reply_save", {}, "POST", {
		...(input.id ? { id: input.id } : {}),
		title,
		content,
		is_favorite: input.isFavorite,
		sort_order: input.sortOrder,
	});
	if (!result.ok) return { ok: false, error: quickReplyError(result) };
	const row = record(result.data.item);
	const itemId = string(row?.id, 80);
	const savedTitle = string(row?.title, 80);
	const savedContent = string(row?.content, 4000);
	if (!itemId || !UUID.test(itemId) || !savedTitle || !savedContent) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		item: {
			id: itemId,
			title: savedTitle,
			content: savedContent,
			isFavorite: row?.is_favorite === true,
			sortOrder: Math.trunc(numeric(row?.sort_order) ?? 0),
			isActive: row?.is_active === true,
		},
	};
}

export async function deactivateAttendanceQuickReplyThroughGateway(
	id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	if (!UUID.test(id)) return { ok: false, error: "invalid_quick_reply_id" };
	const result = await callGateway<JsonRecord>(
		"quick_reply_deactivate",
		{},
		"POST",
		{ id },
	);
	if (!result.ok) return { ok: false, error: quickReplyError(result) };
	return { ok: true };
}

export async function getAttendanceLibraryItems(): Promise<
	GatewayResult<AttendanceLibraryItem[]>
> {
	const result = await callGateway<{ items?: unknown[] }>("library_list", {
		limit: "30",
	});
	if (!result.ok) return result;
	if (!Array.isArray(result.data.items)) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		data: result.data.items
			.map(toAttendanceLibraryItem)
			.filter((item): item is AttendanceLibraryItem => item !== null),
	};
}

export async function prepareAttendanceLibraryUploadThroughGateway(input: {
	title: string;
	mimeType: string;
	filename: string;
	sizeBytes: number;
}): Promise<
	{ ok: true; upload: AttendanceLibraryUpload } | { ok: false; error: string }
> {
	const mimeType = input.mimeType.trim().toLowerCase();
	const media = OUTBOUND_MEDIA_LIMITS.get(mimeType);
	const filename = safeAttendanceMediaFilename(input.filename);
	const title = string(input.title, 120);
	if (
		!media ||
		!filename ||
		!title ||
		!Number.isSafeInteger(input.sizeBytes) ||
		input.sizeBytes < 1
	) {
		return { ok: false, error: "invalid_media_file" };
	}
	if (input.sizeBytes > media.bytes) {
		return { ok: false, error: "media_size_invalid" };
	}

	const result = await callGateway<JsonRecord>(
		"library_upload_prepare",
		{},
		"POST",
		{
			title,
			media_kind: media.kind,
			mime_type: mimeType,
			original_filename: filename,
			original_size_bytes: input.sizeBytes,
			category: "Atendimento",
			tags: [],
		},
	);
	if (!result.ok)
		return { ok: false, error: knownAttendanceLibraryError(result) };
	const data = result.data;
	const itemId = string(data.item_id, 80);
	const upload = record(data.upload);
	const path = safeAttendanceLibraryPath(upload?.path);
	const token = string(upload?.token, 4000);
	const extension = LIBRARY_EXTENSIONS.get(mimeType);
	const expectedPath =
		itemId && extension ? `items/${itemId}/asset.${extension}` : null;
	const thumbnailUpload = record(data.thumbnail_upload);
	const thumbnailPath = safeAttendanceLibraryPath(thumbnailUpload?.path);
	const thumbnailToken = string(thumbnailUpload?.token, 4000);
	const expectedThumbnailPath =
		media.kind === "image" && itemId ? `items/${itemId}/thumb.jpg` : null;
	if (
		!itemId ||
		!UUID.test(itemId) ||
		!path ||
		path !== expectedPath ||
		!token ||
		token.length < 8 ||
		(media.kind === "image" &&
			(!thumbnailPath ||
				thumbnailPath !== expectedThumbnailPath ||
				!thumbnailToken ||
				thumbnailToken.length < 8))
	) {
		return { ok: false, error: "invalid_response" };
	}
	return {
		ok: true,
		upload: {
			itemId,
			path,
			token,
			mediaKind: media.kind,
			mimeType,
			thumbnail:
				thumbnailPath && thumbnailToken
					? { path: thumbnailPath, token: thumbnailToken }
					: null,
		},
	};
}

export async function completeAttendanceLibraryUploadThroughGateway(input: {
	itemId: string;
	sizeBytes: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	if (
		!UUID.test(input.itemId) ||
		!Number.isSafeInteger(input.sizeBytes) ||
		input.sizeBytes < 1
	) {
		return { ok: false, error: "invalid_media_file" };
	}
	const result = await callGateway<JsonRecord>(
		"library_upload_complete",
		{},
		"POST",
		{
			item_id: input.itemId,
			stored_size_bytes: input.sizeBytes,
		},
	);
	if (!result.ok)
		return { ok: false, error: knownAttendanceLibraryError(result) };
	return { ok: true };
}

export async function sendAttendanceLibraryItemThroughGateway(input: {
	conversationId: string;
	itemId: string;
	caption: string;
	idempotencyKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const caption = input.caption.trim();
	if (
		!UUID.test(input.conversationId) ||
		!UUID.test(input.itemId) ||
		!UUID.test(input.idempotencyKey) ||
		caption.length > 1024
	) {
		return { ok: false, error: "invalid_media_request" };
	}
	const result = await callGateway<JsonRecord>("library_send", {}, "POST", {
		conversation_id: input.conversationId,
		item_id: input.itemId,
		caption,
		idempotency_key: input.idempotencyKey,
	});
	if (!result.ok)
		return { ok: false, error: knownAttendanceLibraryError(result) };
	return { ok: true };
}

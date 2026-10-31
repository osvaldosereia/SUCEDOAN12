import "server-only";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;
type AnaRole = "viewer" | "editor" | "admin" | "owner" | "unknown";
type AnaGatewayError =
	| "not_configured"
	| "not_authenticated"
	| "not_authorized"
	| "unavailable"
	| "invalid_response";

export type AnaKnowledgeStatus = "draft" | "published" | "archived";

export type AnaKnowledgeItem = {
	key: string;
	title: string;
	content: string;
	status: AnaKnowledgeStatus;
	keywords: string[];
};

export type AnaTestRun = {
	id: string;
	draftRevision: number;
	passedCount: number;
	failedCount: number;
	scenarioKeys: string[];
	createdAt: string | null;
};

export type AnaVersion = {
	id: number;
	version: number;
	changeNote: string | null;
	createdAt: string | null;
};

export type AnaAdminChannel = {
	id: string;
	name: string;
	phoneLast4: string;
	inboundProvider: string | null;
	outboundProvider: string | null;
	captureEnabled: boolean;
	sendEnabled: boolean;
	anaEnabled: boolean;
	humanSendEnabled: boolean;
	homologated: boolean;
};

export type AnaAdminView = {
	role: AnaRole;
	draftRevision: number;
	draftUpdatedAt: string | null;
	tone: "cordial" | "warm" | "neutral";
	conciseness: "short" | "balanced";
	emoji: "never" | "sparingly";
	useKnownFirstName: boolean;
	knowledge: AnaKnowledgeItem[];
	triggerCount: number;
	enabledTriggerCount: number;
	testCaseCount: number;
	activeVersion: number | null;
	activeCreatedAt: string | null;
	versions: AnaVersion[];
	testRuns: AnaTestRun[];
	channels: AnaAdminChannel[];
};

export type AnaAdminLoad =
	| { ok: true; view: AnaAdminView; rawConfiguration: JsonRecord }
	| { ok: false; error: AnaGatewayError };

export type AnaGatewayResult =
	| { ok: true; payload: JsonRecord }
	| { ok: false; error: AnaGatewayError; code?: string };

function record(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function text(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const cleaned = Array.from(value)
		.filter((character) => {
			const code = character.codePointAt(0) ?? 0;
			return !(code < 32 && ![9, 10, 13].includes(code)) && code !== 127;
		})
		.join("")
		.trim();
	return cleaned ? cleaned.slice(0, maxLength) : null;
}

function finiteInteger(value: unknown): number | null {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: null;
}

function safeCode(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 80) return null;
	return /^[a-z0-9_]+$/.test(value) ? value : null;
}

function toKnowledgeItem(value: unknown): AnaKnowledgeItem | null {
	const row = record(value);
	if (!row) return null;
	const key = text(row.key, 40);
	const title = text(row.title, 100);
	const content = text(row.content, 1600);
	if (!key || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(key) || !title || !content) {
		return null;
	}
	const status: AnaKnowledgeStatus =
		row.status === "draft" || row.status === "archived"
			? row.status
			: "published";
	const keywords = Array.isArray(row.keywords)
		? row.keywords
				.map((value) => text(value, 60))
				.filter((value): value is string => value !== null)
				.slice(0, 12)
		: [];
	return { key, title, content, status, keywords };
}

async function callAnaGateway(input: JsonRecord): Promise<AnaGatewayResult> {
	if (!supabaseUrl || !supabasePublishableKey) {
		return { ok: false, error: "not_configured" };
	}

	const supabase = await createClient();
	const { data, error } = await supabase.auth.getSession();
	const accessToken = data.session?.access_token;
	if (error || !accessToken) return { ok: false, error: "not_authenticated" };

	let response: Response;
	try {
		const endpoint = new URL(
			"/functions/v1/admin-whatsapp-ana-preview-v1",
			supabaseUrl,
		);
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(input),
			cache: "no-store",
		});
	} catch {
		return { ok: false, error: "unavailable" };
	}

	if (response.status === 401) return { ok: false, error: "not_authenticated" };
	if (response.status === 403) return { ok: false, error: "not_authorized" };

	try {
		const payload = record(await response.json());
		if (!payload) return { ok: false, error: "invalid_response" };
		if (!response.ok || payload.ok !== true) {
			return {
				ok: false,
				error:
					payload.error === "admin_role_insufficient" ||
					payload.error === "admin_not_authorized"
						? "not_authorized"
						: "unavailable",
				code: safeCode(payload.error) ?? undefined,
			};
		}
		return { ok: true, payload };
	} catch {
		return { ok: false, error: "invalid_response" };
	}
}

export async function callAnaAdminAction(
	input: JsonRecord,
): Promise<AnaGatewayResult> {
	return callAnaGateway(input);
}

export async function loadAnaAdmin(): Promise<AnaAdminLoad> {
	const result = await callAnaGateway({ action: "admin_load" });
	if (!result.ok) return result;

	const draft = record(result.payload.draft);
	const rawConfiguration = record(draft?.configuration);
	const behavior = record(rawConfiguration?.behavior);
	if (!draft || !rawConfiguration || !behavior) {
		return { ok: false, error: "invalid_response" };
	}

	const revision = finiteInteger(draft.revision);
	if (revision === null || revision < 1) {
		return { ok: false, error: "invalid_response" };
	}

	const knowledge = Array.isArray(rawConfiguration.knowledge)
		? rawConfiguration.knowledge
				.map(toKnowledgeItem)
				.filter((item): item is AnaKnowledgeItem => item !== null)
		: [];
	const triggers = Array.isArray(rawConfiguration.triggers)
		? rawConfiguration.triggers
				.map(record)
				.filter((item): item is JsonRecord => item !== null)
		: [];
	const testCases = Array.isArray(rawConfiguration.test_cases)
		? rawConfiguration.test_cases
		: [];
	const active = record(result.payload.active);
	const activeVersion = finiteInteger(active?.version);
	const versions = Array.isArray(result.payload.versions)
		? result.payload.versions
				.map((value): AnaVersion | null => {
					const row = record(value);
					if (!row) return null;
					const id = finiteInteger(row.id);
					const version = finiteInteger(row.version);
					if (id === null || id < 1 || version === null || version < 1)
						return null;
					return {
						id,
						version,
						changeNote: text(row.change_note, 240),
						createdAt: text(row.created_at, 60),
					};
				})
				.filter((item): item is AnaVersion => item !== null)
		: [];
	const testRuns = Array.isArray(result.payload.test_runs)
		? result.payload.test_runs
				.map((value): AnaTestRun | null => {
					const row = record(value);
					if (!row) return null;
					const id = text(row.id, 36);
					const draftRevision = finiteInteger(row.draft_revision);
					const passedCount = finiteInteger(row.passed_count);
					const failedCount = finiteInteger(row.failed_count);
					if (
						!id ||
						!/^[0-9a-f-]{36}$/i.test(id) ||
						draftRevision === null ||
						passedCount === null ||
						failedCount === null
					) {
						return null;
					}
					const scenarioKeys = Array.isArray(row.scenario_keys)
						? row.scenario_keys
								.map((key) => text(key, 40))
								.filter((key): key is string => key !== null)
								.slice(0, 20)
						: [];
					return {
						id,
						draftRevision,
						passedCount,
						failedCount,
						scenarioKeys,
						createdAt: text(row.created_at, 60),
					};
				})
				.filter((item): item is AnaTestRun => item !== null)
		: [];

	const channels = Array.isArray(result.payload.channels)
		? result.payload.channels
				.map((value): AnaAdminChannel | null => {
					const row = record(value);
					if (!row) return null;
					const id = text(row.id, 36);
					if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
					return {
						id,
						name: text(row.name, 60) ?? "Canal WhatsApp",
						phoneLast4:
							typeof row.phone_last4 === "string" &&
							/^\d{0,4}$/.test(row.phone_last4)
								? row.phone_last4
								: "",
						inboundProvider: text(row.inbound_provider, 40),
						outboundProvider: text(row.outbound_provider, 40),
						captureEnabled: row.capture_enabled === true,
						sendEnabled: row.send_enabled === true,
						anaEnabled: row.ana_enabled === true,
						humanSendEnabled: row.human_send_enabled === true,
						homologated: Boolean(row.homologated_at),
					};
				})
				.filter((item): item is AnaAdminChannel => item !== null)
		: [];

	const tone = behavior.tone;
	const conciseness = behavior.conciseness;
	const emoji = behavior.emoji;
	const role = result.payload.role;
	return {
		ok: true,
		rawConfiguration,
		view: {
			role:
				role === "viewer" ||
				role === "editor" ||
				role === "admin" ||
				role === "owner"
					? role
					: "unknown",
			draftRevision: revision,
			draftUpdatedAt: text(draft.updated_at, 60),
			tone: tone === "warm" || tone === "neutral" ? tone : "cordial",
			conciseness: conciseness === "balanced" ? "balanced" : "short",
			emoji: emoji === "never" ? "never" : "sparingly",
			useKnownFirstName:
				behavior.use_known_first_name_on_first_greeting === true,
			knowledge,
			triggerCount: triggers.length,
			enabledTriggerCount: triggers.filter((item) => item.enabled === true)
				.length,
			testCaseCount: testCases.length,
			activeVersion,
			activeCreatedAt: text(active?.created_at, 60),
			versions,
			testRuns,
			channels,
		},
	};
}

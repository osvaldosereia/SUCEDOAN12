import {
	type AnaKnowledgeStatus,
	callAnaAdminAction,
	loadAnaAdmin,
} from "@/lib/supabase/browser-admin-ana";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

export class AnaActionError extends Error {
	constructor(readonly notice: string) {
		super(notice);
	}
}

function go(notice: string): never {
	throw new AnaActionError(notice);
}

function expectedRevision(formData: FormData): number | null {
	const value = Number(formData.get("expected_revision"));
	return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function field(formData: FormData, name: string, maxLength: number): string {
	return String(formData.get(name) ?? "")
		.trim()
		.slice(0, maxLength);
}

function gatewayNotice(code: string | undefined): string {
	if (code === "revision_conflict") return "conflict";
	if (code === "test_run_missing_stale_or_failed") return "test_required";
	if (code === "version_not_found") return "conflict";
	if (code === "configuration_invalid") return "invalid";
	if (code === "admin_role_insufficient" || code === "admin_not_authorized") {
		return "not_authorized";
	}
	return "unavailable";
}

function keywordsFromField(value: string): string[] | null {
	const keywords = value
		.split(/[\n,]/)
		.map((keyword) => keyword.trim())
		.filter(Boolean);
	if (keywords.length > 12 || keywords.some((keyword) => keyword.length > 60)) {
		return null;
	}
	return [...new Set(keywords)];
}

function knowledgeKey(title: string, existing: Set<string>): string {
	const base =
		title
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 40) || "conhecimento";
	let key = base;
	let suffix = 2;
	while (existing.has(key)) {
		const ending = `-${suffix}`;
		key = `${base.slice(0, 40 - ending.length)}${ending}`;
		suffix += 1;
	}
	return key;
}

export async function saveAnaDraft(formData: FormData): Promise<string> {
	const revision = expectedRevision(formData);
	if (revision === null) go("invalid");

	const loaded = await loadAnaAdmin();
	if (!loaded.ok) go(loaded.error);
	if (loaded.view.draftRevision !== revision) go("conflict");

	const configuration = JSON.parse(
		JSON.stringify(loaded.rawConfiguration),
	) as JsonRecord;
	const behavior = record(configuration.behavior);
	if (!behavior || !Array.isArray(configuration.knowledge)) go("invalid");

	const tone = field(formData, "behavior_tone", 20);
	const conciseness = field(formData, "behavior_conciseness", 20);
	const emoji = field(formData, "behavior_emoji", 20);
	if (
		!(["cordial", "warm", "neutral"] as const).includes(
			tone as "cordial" | "warm" | "neutral",
		) ||
		!(["short", "balanced"] as const).includes(
			conciseness as "short" | "balanced",
		) ||
		!(["never", "sparingly"] as const).includes(emoji as "never" | "sparingly")
	) {
		go("invalid");
	}
	behavior.tone = tone;
	behavior.conciseness = conciseness;
	behavior.emoji = emoji;
	behavior.use_known_first_name_on_first_greeting =
		formData.get("use_known_first_name") === "on";

	const knowledge = configuration.knowledge.map((value) => {
		const item = record(value);
		if (!item || typeof item.key !== "string") return value;
		const key = item.key;
		if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(key)) go("invalid");
		const title = field(formData, `knowledge_title_${key}`, 100);
		const content = field(formData, `knowledge_content_${key}`, 1600);
		const status = field(formData, `knowledge_status_${key}`, 16);
		const keywords = keywordsFromField(
			field(formData, `knowledge_keywords_${key}`, 800),
		);
		if (
			!title ||
			!content ||
			keywords === null ||
			!(["draft", "published", "archived"] as const).includes(
				status as AnaKnowledgeStatus,
			)
		) {
			go("invalid");
		}
		return { ...item, title, content, status, keywords };
	});

	const newTitle = field(formData, "new_knowledge_title", 100);
	const newContent = field(formData, "new_knowledge_content", 1600);
	const newKeywords = keywordsFromField(
		field(formData, "new_knowledge_keywords", 800),
	);
	if (
		newTitle ||
		newContent ||
		field(formData, "new_knowledge_keywords", 800)
	) {
		if (
			!newTitle ||
			!newContent ||
			newKeywords === null ||
			knowledge.length >= 30
		) {
			go("invalid");
		}
		const existing = new Set(
			knowledge
				.map((value) => record(value)?.key)
				.filter((key): key is string => typeof key === "string"),
		);
		knowledge.push({
			key: knowledgeKey(newTitle, existing),
			title: newTitle,
			content: newContent,
			status: "draft",
			keywords: newKeywords,
		});
	}
	configuration.knowledge = knowledge;

	const saved = await callAnaAdminAction({
		action: "admin_save_draft",
		configuration,
		expected_revision: revision,
		note: "Ajuste da configuração da ANA pelo Admin",
	});
	if (!saved.ok) go(gatewayNotice(saved.code));
	return "draft_saved";
}

export async function runAnaDraftTest(formData: FormData): Promise<string> {
	const revision = expectedRevision(formData);
	if (revision === null) go("invalid");
	const loaded = await loadAnaAdmin();
	if (!loaded.ok) go(loaded.error);
	if (loaded.view.draftRevision !== revision) go("conflict");
	if (loaded.view.testCaseCount === 0) go("no_test_cases");

	const result = await callAnaAdminAction({
		action: "admin_test",
		expected_revision: revision,
	});
	if (!result.ok) go(gatewayNotice(result.code));
	const testRun = record(result.payload.test_run);
	if (!testRun || typeof testRun.failed_count !== "number") go("unavailable");
	return testRun.failed_count === 0 ? "test_passed" : "test_failed";
}

export async function publishAnaDraft(formData: FormData): Promise<string> {
	const revision = expectedRevision(formData);
	if (revision === null || formData.get("confirm_publish") !== "on")
		go("invalid");
	const note = field(formData, "publish_note", 240);
	if (note.length < 3) go("invalid");

	const loaded = await loadAnaAdmin();
	if (!loaded.ok) go(loaded.error);
	if (loaded.view.role !== "owner") go("not_authorized");
	if (loaded.view.draftRevision !== revision) go("conflict");
	const requiredKeys = Array.isArray(loaded.rawConfiguration.test_cases)
		? loaded.rawConfiguration.test_cases
				.map((item) => record(item)?.key)
				.filter((key): key is string => typeof key === "string")
		: [];
	const passingTest = loaded.view.testRuns.find(
		(run) =>
			run.draftRevision === revision &&
			run.failedCount === 0 &&
			run.passedCount === requiredKeys.length &&
			run.scenarioKeys.length === requiredKeys.length &&
			run.scenarioKeys.every((key, index) => key === requiredKeys[index]),
	);
	if (!passingTest || requiredKeys.length === 0) go("test_required");

	const published = await callAnaAdminAction({
		action: "admin_publish",
		test_run_id: passingTest.id,
		note,
	});
	if (!published.ok) go(gatewayNotice(published.code));
	return "published";
}

export async function rollbackAnaVersion(formData: FormData): Promise<string> {
	const versionId = Number(formData.get("version_id"));
	if (
		!Number.isSafeInteger(versionId) ||
		versionId < 1 ||
		formData.get("confirm_rollback") !== "on"
	) {
		go("invalid");
	}
	const note = field(formData, "rollback_note", 240);
	if (note.length < 3) go("invalid");

	const loaded = await loadAnaAdmin();
	if (!loaded.ok) go(loaded.error);
	if (loaded.view.role !== "owner") go("not_authorized");
	const target = loaded.view.versions.find(
		(version) => version.id === versionId,
	);
	if (!target || target.version === loaded.view.activeVersion) go("conflict");

	const rolledBack = await callAnaAdminAction({
		action: "admin_rollback",
		version_id: versionId,
		note,
	});
	if (!rolledBack.ok) go(gatewayNotice(rolledBack.code));
	return "rolled_back";
}

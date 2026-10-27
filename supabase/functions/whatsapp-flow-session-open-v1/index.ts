import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@1.9.2";

const BODY_LIMIT_BYTES = 32_000;
const MAX_POSITIONS = 100;
const MAX_OPTIONS_PER_POSITION = 8;

type JsonRecord = Record<string, unknown>;
type ProductRow = {
	id: string;
	name: string | null;
	price: number | string | null;
	offer_price: number | string | null;
	is_offer: boolean | null;
	is_active: boolean | null;
	is_whatsapp_active: boolean | null;
	image_url: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}

function readText(value: unknown, maximum: number): string | null {
	if (typeof value !== "string") return null;
	const normalized = Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 0 && normalized.length <= maximum
		? normalized
		: null;
}

async function readBodyLimited(request: Request): Promise<string | null> {
	const declaredLength = Number(request.headers.get("Content-Length"));
	if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT_BYTES)
		return null;
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > BODY_LIMIT_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}

function moneyToCents(value: unknown): number | null {
	if (typeof value !== "string" && typeof value !== "number") return null;
	const textValue = String(value).trim();
	if (textValue.length > 32) return null;
	const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(textValue);
	if (!match) return null;
	const sign = match[1] === "-" ? -1 : 1;
	const whole = BigInt(match[2]);
	const fraction = match[3] ?? "";
	if (/[^0]/.test(fraction.slice(2))) return null;
	const cents = BigInt(fraction.padEnd(2, "0").slice(0, 2));
	const absolute = whole * 100n + cents;
	if (absolute > 999_999_999n) return null;
	return Number(absolute) * sign;
}

function safeHttpsImage(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 2048) return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? value
			: null;
	} catch {
		return null;
	}
}

function randomFlowToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function json(status: number, body: JsonRecord): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

export default {
	fetch: withSupabase(
		{ auth: "secret" },
		async (request, { supabaseAdmin }) => {
			if (request.method !== "POST")
				return json(405, { ok: false, error: "method_not_allowed" });

			const body = await readBodyLimited(request);
			if (body === null)
				return json(413, { ok: false, error: "request_too_large" });
			let input: unknown;
			try {
				input = JSON.parse(body);
			} catch {
				return json(400, { ok: false, error: "invalid_json" });
			}
			if (!isRecord(input))
				return json(400, { ok: false, error: "invalid_request" });
			const allowedFields = new Set([
				"whatsappAccountId",
				"metaWabaId",
				"metaPhoneNumberId",
				"metaFlowId",
				"flowSchemaVersion",
				"basketTemplateId",
				"basketMoldId",
				"senderPhoneE164",
				"conversationId",
				"customerId",
			]);
			if (Object.keys(input).some((key) => !allowedFields.has(key))) {
				return json(400, { ok: false, error: "invalid_request" });
			}

			const whatsappAccountId = isUuid(input.whatsappAccountId)
				? input.whatsappAccountId.toLowerCase()
				: null;
			const basketTemplateId = isUuid(input.basketTemplateId)
				? input.basketTemplateId.toLowerCase()
				: null;
			const basketMoldId = isUuid(input.basketMoldId)
				? input.basketMoldId.toLowerCase()
				: null;
			const metaWabaId = readText(input.metaWabaId, 128);
			const metaPhoneNumberId = readText(input.metaPhoneNumberId, 128);
			const metaFlowId = readText(input.metaFlowId, 32);
			const flowSchemaVersion = readText(input.flowSchemaVersion, 32);
			const senderPhoneE164 = readText(input.senderPhoneE164, 16);
			const conversationId =
				input.conversationId == null
					? null
					: isUuid(input.conversationId)
						? input.conversationId
						: undefined;
			const customerId =
				input.customerId == null
					? null
					: isUuid(input.customerId)
						? input.customerId
						: undefined;
			if (
				!whatsappAccountId ||
				!basketTemplateId ||
				!basketMoldId ||
				!metaWabaId ||
				!metaPhoneNumberId ||
				!metaFlowId ||
				!/^[0-9]{6,32}$/.test(metaFlowId) ||
				!flowSchemaVersion ||
				!senderPhoneE164 ||
				!/^[+][1-9][0-9]{7,14}$/.test(senderPhoneE164) ||
				conversationId === undefined ||
				customerId === undefined
			) {
				return json(400, { ok: false, error: "invalid_request" });
			}

			const supabase = supabaseAdmin;
			const [templateResult, moldResult, positionsResult] = await Promise.all([
				supabase
					.from("basket_templates")
					.select("id,is_active,is_whatsapp_active")
					.eq("id", basketTemplateId)
					.eq("is_active", true)
					.eq("is_whatsapp_active", true)
					.maybeSingle(),
				supabase
					.from("basket_molds")
					.select(
						"id,basket_id,hidden_adjustment,conditional_hidden_enabled,conditional_hidden_product_id,conditional_hidden_adjustment",
					)
					.eq("id", basketMoldId)
					.eq("basket_id", basketTemplateId)
					.maybeSingle(),
				supabase
					.from("basket_mold_positions")
					.select("id,label,sort_order")
					.eq("mold_id", basketMoldId)
					.order("sort_order", { ascending: true })
					.order("id", { ascending: true }),
			]);
			if (templateResult.error || moldResult.error || positionsResult.error) {
				return json(502, { ok: false, error: "catalog_unavailable" });
			}
			if (
				!templateResult.data ||
				!moldResult.data ||
				!Array.isArray(positionsResult.data) ||
				positionsResult.data.length === 0 ||
				positionsResult.data.length > MAX_POSITIONS
			) {
				return json(409, { ok: false, error: "basket_unavailable" });
			}

			const positions = positionsResult.data as Array<{
				id: string;
				label: string;
				sort_order: number;
			}>;
			const optionResult = await supabase
				.from("basket_mold_position_options")
				.select("position_id,product_id,sort_order")
				.in(
					"position_id",
					positions.map((position) => position.id),
				);
			if (optionResult.error)
				return json(502, { ok: false, error: "catalog_unavailable" });
			const options = Array.isArray(optionResult.data)
				? (optionResult.data as Array<{
						position_id: string;
						product_id: string;
						sort_order: number;
					}>)
				: [];
			const productIds = [
				...new Set(options.map((option) => option.product_id)),
			];
			const productResult = productIds.length
				? await supabase
						.from("products")
						.select(
							"id,name,price,offer_price,is_offer,is_active,is_whatsapp_active,image_url",
						)
						.in("id", productIds)
				: { data: [], error: null };
			if (productResult.error)
				return json(502, { ok: false, error: "catalog_unavailable" });
			const products = new Map<string, ProductRow>(
				((productResult.data ?? []) as ProductRow[]).map((product) => [
					product.id.toLowerCase(),
					product,
				]),
			);

			const snapshotPositions: JsonRecord[] = [];
			for (const position of positions) {
				const choices: JsonRecord[] = [];
				const positionOptions = options
					.filter((option) => option.position_id === position.id)
					.sort(
						(left, right) =>
							left.sort_order - right.sort_order ||
							left.product_id.localeCompare(right.product_id),
					);
				for (const option of positionOptions) {
					const product = products.get(option.product_id.toLowerCase());
					if (!product?.is_active || !product.is_whatsapp_active) continue;
					const imageUrl = safeHttpsImage(product.image_url);
					const name = readText(product.name, 180);
					const offerPriceCents = moneyToCents(product.offer_price);
					const rawPrice =
						product.is_offer === true &&
						offerPriceCents !== null &&
						offerPriceCents >= 0
							? product.offer_price
							: product.price;
					const priceCents = moneyToCents(rawPrice);
					if (!imageUrl || !name || priceCents === null || priceCents < 0) {
						return json(409, {
							ok: false,
							error: "basket_option_missing_required_image_or_price",
						});
					}
					choices.push({
						product_id: product.id.toLowerCase(),
						name,
						image_url: imageUrl,
						price_cents: priceCents,
						sort_order: option.sort_order,
					});
				}
				if (choices.length === 0 || choices.length > MAX_OPTIONS_PER_POSITION) {
					return json(409, {
						ok: false,
						error: "basket_position_has_no_eligible_options",
					});
				}
				snapshotPositions.push({
					id: position.id.toLowerCase(),
					label: position.label,
					sort_order: position.sort_order,
					options: choices,
				});
			}

			const hiddenAdjustmentCents = moneyToCents(
				moldResult.data.hidden_adjustment ?? 0,
			);
			const conditionalHiddenAdjustmentCents = moneyToCents(
				moldResult.data.conditional_hidden_adjustment ?? 0,
			);
			if (
				hiddenAdjustmentCents === null ||
				conditionalHiddenAdjustmentCents === null
			) {
				return json(409, { ok: false, error: "basket_pricing_unavailable" });
			}
			const snapshot = {
				schema_version: "sucedoan.whatsapp_flow_catalog.v1",
				basket_template_id: basketTemplateId,
				basket_mold_id: basketMoldId,
				hidden_adjustment_cents: hiddenAdjustmentCents,
				conditional_hidden_enabled:
					moldResult.data.conditional_hidden_enabled === true,
				conditional_hidden_product_id: isUuid(
					moldResult.data.conditional_hidden_product_id,
				)
					? moldResult.data.conditional_hidden_product_id.toLowerCase()
					: null,
				conditional_hidden_adjustment_cents: conditionalHiddenAdjustmentCents,
				positions: snapshotPositions,
			};

			const flowToken = randomFlowToken();
			const tokenHash = await sha256Hex(flowToken);
			const { data: sessionResult, error: sessionError } = await supabase.rpc(
				"whatsapp_flow_session_open_v1",
				{
					p_whatsapp_account_id: whatsappAccountId,
					p_meta_waba_id: metaWabaId,
					p_meta_phone_number_id: metaPhoneNumberId,
					p_meta_flow_id: metaFlowId,
					p_flow_schema_version: flowSchemaVersion,
					p_basket_template_id: basketTemplateId,
					p_basket_mold_id: basketMoldId,
					p_sender_phone_e164: senderPhoneE164,
					p_token_hash: tokenHash,
					p_snapshot: snapshot,
					p_conversation_id: conversationId,
					p_customer_id: customerId,
				},
			);
			if (
				sessionError ||
				!isRecord(sessionResult) ||
				sessionResult.ok !== true ||
				!isUuid(sessionResult.session_id)
			) {
				return json(409, { ok: false, error: "flow_session_not_ready" });
			}
			return json(201, {
				ok: true,
				sessionId: sessionResult.session_id,
				flowToken,
				expiresAt: sessionResult.expires_at,
			});
		},
	),
};

type JsonRecord = Record<string, unknown>;

type MetaContact = JsonRecord & {
	wa_id?: unknown;
	user_id?: unknown;
};

type MetaCatalogItem = {
	retailerId: string | null;
	quantity: number | null;
	reportedUnitPrice: string | null;
	reportedCurrency: string | null;
};

type MetaOrderBase = {
	path: MetaWebhookPath;
	messageId: string | null;
	metaPhoneNumberId: string | null;
	metaWabaId: string | null;
	senderPhoneE164: string | null;
	senderProviderId: string | null;
	replyToMessageId: string | null;
	timestamp: string | null;
};

export type MetaWebhookPath = {
	entryIndex: number;
	changeIndex: number;
	itemIndex: number;
};

export type MetaInboundMessageIdentity = MetaOrderBase & {
	messageType: string;
	textBody: string | null;
	mediaId: string | null;
};

export type MetaWebhookStatusIdentity = {
	path: MetaWebhookPath;
	metaPhoneNumberId: string | null;
	metaWabaId: string | null;
	recipientPhoneE164: string | null;
	recipientProviderId: string | null;
	providerMessageId: string | null;
	status: string | null;
	timestamp: string | null;
	errorCode: string | null;
	errorTitle: string | null;
	errorDetail: string | null;
};

export type MetaOrderIngressEvent =
	| (MetaOrderBase & {
			kind: "catalog_order";
			catalogId: string | null;
			currency: string | null;
			items: MetaCatalogItem[];
			issues: string[];
	  })
	| (MetaOrderBase & {
			kind: "flow_submission";
			flowName: string | null;
			flowToken: string | null;
			responseJson: unknown;
			responseJsonValid: boolean;
			issues: string[];
	  })
	| (MetaOrderBase & {
			kind: "confirmation_reply";
			replyId: string | null;
			replyTitle: string | null;
			issues: string[];
	  });

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength = 512): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	if (!normalized || normalized.length > maxLength) return null;
	return normalized;
}

function readPhoneE164(value: unknown): string | null {
	const candidate = readText(value, 32);
	if (!candidate) return null;
	if (/^\+[1-9]\d{7,14}$/.test(candidate)) return candidate;
	if (/^55\d{10,11}$/.test(candidate)) return `+${candidate}`;
	return null;
}

function readQuantity(value: unknown): number | null {
	if (typeof value === "number") {
		return Number.isSafeInteger(value) && value >= 1 ? value : null;
	}
	if (typeof value !== "string" || !/^\d{1,16}$/.test(value)) return null;
	const quantity = Number(value);
	return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : null;
}

function readReportedPrice(value: unknown): string | null {
	const candidate = readText(value, 32);
	if (!candidate || !/^\d{1,9}(?:\.\d{1,4})?$/.test(candidate)) return null;
	return candidate;
}

function readCurrency(value: unknown): string | null {
	const candidate = readText(value, 3)?.toUpperCase() ?? null;
	return candidate && /^[A-Z]{3}$/.test(candidate) ? candidate : null;
}

function toObject(value: unknown): JsonRecord | null {
	if (isRecord(value)) return value;
	if (typeof value !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function contactsFor(value: JsonRecord): MetaContact[] {
	return Array.isArray(value.contacts)
		? (value.contacts.filter(isRecord) as MetaContact[])
		: [];
}

function buildBase(
	message: JsonRecord,
	value: JsonRecord,
	contacts: MetaContact[],
	metaWabaId: string | null,
	path: MetaWebhookPath,
): MetaOrderBase {
	const from = readText(message.from, 256);
	const matchingContact = contacts.find(
		(contact) => readText(contact.wa_id, 256) === from,
	);
	const contact = matchingContact ?? null;
	const contactWaId = readText(contact?.wa_id, 256);
	const senderPhoneE164 = readPhoneE164(from) ?? readPhoneE164(contactWaId);
	const senderProviderId =
		readText(contact?.user_id, 256) ??
		(from && !senderPhoneE164 ? from : null) ??
		(contactWaId && !readPhoneE164(contactWaId) ? contactWaId : null);
	const metadata = isRecord(value.metadata) ? value.metadata : {};

	return {
		path,
		messageId: readText(message.id, 256),
		metaPhoneNumberId: readText(metadata.phone_number_id, 128),
		metaWabaId,
		senderPhoneE164,
		senderProviderId,
		replyToMessageId: readText(
			isRecord(message.context) ? message.context.id : null,
			256,
		),
		timestamp: readText(message.timestamp, 64),
	};
}

function baseIssues(base: MetaOrderBase): string[] {
	const issues: string[] = [];
	if (!base.messageId) issues.push("missing_message_id");
	if (!base.metaPhoneNumberId) issues.push("missing_meta_phone_number_id");
	if (!base.metaWabaId) issues.push("missing_meta_waba_id");
	if (!base.senderPhoneE164 && !base.senderProviderId)
		issues.push("missing_sender_identity");
	if (!base.senderPhoneE164) issues.push("sender_phone_unavailable");
	return issues;
}

function catalogOrder(
	message: JsonRecord,
	value: JsonRecord,
	contacts: MetaContact[],
	metaWabaId: string | null,
	path: MetaWebhookPath,
): MetaOrderIngressEvent {
	const order = isRecord(message.order) ? message.order : {};
	const rawItems = Array.isArray(order.product_items)
		? order.product_items
		: [];
	const issues: string[] = [];
	const base = buildBase(message, value, contacts, metaWabaId, path);
	issues.push(...baseIssues(base));
	const items = rawItems.filter(isRecord).map((item): MetaCatalogItem => {
		const retailerId = readText(item.product_retailer_id, 256);
		const quantity = readQuantity(item.quantity);
		const reportedUnitPrice = readReportedPrice(item.item_price);
		const reportedCurrency = readCurrency(item.currency);
		if (!retailerId) issues.push("invalid_product_retailer_id");
		if (quantity === null) issues.push("invalid_quantity");
		return { retailerId, quantity, reportedUnitPrice, reportedCurrency };
	});
	const catalogId = readText(order.catalog_id, 256);
	const currency = readCurrency(rawItems.find(isRecord)?.currency);
	const currencies = new Set(
		items.flatMap((item) =>
			item.reportedCurrency ? [item.reportedCurrency] : [],
		),
	);

	if (!catalogId) issues.push("missing_catalog_id");
	if (rawItems.length === 0 || items.length !== rawItems.length)
		issues.push("invalid_items");
	if (currencies.size > 1) issues.push("inconsistent_item_currencies");

	return {
		...base,
		kind: "catalog_order",
		catalogId,
		currency,
		items,
		issues: [...new Set(issues)],
	};
}

function flowSubmission(
	message: JsonRecord,
	value: JsonRecord,
	contacts: MetaContact[],
	metaWabaId: string | null,
	path: MetaWebhookPath,
): MetaOrderIngressEvent {
	const interactive = isRecord(message.interactive) ? message.interactive : {};
	const reply = isRecord(interactive.nfm_reply) ? interactive.nfm_reply : {};
	const rawResponse = reply.response_json;
	const responseJson = toObject(rawResponse);
	const base = buildBase(message, value, contacts, metaWabaId, path);

	return {
		...base,
		kind: "flow_submission",
		flowName: readText(reply.name, 256),
		flowToken: readText(reply.flow_token, 512),
		responseJson,
		responseJsonValid: responseJson !== null,
		issues: [
			...baseIssues(base),
			...(responseJson ? [] : ["invalid_flow_response_json"]),
		],
	};
}

function confirmationReply(
	message: JsonRecord,
	value: JsonRecord,
	contacts: MetaContact[],
	metaWabaId: string | null,
	path: MetaWebhookPath,
): MetaOrderIngressEvent | null {
	const interactive = isRecord(message.interactive) ? message.interactive : {};
	const buttonReply = isRecord(interactive.button_reply)
		? interactive.button_reply
		: null;
	const legacyButton = isRecord(message.button) ? message.button : null;
	const reply = buttonReply ?? legacyButton;
	if (!reply) return null;

	const replyId = readText(reply.id, 256) ?? readText(reply.payload, 256);
	const base = buildBase(message, value, contacts, metaWabaId, path);
	return {
		...base,
		kind: "confirmation_reply",
		replyId,
		replyTitle: readText(reply.title, 256),
		issues: [...baseIssues(base), ...(replyId ? [] : ["missing_reply_id"])],
	};
}

/** Extract only messages needed by order intake; other webhook events stay with the existing router. */
export function extractMetaOrderIngressEvents(
	payload: unknown,
): MetaOrderIngressEvent[] {
	if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
	const events: MetaOrderIngressEvent[] = [];

	for (const [entryIndex, entry] of payload.entry.entries()) {
		if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
		for (const [changeIndex, change] of entry.changes.entries()) {
			if (!isRecord(change) || !isRecord(change.value)) continue;
			const value = change.value;
			if (!Array.isArray(value.messages)) continue;
			const contacts = contactsFor(value);
			const metaWabaId = readText(entry.id, 128);

			for (const [messageIndex, candidate] of value.messages.entries()) {
				if (!isRecord(candidate)) continue;
				const path = { entryIndex, changeIndex, itemIndex: messageIndex };
				if (candidate.type === "order") {
					events.push(
						catalogOrder(candidate, value, contacts, metaWabaId, path),
					);
					continue;
				}
				const interactive = isRecord(candidate.interactive)
					? candidate.interactive
					: {};
				if (
					candidate.type === "interactive" &&
					isRecord(interactive.nfm_reply)
				) {
					events.push(
						flowSubmission(candidate, value, contacts, metaWabaId, path),
					);
					continue;
				}
				if (candidate.type === "interactive" || candidate.type === "button") {
					const reply = confirmationReply(
						candidate,
						value,
						contacts,
						metaWabaId,
						path,
					);
					if (reply) events.push(reply);
				}
			}
		}
	}

	return events;
}

function messageText(message: JsonRecord): string | null {
	const textObject = isRecord(message.text) ? message.text : null;
	if (textObject) return readText(textObject.body, 4_000);
	const order = isRecord(message.order) ? message.order : null;
	if (order) return readText(order.text, 4_000);
	const interactive = isRecord(message.interactive)
		? message.interactive
		: null;
	if (interactive) {
		const button = isRecord(interactive.button_reply)
			? interactive.button_reply
			: null;
		const list = isRecord(interactive.list_reply)
			? interactive.list_reply
			: null;
		return readText(button?.title ?? list?.title, 256);
	}
	const legacyButton = isRecord(message.button) ? message.button : null;
	return readText(legacyButton?.text, 256);
}

function mediaId(message: JsonRecord): string | null {
	for (const key of ["image", "audio", "document", "video", "sticker"]) {
		const media = isRecord(message[key]) ? message[key] : null;
		const id = readText(media?.id, 256);
		if (id) return id;
	}
	return null;
}

function canonicalMessageType(value: unknown): string {
	const type = readText(value, 80)?.toLowerCase() ?? "unknown";
	if (
		[
			"text",
			"audio",
			"image",
			"document",
			"location",
			"interactive",
			"button",
			"template",
			"reaction",
		].includes(type)
	) {
		return type;
	}
	return "unknown";
}

/** Extract sender identities before any legacy digit-only phone normalization. */
export function extractMetaInboundMessageIdentities(
	payload: unknown,
): MetaInboundMessageIdentity[] {
	if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
	const messages: MetaInboundMessageIdentity[] = [];
	for (const [entryIndex, entry] of payload.entry.entries()) {
		if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
		for (const [changeIndex, change] of entry.changes.entries()) {
			if (!isRecord(change) || !isRecord(change.value)) continue;
			const value = change.value;
			if (!Array.isArray(value.messages)) continue;
			const contacts = contactsFor(value);
			const metaWabaId = readText(entry.id, 128);
			for (const [itemIndex, candidate] of value.messages.entries()) {
				if (!isRecord(candidate)) continue;
				const base = buildBase(candidate, value, contacts, metaWabaId, {
					entryIndex,
					changeIndex,
					itemIndex,
				});
				messages.push({
					...base,
					messageType: canonicalMessageType(candidate.type),
					textBody: messageText(candidate),
					mediaId: mediaId(candidate),
				});
			}
		}
	}
	return messages;
}

/** Extract status callbacks whose recipient is not a verified E.164 phone. */
export function extractMetaUnaddressableStatuses(
	payload: unknown,
): MetaWebhookStatusIdentity[] {
	if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
	const statuses: MetaWebhookStatusIdentity[] = [];
	for (const [entryIndex, entry] of payload.entry.entries()) {
		if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
		for (const [changeIndex, change] of entry.changes.entries()) {
			if (!isRecord(change) || !isRecord(change.value)) continue;
			const value = change.value;
			if (!Array.isArray(value.statuses)) continue;
			const metadata = isRecord(value.metadata) ? value.metadata : {};
			for (const [itemIndex, candidate] of value.statuses.entries()) {
				if (!isRecord(candidate)) continue;
				const recipient = readText(candidate.recipient_id, 256);
				const recipientPhoneE164 = readPhoneE164(recipient);
				if (recipientPhoneE164) continue;
				const errors = Array.isArray(candidate.errors)
					? candidate.errors.filter(isRecord)
					: [];
				const firstError = errors[0] ?? {};
				statuses.push({
					path: { entryIndex, changeIndex, itemIndex },
					metaPhoneNumberId: readText(metadata.phone_number_id, 128),
					metaWabaId: readText(entry.id, 128),
					recipientPhoneE164: null,
					recipientProviderId: recipient,
					providerMessageId: readText(candidate.id, 256),
					status: readText(candidate.status, 64)?.toLowerCase() ?? null,
					timestamp: readText(candidate.timestamp, 64),
					errorCode:
						firstError.code === undefined || firstError.code === null
							? null
							: readText(String(firstError.code), 40),
					errorTitle: readText(firstError.title, 240),
					errorDetail: readText(firstError.details, 600),
				});
			}
		}
	}
	return statuses;
}

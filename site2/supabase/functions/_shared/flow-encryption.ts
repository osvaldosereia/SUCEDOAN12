export type EncryptedFlowRequest = {
	encrypted_aes_key: string;
	encrypted_flow_data: string;
	initial_vector: string;
};

export type DecryptedFlowRequest = {
	body: Record<string, unknown>;
	aesKey: Uint8Array;
	initialVector: Uint8Array;
};

export type FlowCryptoErrorCode =
	| "invalid_signature"
	| "invalid_private_key"
	| "invalid_encrypted_request"
	| "aes_key_decryption_failed"
	| "flow_data_decryption_failed"
	| "invalid_flow_response";

export class FlowCryptoError extends Error {
	constructor(readonly code: FlowCryptoErrorCode) {
		super(code);
		this.name = "FlowCryptoError";
	}
}

const AES_KEY_BYTES = 16;
const GCM_IV_BYTES = 12;
const GCM_TAG_BITS = 128;
const MAX_PKCS8_BASE64_LENGTH = 16_384;
const MAX_ENCRYPTED_AES_KEY_BASE64_LENGTH = 16_384;
const MAX_ENCRYPTED_FLOW_DATA_BASE64_LENGTH = 256_000;

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.slice().buffer as ArrayBuffer;
}

function decodeBase64(value: string): Uint8Array | null {
	if (
		value.length === 0 ||
		value.length % 4 !== 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
			value,
		)
	) {
		return null;
	}

	try {
		const binary = atob(value);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	} catch {
		return null;
	}
}

function decodeBase64Url(value: string): Uint8Array | null {
	if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
	try {
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return bytes;
	} catch {
		return null;
	}
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 32_768;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + chunkSize),
		);
	}
	return btoa(binary);
}

function readPkcs8Der(privateKeyMaterial: string): Uint8Array | null {
	if (privateKeyMaterial.length > MAX_PKCS8_BASE64_LENGTH) return null;
	const base64 = privateKeyMaterial
		.trim()
		.replace(/\\n/g, "\n")
		.replace("-----BEGIN PRIVATE KEY-----", "")
		.replace("-----END PRIVATE KEY-----", "")
		.replace(/\s+/g, "");
	return decodeBase64(base64);
}

function readEncryptedRequest(value: unknown): {
	encryptedAesKey: Uint8Array;
	flowData: Uint8Array;
	initialVector: Uint8Array;
} | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const body = value as Partial<EncryptedFlowRequest>;
	if (
		typeof body.encrypted_aes_key !== "string" ||
		typeof body.encrypted_flow_data !== "string" ||
		typeof body.initial_vector !== "string" ||
		body.encrypted_aes_key.length > MAX_ENCRYPTED_AES_KEY_BASE64_LENGTH ||
		body.encrypted_flow_data.length > MAX_ENCRYPTED_FLOW_DATA_BASE64_LENGTH ||
		body.initial_vector.length > 64
	) {
		return null;
	}

	const encryptedAesKey = decodeBase64(body.encrypted_aes_key);
	const flowData = decodeBase64(body.encrypted_flow_data);
	const initialVector = decodeBase64(body.initial_vector);
	if (
		!encryptedAesKey ||
		!flowData ||
		flowData.length <= GCM_TAG_BITS / 8 ||
		!initialVector ||
		initialVector.length !== GCM_IV_BYTES
	) {
		return null;
	}
	return { encryptedAesKey, flowData, initialVector };
}

function decodeSha256Signature(header: string | null): Uint8Array | null {
	const match = /^sha256=([a-f0-9]{64})$/i.exec(header ?? "");
	if (!match) return null;
	const hex = match[1];
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
	let difference = left.length ^ right.length;
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return difference === 0;
}

/** Verify x-hub-signature-256 against the exact raw HTTP body bytes. */
export async function verifyMetaFlowSignature(
	rawBody: Uint8Array,
	signatureHeader: string | null,
	appSecret: string,
): Promise<boolean> {
	const provided = decodeSha256Signature(signatureHeader);
	if (!provided || appSecret.length === 0) return false;

	try {
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(appSecret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const expected = new Uint8Array(
			await crypto.subtle.sign("HMAC", key, asArrayBuffer(rawBody)),
		);
		return constantTimeEqual(expected, provided);
	} catch {
		return false;
	}
}

/** Verify Meta's optional HS256 JWT binding the request to its Flow token. */
export async function verifyMetaFlowTokenSignature(
	flowTokenSignature: unknown,
	expectedFlowToken: string,
	appSecret: string,
): Promise<boolean> {
	if (
		typeof flowTokenSignature !== "string" ||
		flowTokenSignature.length > 8_192 ||
		appSecret.length === 0 ||
		expectedFlowToken.length === 0
	) {
		return false;
	}

	const parts = flowTokenSignature.split(".");
	if (parts.length !== 3) return false;
	const [encodedHeader, encodedPayload, encodedSignature] = parts;
	if (!encodedHeader || !encodedPayload || !encodedSignature) return false;

	const headerBytes = decodeBase64Url(encodedHeader);
	const payloadBytes = decodeBase64Url(encodedPayload);
	const signature = decodeBase64Url(encodedSignature);
	if (!headerBytes || !payloadBytes || !signature) return false;

	let header: unknown;
	let payload: unknown;
	try {
		const decoder = new TextDecoder("utf-8", { fatal: true });
		header = JSON.parse(decoder.decode(headerBytes)) as unknown;
		payload = JSON.parse(decoder.decode(payloadBytes)) as unknown;
	} catch {
		return false;
	}
	if (
		typeof header !== "object" ||
		header === null ||
		Array.isArray(header) ||
		(header as Record<string, unknown>).alg !== "HS256" ||
		typeof payload !== "object" ||
		payload === null ||
		Array.isArray(payload) ||
		(payload as Record<string, unknown>).flow_token !== expectedFlowToken
	) {
		return false;
	}

	try {
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(appSecret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);
		return await crypto.subtle.verify(
			"HMAC",
			key,
			asArrayBuffer(signature),
			new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
		);
	} catch {
		return false;
	}
}

/** Decrypts Meta's RSA-OAEP/SHA-256 wrapped AES-128-GCM Flow request. */
export async function decryptMetaFlowRequest(
	encryptedRequest: unknown,
	privateKeyPkcs8: string,
): Promise<DecryptedFlowRequest> {
	const request = readEncryptedRequest(encryptedRequest);
	if (!request) throw new FlowCryptoError("invalid_encrypted_request");

	const pkcs8 = readPkcs8Der(privateKeyPkcs8);
	if (!pkcs8) throw new FlowCryptoError("invalid_private_key");

	let privateKey: CryptoKey;
	try {
		privateKey = await crypto.subtle.importKey(
			"pkcs8",
			asArrayBuffer(pkcs8),
			{ name: "RSA-OAEP", hash: "SHA-256" },
			false,
			["decrypt"],
		);
	} catch {
		throw new FlowCryptoError("invalid_private_key");
	}

	let aesKey: Uint8Array;
	try {
		aesKey = new Uint8Array(
			await crypto.subtle.decrypt(
				{ name: "RSA-OAEP" },
				privateKey,
				asArrayBuffer(request.encryptedAesKey),
			),
		);
	} catch {
		throw new FlowCryptoError("aes_key_decryption_failed");
	}
	if (aesKey.length !== AES_KEY_BYTES) {
		throw new FlowCryptoError("aes_key_decryption_failed");
	}

	let plaintext: ArrayBuffer;
	try {
		const key = await crypto.subtle.importKey(
			"raw",
			asArrayBuffer(aesKey),
			"AES-GCM",
			false,
			["decrypt"],
		);
		plaintext = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: asArrayBuffer(request.initialVector),
				tagLength: GCM_TAG_BITS,
			},
			key,
			asArrayBuffer(request.flowData),
		);
	} catch {
		throw new FlowCryptoError("flow_data_decryption_failed");
	}

	try {
		const body: unknown = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
		);
		if (typeof body !== "object" || body === null || Array.isArray(body)) {
			throw new Error("invalid_flow_body");
		}
		return {
			body: body as Record<string, unknown>,
			aesKey,
			initialVector: request.initialVector,
		};
	} catch {
		throw new FlowCryptoError("flow_data_decryption_failed");
	}
}

/** Encrypts a response using the bytewise-complemented request IV required by Meta. */
export async function encryptMetaFlowResponse(
	responseBody: Record<string, unknown>,
	aesKeyBytes: Uint8Array,
	requestInitialVector: Uint8Array,
): Promise<string> {
	if (
		aesKeyBytes.length !== AES_KEY_BYTES ||
		requestInitialVector.length !== GCM_IV_BYTES
	) {
		throw new FlowCryptoError("invalid_flow_response");
	}

	let serialized: string;
	try {
		serialized = JSON.stringify(responseBody);
	} catch {
		throw new FlowCryptoError("invalid_flow_response");
	}
	if (typeof serialized !== "string") {
		throw new FlowCryptoError("invalid_flow_response");
	}

	const responseIv = requestInitialVector.map((byte) => byte ^ 0xff);
	try {
		const key = await crypto.subtle.importKey(
			"raw",
			asArrayBuffer(aesKeyBytes),
			"AES-GCM",
			false,
			["encrypt"],
		);
		const ciphertextAndTag = await crypto.subtle.encrypt(
			{
				name: "AES-GCM",
				iv: asArrayBuffer(responseIv),
				tagLength: GCM_TAG_BITS,
			},
			key,
			new TextEncoder().encode(serialized),
		);
		return encodeBase64(new Uint8Array(ciphertextAndTag));
	} catch {
		throw new FlowCryptoError("invalid_flow_response");
	}
}

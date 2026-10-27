export type FlowImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type FlowImageAsset = {
	base64: string;
	bytes: Uint8Array;
	mediaType: FlowImageMediaType;
	byteLength: number;
};

export type FlowImageAssetResult =
	| { ok: true; asset: FlowImageAsset }
	| {
			ok: false;
			reason:
				| "invalid_source_url"
				| "image_unavailable"
				| "image_too_large"
				| "unsupported_image_type"
				| "invalid_image_bytes";
	  };

const MAX_SOURCE_IMAGE_BYTES = 500_000;
const IMAGE_FETCH_TIMEOUT_MS = 4_000;
const STORAGE_OBJECT_PREFIX = "/storage/v1/object/public/product-images/";
const STORAGE_RENDER_PREFIX = "/storage/v1/render/image/public/product-images/";
const LEGACY_CATALOG_PREFIX = "/osvaldosereia/sucedoan12/";
const BASE64_CHUNK_BYTES = 32_768;

function isAllowedImageUrl(imageUrl: string, supabaseUrl: string): boolean {
	if (imageUrl.length > 2_048 || supabaseUrl.length > 512) return false;

	try {
		const image = new URL(imageUrl);
		const project = new URL(supabaseUrl);
		if (
			image.protocol !== "https:" ||
			image.username ||
			image.password ||
			image.port ||
			image.search ||
			image.hash ||
			project.protocol !== "https:" ||
			project.username ||
			project.password
		) {
			return false;
		}

		if (image.origin === project.origin) {
			return (
				image.pathname.startsWith(STORAGE_OBJECT_PREFIX) ||
				image.pathname.startsWith(STORAGE_RENDER_PREFIX)
			);
		}

		return (
			image.hostname === "raw.githubusercontent.com" &&
			image.pathname.toLowerCase().startsWith(LEGACY_CATALOG_PREFIX)
		);
	} catch {
		return false;
	}
}

function mediaTypeFromHeader(value: string | null): FlowImageMediaType | null {
	const mediaType = value?.split(";", 1)[0]?.trim().toLowerCase();
	return mediaType === "image/jpeg" ||
		mediaType === "image/png" ||
		mediaType === "image/webp"
		? mediaType
		: null;
}

function matchesImageSignature(
	bytes: Uint8Array,
	mediaType: FlowImageMediaType,
): boolean {
	if (mediaType === "image/jpeg") {
		return (
			bytes.length >= 3 &&
			bytes[0] === 0xff &&
			bytes[1] === 0xd8 &&
			bytes[2] === 0xff
		);
	}

	if (mediaType === "image/png") {
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	}

	return (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	);
}

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
		const chunk = bytes.subarray(offset, offset + BASE64_CHUNK_BYTES);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

async function readImageBytes(
	response: Response,
): Promise<
	| { ok: true; bytes: Uint8Array }
	| { ok: false; reason: "image_too_large" | "image_unavailable" }
> {
	if (!response.body) {
		return { ok: true, bytes: new Uint8Array() };
	}
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		byteLength += value.byteLength;
		if (byteLength > MAX_SOURCE_IMAGE_BYTES) {
			await reader.cancel();
			return { ok: false, reason: "image_too_large" };
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { ok: true, bytes };
}

/**
 * Fetches only the two image origins currently present in the canonical catalog,
 * rejects redirects and non-image responses, and bounds bytes before base64 encoding.
 * The caller still has to validate the exact Meta Flow component/version contract.
 */
export async function loadFlowImageAsset(
	imageUrl: string,
	supabaseUrl: string,
): Promise<FlowImageAssetResult> {
	if (!isAllowedImageUrl(imageUrl, supabaseUrl)) {
		return { ok: false, reason: "invalid_source_url" };
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(imageUrl, {
			method: "GET",
			cache: "no-store",
			redirect: "error",
			signal: controller.signal,
			headers: { Accept: "image/jpeg,image/png,image/webp" },
		});
	} catch {
		clearTimeout(timeout);
		return { ok: false, reason: "image_unavailable" };
	}

	if (!response.ok) {
		clearTimeout(timeout);
		return { ok: false, reason: "image_unavailable" };
	}

	const declaredLength = Number(response.headers.get("Content-Length"));
	if (
		Number.isFinite(declaredLength) &&
		declaredLength > MAX_SOURCE_IMAGE_BYTES
	) {
		clearTimeout(timeout);
		await response.body?.cancel();
		return { ok: false, reason: "image_too_large" };
	}

	const mediaType = mediaTypeFromHeader(response.headers.get("Content-Type"));
	if (!mediaType) {
		clearTimeout(timeout);
		await response.body?.cancel();
		return { ok: false, reason: "unsupported_image_type" };
	}

	let imageRead: Awaited<ReturnType<typeof readImageBytes>>;
	try {
		imageRead = await readImageBytes(response);
	} catch {
		imageRead = { ok: false, reason: "image_unavailable" };
	} finally {
		clearTimeout(timeout);
	}

	if (!imageRead.ok) return imageRead;
	const { bytes } = imageRead;
	if (!matchesImageSignature(bytes, mediaType)) {
		return { ok: false, reason: "invalid_image_bytes" };
	}

	return {
		ok: true,
		asset: {
			base64: encodeBase64(bytes),
			bytes,
			mediaType,
			byteLength: bytes.byteLength,
		},
	};
}

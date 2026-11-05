import {
	ImageMagick,
	initializeImageMagick,
	MagickFormat,
	MagickGeometry,
} from "npm:@imagemagick/magick-wasm@0.0.30";
import type { FlowImageAsset } from "./flow-image-assets.ts";

const MAX_FLOW_IMAGE_BYTES = 46_000;
const MAX_BASE64_CHUNK_BYTES = 32_768;
let imageMagickReady: Promise<void> | null = null;

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	for (
		let offset = 0;
		offset < bytes.length;
		offset += MAX_BASE64_CHUNK_BYTES
	) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + MAX_BASE64_CHUNK_BYTES),
		);
	}
	return btoa(binary);
}

async function initialize(): Promise<void> {
	imageMagickReady ??= (async () => {
		const wasm = await Deno.readFile(
			new URL(import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")),
		);
		await initializeImageMagick(wasm);
	})();
	await imageMagickReady;
}

async function convertToCompactJpeg(
	source: Uint8Array,
): Promise<Uint8Array | null> {
	try {
		await initialize();
		const converted = await ImageMagick.read(source, (image): Uint8Array => {
			const geometry = new MagickGeometry(320, 320);
			geometry.greater = true;
			image.resize(geometry);
			image.quality = 58;
			return image.write(MagickFormat.Jpeg, (bytes) => new Uint8Array(bytes));
		});
		if (
			!(converted instanceof Uint8Array) ||
			converted.byteLength < 4 ||
			converted.byteLength > MAX_FLOW_IMAGE_BYTES ||
			converted[0] !== 0xff ||
			converted[1] !== 0xd8 ||
			converted[2] !== 0xff
		) {
			return null;
		}
		return converted;
	} catch {
		return null;
	}
}

/**
 * Emits a compact data URI so a screen can carry a small photo on each choice.
 * The exact choice-image property still needs Meta Flow Validator approval.
 */
export async function toMetaFlowImageDataUri(
	asset: FlowImageAsset,
): Promise<string | null> {
	if (
		(asset.mediaType === "image/jpeg" || asset.mediaType === "image/png") &&
		asset.byteLength <= MAX_FLOW_IMAGE_BYTES
	) {
		return `data:${asset.mediaType};base64,${asset.base64}`;
	}

	const jpeg = await convertToCompactJpeg(asset.bytes);
	return jpeg ? `data:image/jpeg;base64,${encodeBase64(jpeg)}` : null;
}

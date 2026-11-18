"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import {
	type AdminProductImageError,
	saveAdminProductImage,
} from "@/lib/supabase/admin-product-images";

export type ProductImageSaveState = {
	kind: "idle" | "success" | "error";
	message: string;
};

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 500_000;

function errorMessage(error: AdminProductImageError): string {
	const messages: Record<AdminProductImageError, string> = {
		not_configured: "A conexão do catálogo ainda não está configurada.",
		not_authenticated:
			"Sua sessão expirou. Entre novamente para salvar a foto.",
		not_authorized:
			"Esta conta não tem permissão para alterar fotos de produtos.",
		invalid_file: "Escolha uma imagem JPG, PNG ou WebP com até 500 KB.",
		conflict:
			"Outra pessoa alterou a foto. Atualize a página e tente novamente.",
		unavailable:
			"Não foi possível confirmar a foto. Atualize a ficha antes de tentar novamente.",
	};
	return messages[error];
}

function matchesFileSignature(file: File, bytes: Uint8Array): boolean {
	if (file.type === "image/jpeg") {
		return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}
	if (file.type === "image/png") {
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
		file.type === "image/webp" &&
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
	);
}

export async function saveProductImageAction(
	_previous: ProductImageSaveState,
	formData: FormData,
): Promise<ProductImageSaveState> {
	await requireAdminSession();

	const productId = formData.get("productId");
	const file = formData.get("image");
	if (
		typeof productId !== "string" ||
		!UUID.test(productId) ||
		!(file instanceof File) ||
		file.size === 0 ||
		file.size > MAX_FILE_BYTES ||
		!(
			file.type === "image/jpeg" ||
			file.type === "image/png" ||
			file.type === "image/webp"
		)
	) {
		return { kind: "error", message: errorMessage("invalid_file") };
	}

	const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	if (!matchesFileSignature(file, signature)) {
		return { kind: "error", message: errorMessage("invalid_file") };
	}

	const result = await saveAdminProductImage({ productId, file });
	if (!result.ok) {
		return { kind: "error", message: errorMessage(result.error) };
	}

	revalidatePath("/produtos");
	revalidatePath(`/produtos/${productId}`);
	return {
		kind: "success",
		message: "Foto atualizada no cadastro do produto.",
	};
}

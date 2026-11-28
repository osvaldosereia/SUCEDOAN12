"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { saveAdminCatalogMapping } from "@/lib/supabase/admin-catalog-mappings";

export type CatalogMappingFormState = {
	kind: "idle" | "success" | "error";
	message: string;
};

function textField(
	formData: FormData,
	name: string,
	max: number,
): string | null {
	const value = formData.get(name);
	if (typeof value !== "string" || value.length > max) return null;
	return value.trim();
}

function hasControlCharacters(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

function messageForError(
	error: NonNullable<
		Awaited<ReturnType<typeof saveAdminCatalogMapping>>["error"]
	>,
): string {
	const messages: Record<typeof error, string> = {
		not_configured: "A conexão com o Supabase ainda não está configurada.",
		not_authenticated: "Entre novamente para salvar o vínculo.",
		not_authorized: "Esta conta não tem permissão para editar o Catálogo Meta.",
		invalid_input: "Confira o número, o ID do catálogo e o ID do produto Meta.",
		mapping_already_exists:
			"Esse ID de produto Meta já está vinculado neste catálogo e número.",
		mapping_not_found: "O vínculo não existe mais. Atualize a página.",
		whatsapp_product_unavailable:
			"Escolha um produto ativo e habilitado para venda no WhatsApp.",
		unavailable:
			"Não foi possível salvar. Atualize a página e tente novamente.",
	};
	return messages[error];
}

export async function saveCatalogMappingAction(
	_previous: CatalogMappingFormState,
	formData: FormData,
): Promise<CatalogMappingFormState> {
	await requireAdminSession();
	const accountId = textField(formData, "accountId", 36);
	const catalogId = textField(formData, "catalogId", 256);
	const retailerId = textField(formData, "retailerId", 256);
	const productId = textField(formData, "productId", 36);
	const linkId = textField(formData, "linkId", 36);
	if (
		!accountId ||
		!catalogId ||
		!retailerId ||
		!productId ||
		linkId === null ||
		hasControlCharacters(catalogId) ||
		hasControlCharacters(retailerId)
	) {
		return {
			kind: "error",
			message:
				"Preencha todos os campos com os identificadores exatos da Meta.",
		};
	}

	const result = await saveAdminCatalogMapping({
		accountId,
		catalogId,
		retailerId,
		productId,
		linkId: linkId || null,
	});
	if (!result.ok && result.error) {
		return { kind: "error", message: messageForError(result.error) };
	}

	revalidatePath("/produtos/catalogo");
	return {
		kind: "success",
		message: "Vínculo salvo e enviado para conferência.",
	};
}

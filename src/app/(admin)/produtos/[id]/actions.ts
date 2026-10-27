"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { setAdminProductWhatsappAvailability } from "@/lib/supabase/admin-product-whatsapp-availability";
import {
	getAdminProductDetail,
	quickSaveAdminProduct,
} from "@/lib/supabase/admin-products";

export type ProductActionState = {
	kind: "idle" | "success" | "error";
	message: string;
};

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function textField(
	formData: FormData,
	name: string,
	max: number,
): string | null {
	const value = formData.get(name);
	if (typeof value !== "string" || value.length > max) return null;
	return value.trim();
}

function priceToCents(value: string): number | null {
	const match = value.match(/^(\d{1,12})(?:[,.](\d{1,2}))?$/);
	if (!match) return null;
	const whole = Number(match[1]);
	const fraction = Number((match[2] ?? "").padEnd(2, "0"));
	const cents = whole * 100 + fraction;
	return Number.isSafeInteger(cents) ? cents : null;
}

function expectedPrice(value: string): number | null | undefined {
	if (value === "") return null;
	if (!/^\d{1,15}$/.test(value)) return undefined;
	const cents = Number(value);
	return Number.isSafeInteger(cents) ? cents : undefined;
}

function saveErrorMessage(
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "invalid_input"
		| "unavailable",
): string {
	const messages: Record<typeof error, string> = {
		not_configured: "A conexão do catálogo ainda não está configurada.",
		not_authenticated: "Entre novamente para salvar o produto.",
		not_authorized: "Esta conta não tem permissão para editar produtos.",
		invalid_input:
			"O produto mudou ou os dados não são aceitos. Atualize a página e confira o preço.",
		unavailable:
			"Não foi possível salvar agora. Confira o produto antes de tentar novamente.",
	};
	return messages[error];
}

export async function saveProductQuickAction(
	_previous: ProductActionState,
	formData: FormData,
): Promise<ProductActionState> {
	await requireAdminSession();

	const productId = textField(formData, "productId", 36);
	const rawPrice = textField(formData, "salePrice", 32);
	const rawExpectedPrice = textField(formData, "expectedPriceCents", 16);
	const rawExpectedActive = textField(formData, "expectedActive", 5);
	if (
		!productId ||
		!UUID.test(productId) ||
		rawPrice === null ||
		rawExpectedPrice === null ||
		(rawExpectedActive !== "true" && rawExpectedActive !== "false")
	) {
		return {
			kind: "error",
			message: "Confira o preço e tente salvar novamente.",
		};
	}

	const priceCents = priceToCents(rawPrice);
	const previousPriceCents = expectedPrice(rawExpectedPrice);
	if (priceCents === null || previousPriceCents === undefined) {
		return {
			kind: "error",
			message: "Informe um preço válido, usando até duas casas decimais.",
		};
	}

	const current = await getAdminProductDetail(productId);
	if (!current.product) {
		return {
			kind: "error",
			message:
				current.error === "not_authorized"
					? saveErrorMessage("not_authorized")
					: "Não foi possível atualizar o cadastro. Reabra o produto e tente novamente.",
		};
	}
	if (
		current.product.priceCents !== previousPriceCents ||
		current.product.active !== (rawExpectedActive === "true")
	) {
		revalidatePath(`/produtos/${productId}`);
		return {
			kind: "error",
			message:
				"Outra pessoa alterou o produto. Atualize a página e confira o preço e a situação.",
		};
	}

	const result = await quickSaveAdminProduct({
		productId,
		priceCents,
		active: formData.get("active") === "true",
	});
	if (!result.ok && result.error) {
		return { kind: "error", message: saveErrorMessage(result.error) };
	}

	revalidatePath("/produtos");
	revalidatePath(`/produtos/${productId}`);
	return { kind: "success", message: "Produto atualizado." };
}

export async function saveProductWhatsappAvailabilityAction(
	_previous: ProductActionState,
	formData: FormData,
): Promise<ProductActionState> {
	await requireAdminSession();

	const productId = textField(formData, "productId", 36);
	const rawExpected = textField(formData, "expectedWhatsappActive", 5);
	const rawDesired = textField(formData, "whatsappActive", 5);
	if (
		!productId ||
		!UUID.test(productId) ||
		(rawExpected !== "true" && rawExpected !== "false") ||
		(rawDesired !== "true" && rawDesired !== "false")
	) {
		return { kind: "error", message: "Atualize a página e tente novamente." };
	}

	const whatsappActive = rawDesired === "true";
	const result = await setAdminProductWhatsappAvailability({
		productId,
		expectedWhatsappActive: rawExpected === "true",
		whatsappActive,
	});
	if (!result.ok) {
		const messages: Record<typeof result.error, string> = {
			not_configured: "A conexão do catálogo ainda não está configurada.",
			not_authenticated: "Entre novamente para alterar o canal.",
			not_authorized:
				"Esta conta não pode alterar a disponibilidade no WhatsApp.",
			invalid_input: "Atualize a página e tente novamente.",
			not_found: "O produto não foi encontrado. Reabra o cadastro.",
			conflict: "Outra pessoa alterou este canal. Atualize a página e confira.",
			product_inactive:
				"Ative o produto no cadastro antes de habilitá-lo no WhatsApp.",
			flow_name_invalid:
				"Ajuste o nome do produto para usar no Flow e tente novamente.",
			flow_image_invalid:
				"Cadastre uma foto com endereço HTTPS antes de habilitar o Flow.",
			flow_price_invalid:
				"Corrija o preço do produto antes de habilitá-lo no Flow.",
			unavailable:
				"Não foi possível salvar agora. Confira o produto antes de tentar novamente.",
		};
		if (result.error === "conflict") {
			revalidatePath(`/produtos/${productId}`);
			revalidatePath("/cestas");
			revalidatePath("/cestas/[basketId]", "page");
		}
		return { kind: "error", message: messages[result.error] };
	}

	revalidatePath("/produtos");
	revalidatePath(`/produtos/${productId}`);
	revalidatePath("/cestas");
	revalidatePath("/cestas/[basketId]", "page");
	return {
		kind: "success",
		message: whatsappActive
			? "Produto habilitado para uso no WhatsApp."
			: "Produto desabilitado para uso no WhatsApp.",
	};
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import {
	type SaveBasketMoldInput,
	saveAdminBasketMoldOptions,
	searchAdminBasketMoldProducts,
	validateAdminBasketMoldProduct,
} from "@/lib/supabase/admin-basket-molds";

export async function searchBasketMoldProductsAction(query: string) {
	await requireAdminSession();
	if (
		typeof query !== "string" ||
		query.trim().length < 2 ||
		query.length > 80
	) {
		return { ok: false as const, error: "invalid_input" as const };
	}
	try {
		return await searchAdminBasketMoldProducts(query.trim());
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
}

export async function validateBasketMoldProductAction(productId: string) {
	await requireAdminSession();
	try {
		return await validateAdminBasketMoldProduct(productId);
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
}

export async function saveBasketMoldOptionsAction(input: SaveBasketMoldInput) {
	await requireAdminSession();
	try {
		if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 100_000) {
			return { ok: false as const, error: "invalid_input" as const };
		}
	} catch {
		return { ok: false as const, error: "invalid_input" as const };
	}

	let result: Awaited<ReturnType<typeof saveAdminBasketMoldOptions>>;
	try {
		result = await saveAdminBasketMoldOptions(input);
	} catch {
		return { ok: false as const, error: "unavailable" as const };
	}
	if (!result.ok) return result;
	revalidatePath("/cestas");
	revalidatePath(`/cestas/${input.basketId}`);
	return result;
}

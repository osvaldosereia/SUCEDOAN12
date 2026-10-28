"use client";

import { useActionState } from "react";
import {
	type ProductActionState,
	saveProductWhatsappAvailabilityAction,
} from "../../produtos/[id]/actions";

const INITIAL_STATE: ProductActionState = { kind: "idle", message: "" };

export function BasketProductWhatsappEnableAction({
	productId,
	productName,
}: {
	productId: string;
	productName: string;
}) {
	const [state, formAction, pending] = useActionState(
		saveProductWhatsappAvailabilityAction,
		INITIAL_STATE,
	);

	return (
		<div className="basket-mold-quick-enable">
			<form action={formAction}>
				<input name="productId" type="hidden" value={productId} />
				<input name="expectedWhatsappActive" type="hidden" value="false" />
				<input name="whatsappActive" type="hidden" value="true" />
				<button disabled={pending} type="submit">
					{pending ? "Habilitando…" : "Habilitar no WhatsApp"}
				</button>
			</form>
			<p>
				Ao habilitar {productName}, ele poderá aparecer nas opções de Flow de
				todas as cestas onde está associado.
			</p>
			{state.message && (
				<span
					aria-live="polite"
					className={`basket-mold-quick-enable__message basket-mold-quick-enable__message--${state.kind}`}
					role="status"
				>
					{state.message}
				</span>
			)}
		</div>
	);
}

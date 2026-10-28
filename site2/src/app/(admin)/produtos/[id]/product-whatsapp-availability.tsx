"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";
import {
	type ProductActionState,
	saveProductWhatsappAvailabilityAction,
} from "./actions";

const INITIAL_STATE: ProductActionState = { kind: "idle", message: "" };

export function ProductWhatsappAvailability({
	productId,
	whatsappActive,
}: {
	productId: string;
	whatsappActive: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		saveProductWhatsappAvailabilityAction,
		INITIAL_STATE,
	);
	const nextValue = !whatsappActive;

	return (
		<section
			aria-labelledby="product-whatsapp-heading"
			className="product-editor-card"
		>
			<div className="product-editor-heading">
				<div>
					<h2 id="product-whatsapp-heading">Disponibilidade no WhatsApp</h2>
					<p>
						{whatsappActive
							? "Habilitado para uso nas opções do Flow."
							: "Ainda não habilitado para uso nas opções do Flow."}
					</p>
				</div>
				<span
					className={`catalog-status-pill${whatsappActive ? " catalog-status-pill--active" : ""}`}
				>
					{whatsappActive ? "Habilitado" : "Desabilitado"}
				</span>
			</div>
			<form action={formAction} className="product-editor-form">
				<input name="productId" type="hidden" value={productId} />
				<input
					name="expectedWhatsappActive"
					type="hidden"
					value={String(whatsappActive)}
				/>
				<input name="whatsappActive" type="hidden" value={String(nextValue)} />
				<div className="product-flow-note" role="note">
					<AlertCircle aria-hidden="true" size={18} />
					<p>
						Este ajuste não publica nem vincula o produto ao Catálogo Meta. Ao
						desabilitar, ele deixa de aparecer em novas opções de cesta; pedidos
						já registrados não mudam.
					</p>
				</div>
				<div className="product-editor-footer">
					<p>
						A ativação exige produto ativo, nome válido, foto HTTPS e preço
						aceito pelo Flow.
					</p>
					<button className="catalog-submit" disabled={pending} type="submit">
						{pending
							? "Salvando…"
							: whatsappActive
								? "Desativar no WhatsApp"
								: "Ativar no WhatsApp"}
					</button>
				</div>
				{state.message && (
					<p
						aria-live="polite"
						className={`product-editor-message product-editor-message--${state.kind}`}
					>
						{state.message}
					</p>
				)}
			</form>
		</section>
	);
}

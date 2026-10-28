"use client";

import { useActionState } from "react";
import { type ProductActionState, saveProductQuickAction } from "./actions";

const INITIAL_STATE: ProductActionState = { kind: "idle", message: "" };

function priceInputValue(priceCents: number | null): string {
	if (priceCents === null) return "";
	const whole = Math.floor(priceCents / 100);
	const fraction = String(priceCents % 100).padStart(2, "0");
	return `${whole},${fraction}`;
}

export function ProductEditor({
	productId,
	priceCents,
	active,
}: {
	productId: string;
	priceCents: number | null;
	active: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		saveProductQuickAction,
		INITIAL_STATE,
	);

	return (
		<section
			aria-labelledby="product-editor-heading"
			className="product-editor-card"
		>
			<div className="product-editor-heading">
				<div>
					<h2 id="product-editor-heading">Preço e disponibilidade</h2>
					<p>Edite o preço de venda e a situação do produto.</p>
				</div>
			</div>
			<form action={formAction} className="product-editor-form">
				<input name="productId" type="hidden" value={productId} />
				<input
					name="expectedPriceCents"
					type="hidden"
					value={priceCents ?? ""}
				/>
				<input name="expectedActive" type="hidden" value={String(active)} />
				<label className="product-editor-field" htmlFor="salePrice">
					<span>Preço de venda</span>
					<span className="product-editor-price-input">
						<span aria-hidden="true">R$</span>
						<input
							autoComplete="off"
							id="salePrice"
							inputMode="decimal"
							maxLength={16}
							name="salePrice"
							placeholder="0,00"
							required
							defaultValue={priceInputValue(priceCents)}
						/>
					</span>
				</label>
				<label className="product-editor-availability">
					<input
						defaultChecked={active}
						name="active"
						type="checkbox"
						value="true"
					/>
					<span>Disponível na loja</span>
				</label>
				<div className="product-editor-footer">
					<p>
						Este formulário altera apenas preço e disponibilidade. Atualize a
						foto na seção própria.
					</p>
					<button className="catalog-submit" disabled={pending} type="submit">
						{pending ? "Salvando…" : "Salvar alterações"}
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

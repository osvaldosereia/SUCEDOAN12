"use client";

import { ImagePlus } from "lucide-react";
import { useActionState } from "react";
import {
	type ProductImageSaveState,
	saveProductImageAction,
} from "./image-actions";

const INITIAL_STATE: ProductImageSaveState = { kind: "idle", message: "" };

export function ProductImageEditor({
	productId,
	hasImage,
}: {
	productId: string;
	hasImage: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		saveProductImageAction,
		INITIAL_STATE,
	);

	return (
		<section
			aria-labelledby="product-image-editor-heading"
			className="product-editor-card product-image-editor-card"
		>
			<div className="product-editor-heading">
				<div>
					<h2 id="product-image-editor-heading">Foto do produto</h2>
					<p>
						{hasImage
							? "A foto está cadastrada. Envie outra para substituí-la."
							: "Adicione uma foto para completar o cadastro do produto."}
					</p>
				</div>
			</div>
			<form action={formAction} className="product-image-upload-form">
				<input name="productId" type="hidden" value={productId} />
				<label className="product-image-upload-field" htmlFor="productImage">
					<span>Imagem</span>
					<input
						accept="image/jpeg,image/png,image/webp"
						id="productImage"
						name="image"
						required
						type="file"
					/>
					<small>JPG, PNG ou WebP. Tamanho máximo: 500 KB.</small>
				</label>
				<button className="catalog-submit" disabled={pending} type="submit">
					<ImagePlus aria-hidden="true" size={15} />
					{pending ? "Enviando…" : hasImage ? "Atualizar foto" : "Salvar foto"}
				</button>
			</form>
			{state.message && (
				<p
					aria-live="polite"
					className={`product-editor-message product-editor-message--${state.kind}`}
				>
					{state.message}
				</p>
			)}
		</section>
	);
}

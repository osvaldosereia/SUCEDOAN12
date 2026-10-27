"use client";

import { useActionState } from "react";
import type { AdminCatalogAccount } from "@/lib/supabase/admin-catalog-mappings";
import type { AdminProduct } from "@/lib/supabase/admin-products";
import {
	type CatalogMappingFormState,
	saveCatalogMappingAction,
} from "./actions";

const INITIAL_STATE: CatalogMappingFormState = { kind: "idle", message: "" };

export function CatalogMappingForm({
	accounts,
	products,
	mapping,
}: {
	accounts: AdminCatalogAccount[];
	products: AdminProduct[];
	mapping?: {
		id: string;
		accountId: string;
		catalogId: string;
		retailerId: string;
		productId: string;
		productName: string;
		productSku: string | null;
	};
}) {
	const [state, formAction, pending] = useActionState(
		saveCatalogMappingAction,
		INITIAL_STATE,
	);
	const currentProduct = mapping
		? {
				id: mapping.productId,
				name: mapping.productName,
				sku: mapping.productSku,
			}
		: null;
	const productOptions = [
		...(currentProduct &&
		!products.some((product) => product.id === currentProduct.id)
			? [currentProduct]
			: []),
		...products,
	];

	return (
		<section
			aria-labelledby="catalog-mapping-form-heading"
			className="product-editor-card"
		>
			<div className="product-editor-heading">
				<div>
					<h2 id="catalog-mapping-form-heading">
						{mapping ? "Editar vínculo" : "Vincular produto do WhatsApp"}
					</h2>
					<p>
						Informe o ID exato enviado pela Meta. O vínculo fica pendente até a
						conferência do catálogo conectado.
					</p>
				</div>
			</div>
			{accounts.length === 0 ? (
				<p className="meta-catalog-empty">
					Nenhum número do WhatsApp está ativo no cadastro do projeto.
				</p>
			) : products.length === 0 && !currentProduct ? (
				<p className="meta-catalog-empty">
					Não há produtos ativos nesta busca. Procure pelo nome ou SKU acima e
					selecione o produto correto.
				</p>
			) : (
				<form action={formAction} className="meta-catalog-form">
					<input name="linkId" type="hidden" value={mapping?.id ?? ""} />
					<div className="meta-catalog-form-grid">
						<label className="customer-field">
							<span>Número do WhatsApp</span>
							<select
								defaultValue={mapping?.accountId ?? accounts[0]?.id ?? ""}
								name="accountId"
								required
							>
								{accounts.map((account) => (
									<option key={account.id} value={account.id}>
										{account.name}
										{account.phone ? ` · ${account.phone}` : ""}
									</option>
								))}
							</select>
						</label>
						<label className="customer-field">
							<span>ID do catálogo Meta</span>
							<input
								autoComplete="off"
								defaultValue={mapping?.catalogId ?? ""}
								maxLength={256}
								name="catalogId"
								placeholder="Cole o ID do catálogo"
								required
							/>
						</label>
						<label className="customer-field">
							<span>ID do produto no catálogo</span>
							<input
								autoComplete="off"
								defaultValue={mapping?.retailerId ?? ""}
								maxLength={256}
								name="retailerId"
								placeholder="product_retailer_id"
								required
							/>
						</label>
						<label className="customer-field">
							<span>Produto cadastrado no Admin</span>
							<select
								defaultValue={mapping?.productId ?? ""}
								name="productId"
								required
							>
								<option disabled value="">
									Selecione um produto
								</option>
								{productOptions.map((product) => (
									<option key={product.id} value={product.id}>
										{product.name}
										{product.sku ? ` · ${product.sku}` : ""}
									</option>
								))}
							</select>
						</label>
					</div>
					<div className="meta-catalog-form-footer">
						<p>
							Salvar ou corrigir um vínculo sempre remove a verificação
							anterior. Somente uma conferência do catálogo Meta poderá
							liberá-lo para pedidos.
						</p>
						<button className="catalog-submit" disabled={pending} type="submit">
							{pending ? "Salvando…" : "Salvar vínculo"}
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
			)}
		</section>
	);
}

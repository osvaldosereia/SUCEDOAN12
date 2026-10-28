"use client";

import { useState } from "react";
import {
	type BrowserCatalogAccount,
	type BrowserCatalogMapping,
	type BrowserCatalogProduct,
	saveBrowserCatalogMapping,
} from "@/lib/supabase/browser-admin-catalog";

type FormNotice = { kind: "success" | "error"; message: string };

function errorMessage(code: string | null): string {
	const messages: Record<string, string> = {
		not_configured: "A conexão com o Supabase ainda não está configurada.",
		not_authenticated: "Entre novamente para salvar o vínculo.",
		not_authorized: "Esta conta não tem permissão para editar o Catálogo Meta.",
		invalid_input: "Confira o número, o ID do catálogo e o ID do produto Meta.",
		mapping_already_exists:
			"Esse ID de produto Meta já está vinculado neste catálogo e número.",
		mapping_not_found: "O vínculo não existe mais. Atualize a página.",
		whatsapp_product_unavailable:
			"Escolha um produto ativo e habilitado para venda no WhatsApp.",
	};
	return code
		? (messages[code] ??
				"Não foi possível salvar. Atualize a página e tente novamente.")
		: "Não foi possível salvar. Atualize a página e tente novamente.";
}

export function CatalogMappingForm({
	accounts,
	products,
	mapping,
	onSaved,
}: {
	accounts: BrowserCatalogAccount[];
	products: BrowserCatalogProduct[];
	mapping?: BrowserCatalogMapping;
	onSaved?: () => void;
}) {
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<FormNotice | null>(null);
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

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		setPending(true);
		setNotice(null);
		const result = await saveBrowserCatalogMapping({
			accountId: String(data.get("accountId") ?? ""),
			catalogId: String(data.get("catalogId") ?? "").trim(),
			retailerId: String(data.get("retailerId") ?? "").trim(),
			productId: String(data.get("productId") ?? ""),
			linkId: String(data.get("linkId") ?? "") || null,
		});
		setPending(false);
		if (!result.ok) {
			setNotice({ kind: "error", message: errorMessage(result.error) });
			return;
		}
		setNotice({
			kind: "success",
			message: "Vínculo salvo e enviado para conferência.",
		});
		onSaved?.();
	}

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
					Não há produtos ativos nesta busca. Procure pelo nome ou SKU e
					selecione o produto correto.
				</p>
			) : (
				<form className="meta-catalog-form" onSubmit={submit}>
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
							Salvar ou corrigir um vínculo sempre remove a conferência
							anterior. Somente uma conferência do catálogo Meta poderá
							liberá-lo para pedidos.
						</p>
						<button className="catalog-submit" disabled={pending} type="submit">
							{pending ? "Salvando…" : "Salvar vínculo"}
						</button>
					</div>
					{notice && (
						<p
							aria-live="polite"
							className={`product-editor-message product-editor-message--${notice.kind}`}
						>
							{notice.message}
						</p>
					)}
				</form>
			)}
		</section>
	);
}

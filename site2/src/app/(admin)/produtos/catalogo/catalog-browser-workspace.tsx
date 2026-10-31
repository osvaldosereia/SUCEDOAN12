"use client";

import { AlertCircle, ArrowLeft, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
	type BrowserCatalogData,
	type BrowserCatalogProduct,
	loadBrowserCatalog,
	loadBrowserCatalogProducts,
} from "@/lib/supabase/browser-admin-catalog";
import { CatalogMappingForm } from "./mapping-form";
import { VerifyCatalogLinks } from "./verify-catalog-links";

const EMPTY: BrowserCatalogData = { accounts: [], items: [], error: null };

function statusLabel(status: string): string {
	if (status === "active") return "Verificado";
	if (status === "inactive") return "Inativo";
	return "Aguardando conferência";
}

function dateLabel(value: string | null): string {
	if (!value) return "Não verificado";
	const date = new Date(value);
	return Number.isNaN(date.valueOf())
		? "Não verificado"
		: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function errorText(error: string | null): string {
	if (error === "not_authorized")
		return "Esta conta não pode configurar o catálogo";
	if (error === "not_authenticated")
		return "Entre novamente para abrir o Catálogo Meta";
	return "Configuração do Catálogo Meta ainda indisponível";
}

export function CatalogBrowserWorkspace() {
	const [catalog, setCatalog] = useState<BrowserCatalogData>(EMPTY);
	const [products, setProducts] = useState<BrowserCatalogProduct[]>([]);
	const [productsError, setProductsError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [productQuery, setProductQuery] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams(window.location.search);
		const nextQuery = (params.get("q") ?? "").trim().slice(0, 100);
		const nextProductQuery = (params.get("product_q") ?? "")
			.trim()
			.slice(0, 100);
		setQuery(nextQuery);
		setProductQuery(nextProductQuery);
		setLoading(true);
		void Promise.all([
			loadBrowserCatalog({ query: nextQuery }),
			loadBrowserCatalogProducts(nextProductQuery),
		]).then(([nextCatalog, nextProducts]) => {
			if (cancelled) return;
			setCatalog(nextCatalog);
			setProducts(nextProducts.items);
			setProductsError(nextProducts.error);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	function submitSearch(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const next = new URL(window.location.href);
		for (const name of ["q", "product_q"]) {
			const value = String(data.get(name) ?? "")
				.trim()
				.slice(0, 100);
			if (value) next.searchParams.set(name, value);
			else next.searchParams.delete(name);
		}
		window.location.assign(`${next.pathname}${next.search}`);
	}

	return (
		<div className="page-stack meta-catalog-page" id="meta-catalog-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">PRODUTOS</p>
					<h1>Catálogo do WhatsApp</h1>
					<p className="page-description">
						Relacione os IDs exatos do catálogo Meta aos produtos usados no
						Admin.
					</p>
				</div>
				<Link className="catalog-clear" href="/produtos">
					<ArrowLeft aria-hidden="true" size={15} /> Voltar aos produtos
				</Link>
			</div>
			<section className="meta-catalog-note" role="note">
				<AlertCircle aria-hidden="true" size={19} />
				<p>
					O preço enviado no carrinho da Meta não define o pedido. Um vínculo só
					será usado depois da conferência do catálogo e do produto
					correspondente.
				</p>
			</section>
			<form className="catalog-filter-card" onSubmit={submitSearch}>
				<label className="catalog-search-field">
					<span>Localizar produto do Admin</span>
					<span className="catalog-search-input">
						<input
							defaultValue={productQuery}
							maxLength={100}
							name="product_q"
							placeholder="Nome ou SKU"
							type="search"
						/>
					</span>
				</label>
				<button className="catalog-submit" type="submit">
					Buscar produto
				</button>
				{productQuery && (
					<a
						className="catalog-clear"
						href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/produtos/catalogo/`}
					>
						Limpar busca
					</a>
				)}
			</form>
			{catalog.error ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>{errorText(catalog.error)}</strong>
						<p>
							{catalog.error === "not_authorized"
								? "Peça à pessoa responsável para revisar seu perfil de acesso."
								: "Tente novamente em alguns instantes."}
						</p>
					</div>
				</section>
			) : (
				<>
					{productsError ? (
						<section className="catalog-message" role="status">
							<AlertCircle aria-hidden="true" size={20} />
							<div>
								<strong>
									{productsError === "not_authorized"
										? "Sem acesso à lista de produtos"
										: "Não foi possível buscar os produtos"}
								</strong>
								<p>Confira a conexão do catálogo e tente novamente.</p>
							</div>
						</section>
					) : (
						<CatalogMappingForm
							accounts={catalog.accounts}
							onSaved={() => window.location.reload()}
							products={products}
						/>
					)}
					<section
						aria-label="Vínculos do Catálogo Meta"
						className="catalog-list-card"
					>
						<div className="meta-catalog-list-heading">
							<div>
								<h2>Vínculos cadastrados</h2>
								<p>Flow e carrinhos nativos usam este cadastro por número.</p>
							</div>
							<form onSubmit={submitSearch}>
								<label className="customer-field">
									<span>Buscar vínculos</span>
									<input
										defaultValue={query}
										maxLength={100}
										name="q"
										placeholder="Catálogo, ID Meta ou produto"
										type="search"
									/>
								</label>
								<input name="product_q" type="hidden" value={productQuery} />
								<button className="catalog-submit" type="submit">
									Buscar
								</button>
							</form>
						</div>
						<VerifyCatalogLinks mappings={catalog.items} />
						{loading ? (
							<p className="catalog-empty">Carregando vínculos…</p>
						) : catalog.items.length === 0 ? (
							<div className="catalog-empty">
								<span className="catalog-empty-icon">
									<Plus aria-hidden="true" size={20} />
								</span>
								<strong>
									{query
										? "Nenhum vínculo encontrado"
										: "Nenhum vínculo cadastrado"}
								</strong>
								<p>
									{query
										? "Confira o texto da busca e tente novamente."
										: "Os produtos entram em revisão até a Meta confirmar a correspondência."}
								</p>
							</div>
						) : (
							<div className="catalog-table-wrap">
								<table className="catalog-table meta-catalog-table">
									<thead>
										<tr>
											<th scope="col">Número</th>
											<th scope="col">Catálogo Meta</th>
											<th scope="col">ID do produto Meta</th>
											<th scope="col">Produto do Admin</th>
											<th scope="col">Conferência</th>
											<th scope="col">Ação</th>
										</tr>
									</thead>
									<tbody>
										{catalog.items.map((item) => (
											<tr key={item.id}>
												<td>
													{item.accountName}
													{item.accountPhone && (
														<small>{item.accountPhone}</small>
													)}
												</td>
												<td>{item.catalogId}</td>
												<td>{item.retailerId}</td>
												<td>
													<strong>{item.productName}</strong>
													{item.productSku && (
														<small>SKU {item.productSku}</small>
													)}
													{!item.productEligible && (
														<small>Produto indisponível no WhatsApp</small>
													)}
												</td>
												<td>
													<span
														className={`catalog-status-pill${item.status === "active" ? " catalog-status-pill--active" : ""}`}
													>
														{statusLabel(item.status)}
													</span>
													<small>{dateLabel(item.verifiedAt)}</small>
												</td>
												<td>
													<Link
														className="meta-catalog-edit-link"
														href={`/produtos/catalogo/detalhe?id=${encodeURIComponent(item.id)}`}
													>
														<Link2 aria-hidden="true" size={14} /> Corrigir
													</Link>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>
				</>
			)}
		</div>
	);
}

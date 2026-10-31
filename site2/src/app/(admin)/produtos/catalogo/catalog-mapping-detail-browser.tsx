"use client";

import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
	type BrowserCatalogData,
	type BrowserCatalogMapping,
	type BrowserCatalogProduct,
	loadBrowserCatalog,
	loadBrowserCatalogProducts,
} from "@/lib/supabase/browser-admin-catalog";
import { CatalogMappingForm } from "./mapping-form";

const EMPTY: BrowserCatalogData = { accounts: [], items: [], error: null };

export function CatalogMappingDetailBrowser() {
	const [catalog, setCatalog] = useState<BrowserCatalogData>(EMPTY);
	const [products, setProducts] = useState<BrowserCatalogProduct[]>([]);
	const [productsError, setProductsError] = useState<string | null>(null);
	const [productQuery, setProductQuery] = useState("");
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const params = new URLSearchParams(window.location.search);
		const id = params.get("id") ?? "";
		const nextProductQuery = (params.get("product_q") ?? "")
			.trim()
			.slice(0, 100);
		setProductQuery(nextProductQuery);
		if (!id) {
			setCatalog({ ...EMPTY, error: "not_found" });
			setLoading(false);
			return () => {
				cancelled = true;
			};
		}
		setLoading(true);
		void Promise.all([
			loadBrowserCatalog({ query: "", linkId: id }),
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

	function searchProducts(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const id = new URLSearchParams(window.location.search).get("id") ?? "";
		const query = String(data.get("product_q") ?? "")
			.trim()
			.slice(0, 100);
		const params = new URLSearchParams({ id });
		if (query) params.set("product_q", query);
		window.location.assign(`${window.location.pathname}?${params.toString()}`);
	}

	const mapping: BrowserCatalogMapping | undefined = catalog.items[0];
	return (
		<div className="page-stack meta-catalog-page" id="meta-catalog-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">CATÁLOGO META</p>
					<h1>Corrigir vínculo</h1>
					<p className="page-description">
						A alteração remove a conferência anterior e volta o vínculo para
						revisão.
					</p>
				</div>
				<Link className="catalog-clear" href="/produtos/catalogo">
					<ArrowLeft aria-hidden="true" size={15} /> Voltar ao catálogo
				</Link>
			</div>
			{loading ? (
				<p className="catalog-empty">Carregando vínculo…</p>
			) : catalog.error || !mapping ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{catalog.error === "not_authorized"
								? "Esta conta não pode editar este vínculo"
								: catalog.error === "not_authenticated"
									? "Entre novamente para corrigir o vínculo"
									: catalog.error
										? "Não foi possível carregar o vínculo"
										: "Vínculo não encontrado"}
						</strong>
						<p>Volte ao Catálogo Meta e tente abrir o vínculo novamente.</p>
					</div>
				</section>
			) : (
				<>
					<form className="catalog-filter-card" onSubmit={searchProducts}>
						<label className="catalog-search-field">
							<span>Buscar produto ativo</span>
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
					</form>
					{productsError && (
						<section className="catalog-message" role="status">
							<AlertCircle aria-hidden="true" size={20} />
							<div>
								<strong>Não foi possível buscar outros produtos</strong>
								<p>O vínculo atual continua disponível para conferência.</p>
							</div>
						</section>
					)}
					<CatalogMappingForm
						accounts={catalog.accounts}
						mapping={mapping}
						onSaved={() => window.location.reload()}
						products={products}
					/>
				</>
			)}
		</div>
	);
}

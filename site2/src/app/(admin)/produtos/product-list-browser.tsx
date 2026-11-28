"use client";

import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	Link2,
	Package,
	Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const PAGE_SIZE = 50;

type Product = {
	id: string;
	name: string;
	sku: string | null;
	category: string | null;
	active: boolean;
	priceCents: number | null;
	stockQuantity: number | null;
	unit: string | null;
	imageUrl: string | null;
};

type ProductPage = {
	products: Product[];
	nextOffset: number | null;
	error:
		| "not_configured"
		| "not_authenticated"
		| "not_authorized"
		| "unavailable"
		| null;
};

function one(value: string | null): string {
	return value ?? "";
}

function pageHref(query: string, active: string, offset: number): string {
	const params = new URLSearchParams();
	if (query) params.set("q", query);
	if (active) params.set("active", active);
	if (offset > 0) params.set("offset", String(offset));
	const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
	const suffix = params.toString();
	return `${basePath}/produtos${suffix ? `?${suffix}` : ""}`;
}

function safeProduct(value: unknown): Product | null {
	if (!value || typeof value !== "object") return null;
	const row = value as Record<string, unknown>;
	if (typeof row.id !== "string" || typeof row.name !== "string") return null;
	let imageUrl: string | null = null;
	if (typeof row.image_url === "string" && row.image_url.length <= 2048) {
		try {
			const url = new URL(row.image_url);
			if (url.protocol === "https:") imageUrl = url.toString();
		} catch {
			imageUrl = null;
		}
	}
	return {
		id: row.id,
		name: row.name.slice(0, 180),
		sku: typeof row.sku === "string" ? row.sku.slice(0, 80) : null,
		category:
			typeof row.category === "string" ? row.category.slice(0, 100) : null,
		active: row.active === true,
		priceCents:
			typeof row.sale_price_cents === "number" ? row.sale_price_cents : null,
		stockQuantity:
			typeof row.stock_quantity === "number" ? row.stock_quantity : null,
		unit: typeof row.packaging === "string" ? row.packaging.slice(0, 30) : null,
		imageUrl,
	};
}

async function loadProducts(): Promise<{
	result: ProductPage;
	query: string;
	active: string;
	offset: number;
}> {
	const params = new URLSearchParams(window.location.search);
	const query = one(params.get("q")).trim().slice(0, 100);
	const selectedActive = one(params.get("active"));
	const active =
		selectedActive === "true" || selectedActive === "false"
			? selectedActive
			: "";
	const parsedOffset = Number.parseInt(one(params.get("offset")), 10);
	const offset = Number.isFinite(parsedOffset)
		? Math.max(
				0,
				Math.min(100_000, Math.floor(parsedOffset / PAGE_SIZE) * PAGE_SIZE),
			)
		: 0;
	if (!supabaseUrl || !supabasePublishableKey) {
		return {
			result: { products: [], nextOffset: null, error: "not_configured" },
			query,
			active,
			offset,
		};
	}
	let token: string | undefined;
	try {
		const { data, error } = await createClient().auth.getSession();
		if (error || !data.session?.access_token) {
			return {
				result: { products: [], nextOffset: null, error: "not_authenticated" },
				query,
				active,
				offset,
			};
		}
		token = data.session.access_token;
	} catch {
		return {
			result: { products: [], nextOffset: null, error: "not_configured" },
			query,
			active,
			offset,
		};
	}
	const endpoint = new URL(
		"/functions/v1/admin-products-browser-v1",
		supabaseUrl,
	);
	endpoint.searchParams.set("offset", String(offset));
	if (query) endpoint.searchParams.set("q", query);
	if (active) endpoint.searchParams.set("active", active);
	try {
		const response = await fetch(endpoint, {
			method: "GET",
			headers: {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				Accept: "application/json",
			},
			cache: "no-store",
		});
		if (response.status === 401 || response.status === 403) {
			return {
				result: { products: [], nextOffset: null, error: "not_authorized" },
				query,
				active,
				offset,
			};
		}
		if (!response.ok) throw new Error("catalog_unavailable");
		const payload = (await response.json()) as {
			products?: unknown;
			next_offset?: unknown;
		};
		if (!Array.isArray(payload.products)) throw new Error("catalog_invalid");
		return {
			result: {
				products: payload.products
					.map(safeProduct)
					.filter((product): product is Product => product !== null),
				nextOffset:
					typeof payload.next_offset === "number" &&
					Number.isFinite(payload.next_offset)
						? payload.next_offset
						: null,
				error: null,
			},
			query,
			active,
			offset,
		};
	} catch {
		return {
			result: { products: [], nextOffset: null, error: "unavailable" },
			query,
			active,
			offset,
		};
	}
}

export function ProductListBrowser() {
	const [result, setResult] = useState<ProductPage>({
		products: [],
		nextOffset: null,
		error: null,
	});
	const [query, setQuery] = useState("");
	const [active, setActive] = useState("");
	const [offset, setOffset] = useState(0);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		void loadProducts().then((loaded) => {
			if (cancelled) return;
			setResult(loaded.result);
			setQuery(loaded.query);
			setActive(loaded.active);
			setOffset(loaded.offset);
			setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	const first = result.products.length ? offset + 1 : 0;
	const last = offset + result.products.length;
	const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const next = new URL(window.location.href);
		const q = String(form.get("q") ?? "")
			.trim()
			.slice(0, 100);
		const status = String(form.get("active") ?? "");
		q ? next.searchParams.set("q", q) : next.searchParams.delete("q");
		status
			? next.searchParams.set("active", status)
			: next.searchParams.delete("active");
		next.searchParams.delete("offset");
		window.location.assign(`${next.pathname}${next.search}`);
	};
	return (
		<div className="page-stack">
			<div className="page-heading">
				<div>
					<p className="eyebrow">CATÁLOGO</p>
					<h1>Produtos</h1>
					<p className="page-description">
						Consulte o cadastro de produtos usado pela loja e pelos canais de
						venda.
					</p>
				</div>
				<Link className="meta-catalog-action" href="/produtos/catalogo">
					<Link2 aria-hidden="true" size={15} /> Catálogo Meta
				</Link>
			</div>
			{result.error ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{result.error === "not_configured"
								? "Conexão do Admin ainda não configurada"
								: result.error === "not_authenticated"
									? "Entre novamente para consultar o catálogo"
									: result.error === "not_authorized"
										? "Esta conta não tem acesso ao catálogo"
										: "Não foi possível carregar os produtos"}
						</strong>
						<p>
							{result.error === "not_configured"
								? "Configure a URL e a chave publicável do Supabase da loja no ambiente do Admin."
								: result.error === "not_authorized"
									? "Acesso aos dados é validado pelo gateway seguro do Admin. Peça à pessoa responsável para revisar seu perfil."
									: "Tente novamente em alguns instantes. Nenhuma alteração foi feita nos produtos."}
						</p>
						{result.error === "unavailable" && (
							<button
								className="catalog-retry"
								onClick={() => window.location.reload()}
								type="button"
							>
								Tentar novamente
							</button>
						)}
					</div>
				</section>
			) : (
				<>
					<form className="catalog-filter-card" onSubmit={submitSearch}>
						<label className="catalog-search-field">
							<span>Buscar produto</span>
							<span className="catalog-search-input">
								<Search aria-hidden="true" size={17} />
								<input
									defaultValue={query}
									maxLength={100}
									name="q"
									placeholder="Nome ou SKU"
									type="search"
								/>
							</span>
						</label>
						<label className="catalog-status-field">
							<span>Situação</span>
							<select defaultValue={active} name="active">
								<option value="">Todos os produtos</option>
								<option value="true">Ativos</option>
								<option value="false">Inativos</option>
							</select>
						</label>
						<button className="catalog-submit" type="submit">
							Buscar produtos
						</button>
						{(query || active) && (
							<a className="catalog-clear" href={pageHref("", "", 0)}>
								Limpar filtros
							</a>
						)}
					</form>
					<section aria-label="Lista de produtos" className="catalog-list-card">
						{loading ? (
							<p className="catalog-empty">Carregando produtos…</p>
						) : result.products.length === 0 ? (
							<div className="catalog-empty">
								<span aria-hidden="true" className="catalog-empty-icon">
									<Package size={21} />
								</span>
								<strong>
									{query || active
										? "Nenhum produto encontrado"
										: "O catálogo está vazio"}
								</strong>
								<p>
									{query || active
										? "Altere a busca ou a situação e tente novamente."
										: "Os produtos aparecerão aqui quando o cadastro estiver disponível."}
								</p>
							</div>
						) : (
							<div className="catalog-table-wrap">
								<table className="catalog-table">
									<thead>
										<tr>
											<th scope="col">Produto</th>
											<th scope="col">Preço</th>
											<th scope="col">Estoque</th>
											<th scope="col">Situação</th>
										</tr>
									</thead>
									<tbody>
										{result.products.map((product) => (
											<tr key={product.id}>
												<td>
													<div className="catalog-product-cell">
														{product.imageUrl ? (
															// biome-ignore lint/performance/noImgElement: Product thumbnails use canonical HTTPS URLs and are intentionally loaded by the browser.
															<img
																alt=""
																className="catalog-product-thumb"
																loading="lazy"
																src={product.imageUrl}
															/>
														) : (
															<span
																aria-hidden="true"
																className="catalog-product-thumb catalog-product-thumb--empty"
															>
																<Package size={17} />
															</span>
														)}
														<span className="catalog-product-copy">
															<strong>
																<Link
																	href={`/produtos/detalhe?id=${encodeURIComponent(product.id)}`}
																>
																	{product.name}
																</Link>
															</strong>
															<span>
																{product.sku ? `SKU ${product.sku}` : "Sem SKU"}
																{product.category
																	? ` · ${product.category}`
																	: ""}
															</span>
														</span>
													</div>
												</td>
												<td>
													{product.priceCents == null
														? "—"
														: money.format(product.priceCents / 100)}
												</td>
												<td>
													{product.stockQuantity == null
														? "—"
														: `${product.stockQuantity.toLocaleString("pt-BR")} ${product.unit ?? "un"}`}
												</td>
												<td>
													<span
														className={`catalog-status-pill${product.active ? " catalog-status-pill--active" : ""}`}
													>
														{product.active ? "Ativo" : "Inativo"}
													</span>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
						<div className="catalog-pagination">
							<span>
								{loading
									? "Consultando catálogo…"
									: first
										? `${first}–${last} produtos`
										: "0 produtos"}
							</span>
							<div>
								{offset > 0 && (
									<a
										aria-label="Página anterior"
										href={pageHref(
											query,
											active,
											Math.max(0, offset - PAGE_SIZE),
										)}
									>
										<ChevronLeft size={17} />
									</a>
								)}
								{result.nextOffset != null && result.products.length > 0 && (
									<a
										aria-label="Próxima página"
										href={pageHref(query, active, result.nextOffset)}
									>
										<ChevronRight size={17} />
									</a>
								)}
							</div>
						</div>
					</section>
				</>
			)}
		</div>
	);
}

import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	Link2,
	Package,
	Search,
} from "lucide-react";
import Link from "next/link";
import { getAdminProducts } from "@/lib/supabase/admin-products";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const PAGE_SIZE = 50;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pageHref(query: string, active: string, offset: number): string {
	const params = new URLSearchParams();
	if (query) params.set("q", query);
	if (active) params.set("active", active);
	if (offset > 0) params.set("offset", String(offset));
	const suffix = params.toString();
	return suffix ? `/produtos?${suffix}` : "/produtos";
}

export default async function ProdutosPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const query = one(params.q).trim().slice(0, 100);
	const selectedActive = one(params.active);
	const active =
		selectedActive === "true" || selectedActive === "false"
			? selectedActive
			: "";
	const parsedOffset = Number.parseInt(one(params.offset), 10);
	const offset = Number.isFinite(parsedOffset)
		? Math.max(
				0,
				Math.min(100_000, Math.floor(parsedOffset / PAGE_SIZE) * PAGE_SIZE),
			)
		: 0;
	const result = await getAdminProducts({ query, active, offset });
	const first = result.products.length ? offset + 1 : 0;
	const last = offset + result.products.length;

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
							<Link
								className="catalog-retry"
								href={pageHref(query, active, offset)}
							>
								Tentar novamente
							</Link>
						)}
					</div>
				</section>
			) : (
				<>
					<form action="/produtos" className="catalog-filter-card" method="get">
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
							<Link className="catalog-clear" href="/produtos">
								Limpar filtros
							</Link>
						)}
					</form>

					<section aria-label="Lista de produtos" className="catalog-list-card">
						{result.products.length === 0 ? (
							<div className="catalog-empty">
								<span className="catalog-empty-icon">
									<Package aria-hidden="true" size={21} />
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
															// biome-ignore lint/performance/noImgElement: Tiny runtime catalog thumbnails use gateway-provided URLs and should not trigger server image optimization.
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
																	href={`/produtos/${encodeURIComponent(product.id)}`}
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
							<span>{first ? `${first}–${last} produtos` : "0 produtos"}</span>
							<div>
								{offset > 0 && (
									<Link
										aria-label="Página anterior"
										href={pageHref(
											query,
											active,
											Math.max(0, offset - PAGE_SIZE),
										)}
									>
										<ChevronLeft size={17} />
									</Link>
								)}
								{result.nextOffset != null && result.products.length > 0 && (
									<Link
										aria-label="Próxima página"
										href={pageHref(query, active, result.nextOffset)}
									>
										<ChevronRight size={17} />
									</Link>
								)}
							</div>
						</div>
					</section>
				</>
			)}
		</div>
	);
}

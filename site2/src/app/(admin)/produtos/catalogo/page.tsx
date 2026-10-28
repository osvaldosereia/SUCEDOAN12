import { AlertCircle, ArrowLeft, Link2, Plus } from "lucide-react";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { getAdminCatalogMappings } from "@/lib/supabase/admin-catalog-mappings";
import { getAdminProducts } from "@/lib/supabase/admin-products";
import { CatalogMappingForm } from "./mapping-form";
import { VerifyCatalogLinks } from "./verify-catalog-links";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

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

export default async function CatalogoMetaPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	await requireAdminSession();
	const params = await searchParams;
	const query = one(params.q).trim().slice(0, 100);
	const productQuery = one(params.product_q).trim().slice(0, 100);
	const [mappings, products] = await Promise.all([
		getAdminCatalogMappings({ query }),
		getAdminProducts({ query: productQuery, active: "true", offset: 0 }),
	]);

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

			<form
				action="/produtos/catalogo"
				className="catalog-filter-card"
				method="get"
			>
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
					<Link className="catalog-clear" href="/produtos/catalogo">
						Limpar busca
					</Link>
				)}
			</form>

			{mappings.error ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{mappings.error === "not_authorized"
								? "Esta conta não pode configurar o catálogo"
								: "Configuração do Catálogo Meta ainda indisponível"}
						</strong>
						<p>
							{mappings.error === "not_authorized"
								? "Peça à pessoa responsável para revisar seu perfil de acesso."
								: "A estrutura local está preparada, mas depende de a migration do projeto canônico ser revisada e aplicada."}
						</p>
					</div>
				</section>
			) : (
				<>
					{products.error ? (
						<section className="catalog-message" role="status">
							<AlertCircle aria-hidden="true" size={20} />
							<div>
								<strong>
									{products.error === "not_authorized"
										? "Sem acesso à lista de produtos"
										: "Não foi possível buscar os produtos"}
								</strong>
								<p>Confira a conexão do catálogo e tente novamente.</p>
							</div>
						</section>
					) : (
						<CatalogMappingForm
							accounts={mappings.accounts}
							products={products.products}
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
							<form action="/produtos/catalogo" method="get">
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
								<button className="catalog-submit" type="submit">
									Buscar
								</button>
							</form>
						</div>
						<VerifyCatalogLinks mappings={mappings.items} />
						{mappings.items.length === 0 ? (
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
										{mappings.items.map((item) => (
											<tr key={item.id}>
												<td>
													{item.accountName}
													{item.accountPhone ? (
														<small>{item.accountPhone}</small>
													) : null}
												</td>
												<td>{item.catalogId}</td>
												<td>{item.retailerId}</td>
												<td>
													<strong>{item.productName}</strong>
													{item.productSku ? (
														<small>SKU {item.productSku}</small>
													) : null}
													{!item.productEligible ? (
														<small>Produto indisponível no WhatsApp</small>
													) : null}
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
														href={`/produtos/catalogo/${encodeURIComponent(item.id)}`}
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

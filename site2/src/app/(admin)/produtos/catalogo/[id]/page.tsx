import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { getAdminCatalogMappings } from "@/lib/supabase/admin-catalog-mappings";
import { getAdminProducts } from "@/lib/supabase/admin-products";
import { CatalogMappingForm } from "../mapping-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditCatalogMappingPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: SearchParams;
}) {
	await requireAdminSession();
	const [{ id }, search] = await Promise.all([params, searchParams]);
	const productQuery = one(search.product_q).trim().slice(0, 100);
	const [result, productResult] = await Promise.all([
		UUID.test(id)
			? getAdminCatalogMappings({ linkId: id })
			: Promise.resolve(null),
		getAdminProducts({ query: productQuery, active: "true", offset: 0 }),
	]);
	const mapping = result?.items[0] ?? null;

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

			{!result || result.error || !mapping ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{result?.error === "not_authorized"
								? "Esta conta não pode editar este vínculo"
								: result?.error
									? "Não foi possível carregar o vínculo"
									: "Vínculo não encontrado"}
						</strong>
						<p>Volte ao Catálogo Meta e tente abrir o vínculo novamente.</p>
					</div>
				</section>
			) : (
				<>
					<form
						action={`/produtos/catalogo/${encodeURIComponent(id)}`}
						className="catalog-filter-card"
						method="get"
					>
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
					{productResult.error ? (
						<section className="catalog-message" role="status">
							<AlertCircle aria-hidden="true" size={20} />
							<div>
								<strong>Não foi possível buscar outros produtos</strong>
								<p>O vínculo atual continua disponível para conferência.</p>
							</div>
						</section>
					) : null}
					<CatalogMappingForm
						accounts={result.accounts}
						mapping={mapping}
						products={productResult.products}
					/>
				</>
			)}
		</div>
	);
}

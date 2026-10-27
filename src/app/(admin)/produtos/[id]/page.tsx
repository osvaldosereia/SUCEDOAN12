import { AlertCircle, ArrowLeft, ImageOff } from "lucide-react";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { getAdminProductDetail } from "@/lib/supabase/admin-products";
import { ProductEditor } from "./product-editor";
import { ProductImageEditor } from "./product-image-editor";
import { ProductWhatsappAvailability } from "./product-whatsapp-availability";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function date(value: string | null): string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Não informada";
	const [year, month, day] = value.split("-");
	return `${day}/${month}/${year}`;
}

export default async function ProdutoDetalhePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	await requireAdminSession();
	const { id } = await params;
	const result = UUID.test(id)
		? await getAdminProductDetail(id)
		: { product: null, error: "not_found" as const };
	const product = result.product;

	return (
		<div className="page-stack">
			<div className="page-heading">
				<div>
					<p className="eyebrow">CATÁLOGO</p>
					<h1>{product?.name ?? "Produto"}</h1>
					<p className="page-description">
						Consulte o cadastro e mantenha preço, disponibilidade e foto do
						produto.
					</p>
				</div>
				<Link className="catalog-clear" href="/produtos">
					<ArrowLeft aria-hidden="true" size={15} /> Voltar aos produtos
				</Link>
			</div>

			{!product ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{result.error === "not_found"
								? "Produto não encontrado"
								: result.error === "not_authorized"
									? "Esta conta não tem acesso a este produto"
									: "Não foi possível abrir o produto"}
						</strong>
						<p>Volte à lista de produtos e tente abrir o cadastro novamente.</p>
					</div>
				</section>
			) : (
				<>
					<section
						aria-label="Imagem do produto"
						className="product-detail-card"
					>
						<div className="product-detail-image">
							{product.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: Product images come from the authorized catalog gateway.
								<img alt={product.name} src={product.imageUrl} />
							) : (
								<div className="product-detail-no-image">
									<ImageOff aria-hidden="true" size={28} />
									<span>Sem foto cadastrada</span>
								</div>
							)}
						</div>
						<div className="product-detail-copy">
							<div className="customer-card-heading">
								<div>
									<h2>Dados do produto</h2>
									<p>
										{product.sku ? `SKU ${product.sku}` : "Sem SKU"}
										{product.category ? ` · ${product.category}` : ""}
									</p>
								</div>
								<span
									className={`catalog-status-pill${product.active ? " catalog-status-pill--active" : ""}`}
								>
									{product.active ? "Ativo" : "Inativo"}
								</span>
							</div>
							<p className="product-detail-description">
								{product.description || "Sem descrição cadastrada."}
							</p>
							<dl className="product-detail-grid">
								<div>
									<dt>Preço de venda</dt>
									<dd>
										{product.priceCents == null
											? "Não informado"
											: money.format(product.priceCents / 100)}
									</dd>
								</div>
								<div>
									<dt>Estoque</dt>
									<dd>
										{product.stockQuantity == null
											? "Não informado"
											: `${product.stockQuantity.toLocaleString("pt-BR")} ${product.unit ?? "un"}`}
									</dd>
								</div>
								<div>
									<dt>EAN</dt>
									<dd>{product.gtin ?? "Não informado"}</dd>
								</div>
								<div>
									<dt>Validade</dt>
									<dd>{date(product.expirationDate)}</dd>
								</div>
							</dl>
						</div>
					</section>

					<ProductImageEditor
						hasImage={Boolean(product.imageUrl)}
						productId={product.id}
					/>

					<ProductEditor
						active={product.active}
						priceCents={product.priceCents}
						productId={product.id}
					/>

					<ProductWhatsappAvailability
						productId={product.id}
						whatsappActive={product.whatsappActive}
					/>
				</>
			)}
		</div>
	);
}

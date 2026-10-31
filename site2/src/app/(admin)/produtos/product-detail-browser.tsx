"use client";

import { AlertCircle, ArrowLeft, ImageOff, ImagePlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

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
	description: string;
	gtin: string | null;
	whatsappActive: boolean;
	expirationDate: string | null;
};

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function priceText(value: string): number | null {
	const match = value.trim().match(/^(\d{1,12})(?:[,.](\d{1,2}))?$/);
	if (!match) return null;
	const cents =
		Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
	return Number.isSafeInteger(cents) ? cents : null;
}

function imageSignature(file: File, bytes: Uint8Array): boolean {
	if (file.type === "image/jpeg")
		return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	if (file.type === "image/png")
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	return (
		file.type === "image/webp" &&
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
	);
}

function apiError(code: unknown): string {
	const messages: Record<string, string> = {
		not_authenticated: "Sua sessão expirou. Entre novamente.",
		not_authorized: "Esta conta não tem permissão para editar produtos.",
		conflict:
			"Outra pessoa alterou este produto. Atualize a ficha e tente novamente.",
		product_inactive: "Ative o produto antes de habilitá-lo no WhatsApp.",
		flow_name_invalid: "Ajuste o nome do produto antes de habilitá-lo no Flow.",
		flow_image_invalid: "Cadastre uma foto HTTPS antes de habilitá-lo no Flow.",
		flow_price_invalid: "Corrija o preço antes de habilitá-lo no Flow.",
		invalid_input: "Confira os dados e tente novamente.",
	};
	return typeof code === "string"
		? (messages[code] ??
				"Não foi possível concluir agora. Atualize o produto antes de tentar novamente.")
		: "Não foi possível concluir agora. Atualize o produto antes de tentar novamente.";
}

export function ProductDetailBrowser() {
	const [product, setProduct] = useState<Product | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [whatsappSaving, setWhatsappSaving] = useState(false);
	const [imageSaving, setImageSaving] = useState(false);
	const [notice, setNotice] = useState("");

	useEffect(() => {
		const id = new URLSearchParams(window.location.search).get("id") ?? "";
		if (!UUID.test(id) || !supabaseUrl || !supabasePublishableKey) {
			setError("not_found");
			setLoading(false);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const session = await createClient().auth.getSession();
				const token = session.data.session?.access_token;
				if (session.error || !token) throw new Error("not_authenticated");
				const endpoint = new URL(
					"/functions/v1/admin-products-browser-v1",
					supabaseUrl,
				);
				endpoint.searchParams.set("action", "detail");
				endpoint.searchParams.set("id", id);
				const response = await fetch(endpoint, {
					headers: {
						apikey: supabasePublishableKey,
						Authorization: `Bearer ${token}`,
						Accept: "application/json",
					},
					cache: "no-store",
				});
				const payload = (await response.json().catch(() => null)) as {
					product?: Record<string, unknown>;
					error?: string;
				} | null;
				if (!response.ok || !payload?.product)
					throw new Error(
						response.status === 404
							? "not_found"
							: (payload?.error ?? "unavailable"),
					);
				const row = payload.product;
				const imageUrl =
					typeof row.image_url === "string" &&
					row.image_url.startsWith("https://")
						? row.image_url
						: null;
				if (!cancelled)
					setProduct({
						id: String(row.id),
						name: String(row.name ?? "Produto"),
						sku: typeof row.sku === "string" ? row.sku : null,
						category: typeof row.category === "string" ? row.category : null,
						active: row.active === true,
						priceCents:
							typeof row.sale_price_cents === "number"
								? row.sale_price_cents
								: null,
						stockQuantity:
							typeof row.stock_quantity === "number"
								? row.stock_quantity
								: null,
						unit: typeof row.packaging === "string" ? row.packaging : null,
						imageUrl,
						description:
							typeof row.description === "string" ? row.description : "",
						gtin: typeof row.gtin === "string" ? row.gtin : null,
						whatsappActive: row.is_whatsapp_active === true,
						expirationDate:
							typeof row.expiration_date === "string"
								? row.expiration_date
								: null,
					});
			} catch (cause) {
				if (!cancelled)
					setError(cause instanceof Error ? cause.message : "unavailable");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const saveProduct = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!product || !supabaseUrl || !supabasePublishableKey) return;
		const form = new FormData(event.currentTarget);
		const priceCents = priceText(String(form.get("salePrice") ?? ""));
		if (priceCents === null) {
			setNotice("Informe um preço válido, com até duas casas decimais.");
			return;
		}
		setSaving(true);
		setNotice("");
		try {
			const session = await createClient().auth.getSession();
			const token = session.data.session?.access_token;
			if (session.error || !token) throw new Error("not_authenticated");
			const response = await fetch(
				new URL("/functions/v1/admin-products-browser-v1", supabaseUrl),
				{
					method: "POST",
					headers: {
						apikey: supabasePublishableKey,
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify({
						action: "quick_save",
						product_id: product.id,
						sale_price_cents: priceCents,
						active: form.get("active") === "true",
						expected_price_cents: product.priceCents,
						expected_active: product.active,
					}),
				},
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				ok?: boolean;
			} | null;
			if (!response.ok || payload?.ok !== true)
				throw new Error(payload?.error ?? "unavailable");
			setNotice("Produto atualizado.");
			window.location.reload();
		} catch (cause) {
			setNotice(
				apiError(cause instanceof Error ? cause.message : "unavailable"),
			);
		} finally {
			setSaving(false);
		}
	};

	const toggleWhatsapp = async () => {
		if (!product || !supabaseUrl || !supabasePublishableKey) return;
		setWhatsappSaving(true);
		setNotice("");
		try {
			const session = await createClient().auth.getSession();
			const token = session.data.session?.access_token;
			if (session.error || !token) throw new Error("not_authenticated");
			const response = await fetch(
				new URL(
					"/functions/v1/admin-product-whatsapp-availability-v1",
					supabaseUrl,
				),
				{
					method: "POST",
					headers: {
						apikey: supabasePublishableKey,
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: JSON.stringify({
						product_id: product.id,
						expected_whatsapp_active: product.whatsappActive,
						whatsapp_active: !product.whatsappActive,
					}),
				},
			);
			const payload = (await response.json().catch(() => null)) as {
				error?: string;
				whatsapp_active?: boolean;
				ok?: boolean;
			} | null;
			if (
				!response.ok ||
				payload?.ok !== true ||
				typeof payload.whatsapp_active !== "boolean"
			)
				throw new Error(payload?.error ?? "unavailable");
			setProduct({ ...product, whatsappActive: payload.whatsapp_active });
			setNotice(
				payload.whatsapp_active
					? "Produto habilitado para novas opções de Flow."
					: "Produto desabilitado para novas opções de Flow.",
			);
		} catch (cause) {
			setNotice(
				apiError(cause instanceof Error ? cause.message : "unavailable"),
			);
		} finally {
			setWhatsappSaving(false);
		}
	};

	const saveImage = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!product || !supabaseUrl || !supabasePublishableKey) return;
		const form = new FormData(event.currentTarget);
		const file = form.get("image");
		if (
			!(file instanceof File) ||
			file.size === 0 ||
			file.size > 500_000 ||
			!["image/jpeg", "image/png", "image/webp"].includes(file.type)
		) {
			setNotice("Escolha uma imagem JPG, PNG ou WebP com até 500 KB.");
			return;
		}
		if (
			!imageSignature(
				file,
				new Uint8Array(await file.slice(0, 12).arrayBuffer()),
			)
		) {
			setNotice("O arquivo não corresponde ao tipo de imagem informado.");
			return;
		}
		setImageSaving(true);
		setNotice("");
		try {
			const session = await createClient().auth.getSession();
			const token = session.data.session?.access_token;
			if (session.error || !token) throw new Error("not_authenticated");
			const gateway = new URL(
				"/functions/v1/admin-product-image-v1",
				supabaseUrl,
			);
			gateway.searchParams.set("action", "prepare");
			const headers = {
				apikey: supabasePublishableKey,
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			};
			const preparedResponse = await fetch(gateway, {
				method: "POST",
				headers,
				body: JSON.stringify({ product_id: product.id, mime_type: file.type }),
			});
			const prepared = (await preparedResponse.json().catch(() => null)) as {
				ok?: boolean;
				error?: string;
				path?: string;
				token?: string;
				expected_image_url?: string | null;
			} | null;
			if (
				!preparedResponse.ok ||
				prepared?.ok !== true ||
				typeof prepared.path !== "string" ||
				typeof prepared.token !== "string" ||
				!(
					prepared.expected_image_url === null ||
					typeof prepared.expected_image_url === "string"
				)
			)
				throw new Error(prepared?.error ?? "unavailable");
			const upload = await createClient()
				.storage.from("product-images")
				.uploadToSignedUrl(prepared.path, prepared.token, file, {
					cacheControl: "3600",
					contentType: file.type,
				});
			if (upload.error) throw new Error("unavailable");
			gateway.searchParams.set("action", "finalize");
			const finalizedResponse = await fetch(gateway, {
				method: "POST",
				headers,
				body: JSON.stringify({
					product_id: product.id,
					path: prepared.path,
					expected_image_url: prepared.expected_image_url,
				}),
			});
			const finalized = (await finalizedResponse.json().catch(() => null)) as {
				ok?: boolean;
				error?: string;
			} | null;
			if (!finalizedResponse.ok || finalized?.ok !== true)
				throw new Error(finalized?.error ?? "unavailable");
			setNotice("Foto atualizada no cadastro.");
			window.location.reload();
		} catch (cause) {
			setNotice(
				apiError(cause instanceof Error ? cause.message : "unavailable"),
			);
		} finally {
			setImageSaving(false);
		}
	};

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
			{notice && (
				<p
					aria-live="polite"
					className="product-editor-message product-editor-message--success"
				>
					{notice}
				</p>
			)}
			{loading ? (
				<p className="catalog-empty">Carregando produto…</p>
			) : !product ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{error === "not_found"
								? "Produto não encontrado"
								: error === "not_authorized"
									? "Esta conta não tem acesso a este produto"
									: error === "not_authenticated"
										? "Entre novamente para consultar o produto"
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
								// biome-ignore lint/performance/noImgElement: Product image URLs are served from the authorized catalog gateway.
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
									<dd>
										{product.expirationDate &&
										/^\d{4}-\d{2}-\d{2}$/.test(product.expirationDate)
											? `${product.expirationDate.slice(8, 10)}/${product.expirationDate.slice(5, 7)}/${product.expirationDate.slice(0, 4)}`
											: "Não informada"}
									</dd>
								</div>
							</dl>
						</div>
					</section>
					<section
						aria-labelledby="product-image-editor-heading"
						className="product-editor-card product-image-editor-card"
					>
						<div className="product-editor-heading">
							<div>
								<h2 id="product-image-editor-heading">Foto do produto</h2>
								<p>
									{product.imageUrl
										? "A foto está cadastrada. Envie outra para substituí-la."
										: "Adicione uma foto para completar o cadastro do produto."}
								</p>
							</div>
						</div>
						<form className="product-image-upload-form" onSubmit={saveImage}>
							<label
								className="product-image-upload-field"
								htmlFor="productImage"
							>
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
							<button
								className="catalog-submit"
								disabled={imageSaving}
								type="submit"
							>
								<ImagePlus aria-hidden="true" size={15} />
								{imageSaving
									? "Enviando…"
									: product.imageUrl
										? "Atualizar foto"
										: "Salvar foto"}
							</button>
						</form>
					</section>
					<section
						aria-labelledby="product-editor-heading"
						className="product-editor-card"
					>
						<div className="product-editor-heading">
							<div>
								<h2 id="product-editor-heading">Preço e disponibilidade</h2>
								<p>Edite o preço de venda e a situação do produto.</p>
							</div>
						</div>
						<form className="product-editor-form" onSubmit={saveProduct}>
							<input
								name="expectedPriceCents"
								type="hidden"
								value={product.priceCents ?? ""}
							/>
							<input
								name="expectedActive"
								type="hidden"
								value={String(product.active)}
							/>
							<label className="product-editor-field" htmlFor="salePrice">
								<span>Preço de venda</span>
								<span className="product-editor-price-input">
									<span aria-hidden="true">R$</span>
									<input
										autoComplete="off"
										defaultValue={
											product.priceCents == null
												? ""
												: `${Math.floor(product.priceCents / 100)},${String(product.priceCents % 100).padStart(2, "0")}`
										}
										id="salePrice"
										inputMode="decimal"
										maxLength={16}
										name="salePrice"
										placeholder="0,00"
										required
									/>
								</span>
							</label>
							<label className="product-editor-availability">
								<input
									defaultChecked={product.active}
									name="active"
									type="checkbox"
									value="true"
								/>
								<span>Disponível na loja</span>
							</label>
							<div className="product-editor-footer">
								<p>
									Este formulário altera apenas preço e disponibilidade.
									Atualize a foto na seção própria.
								</p>
								<button
									className="catalog-submit"
									disabled={saving}
									type="submit"
								>
									{saving ? "Salvando…" : "Salvar alterações"}
								</button>
							</div>
						</form>
					</section>
					<section
						aria-labelledby="product-whatsapp-heading"
						className="product-editor-card"
					>
						<div className="product-editor-heading">
							<div>
								<h2 id="product-whatsapp-heading">
									Disponibilidade no WhatsApp
								</h2>
								<p>
									{product.whatsappActive
										? "Habilitado para uso nas opções do Flow."
										: "Ainda não habilitado para uso nas opções do Flow."}
								</p>
							</div>
							<span
								className={`catalog-status-pill${product.whatsappActive ? " catalog-status-pill--active" : ""}`}
							>
								{product.whatsappActive ? "Habilitado" : "Desabilitado"}
							</span>
						</div>
						<div className="product-flow-note" role="note">
							<AlertCircle aria-hidden="true" size={18} />
							<p>
								Este ajuste não publica nem vincula o produto ao Catálogo Meta.
								Ao desabilitar, ele deixa de aparecer em novas opções de cesta;
								pedidos já registrados não mudam.
							</p>
						</div>
						<div className="product-editor-footer">
							<p>
								A ativação exige produto ativo, nome válido, foto HTTPS e preço
								aceito pelo Flow.
							</p>
							<button
								className="catalog-submit"
								disabled={whatsappSaving}
								onClick={toggleWhatsapp}
								type="button"
							>
								{whatsappSaving
									? "Salvando…"
									: product.whatsappActive
										? "Desativar no WhatsApp"
										: "Ativar no WhatsApp"}
							</button>
						</div>
					</section>
				</>
			)}
		</div>
	);
}

import {
	AlertCircle,
	ArrowRight,
	ImageOff,
	ShoppingBasket,
} from "lucide-react";
import Link from "next/link";
import {
	getAdminBasketMoldList,
	getAdminBasketMoldPhotoAudit,
} from "@/lib/supabase/admin-basket-molds";

const errorCopy: Record<string, string> = {
	not_configured: "O acesso ao Supabase ainda não está configurado.",
	not_authenticated: "Entre novamente para consultar as cestas.",
	not_authorized: "Esta conta não tem acesso às cestas.",
	unavailable: "Não foi possível carregar as cestas agora. Tente novamente.",
};

export default async function CestasPage() {
	const result = await getAdminBasketMoldList();
	const auditResult = result.ok
		? await getAdminBasketMoldPhotoAudit(result.data)
		: null;
	const audit = auditResult?.ok ? auditResult.data : null;

	return (
		<div className="page-stack" id="admin-basket-molds-page">
			<section className="page-heading">
				<div>
					<p className="eyebrow">CADASTROS</p>
					<h1>Cestas básicas</h1>
					<p className="page-description">
						Organize os produtos que o cliente pode escolher em cada etapa do
						Flow.
					</p>
				</div>
			</section>

			<div className="basket-mold-note" role="note">
				<AlertCircle aria-hidden="true" size={18} />
				<p>
					As alterações atualizam o molde usado para montar o Flow. A publicação
					e a validação nos dois números WhatsApp continuam sendo etapas
					separadas.
				</p>
			</div>

			{audit &&
				(audit.positionsWithoutActiveOption > 0 ||
					audit.positionsWithoutActivePhoto > 0) && (
					<div
						className="basket-mold-note basket-mold-note--warning"
						role="status"
					>
						<AlertCircle aria-hidden="true" size={18} />
						<p>
							{audit.positionsWithoutActiveOption > 0 && (
								<>
									<strong>{audit.positionsWithoutActiveOption} etapa(s)</strong>{" "}
									ainda precisam de uma alternativa ativa e habilitada para
									WhatsApp.{" "}
								</>
							)}
							{audit.positionsWithoutActivePhoto > 0 && (
								<>
									<strong>{audit.positionsWithoutActivePhoto} etapa(s)</strong>{" "}
									precisam de uma opção habilitada com foto cadastrada.
								</>
							)}
							Abra a cesta indicada e ajuste as alternativas antes de preparar o
							Flow.
						</p>
					</div>
				)}

			{result.ok && auditResult && !auditResult.ok && (
				<div
					className="basket-mold-note basket-mold-note--warning"
					role="status"
				>
					<AlertCircle aria-hidden="true" size={18} />
					<p>
						A lista carregou, mas não foi possível conferir a prontidão das
						etapas. Atualize a página para tentar novamente.
					</p>
				</div>
			)}

			{!result.ok ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<strong>{errorCopy[result.error] ?? errorCopy.unavailable}</strong>
				</section>
			) : result.data.length === 0 ? (
				<section className="basket-mold-empty">
					<ShoppingBasket aria-hidden="true" size={24} />
					<strong>Nenhuma cesta disponível</strong>
					<p>Os modelos ativos aparecerão aqui quando estiverem cadastrados.</p>
				</section>
			) : (
				<section aria-label="Modelos de cesta" className="basket-mold-list">
					{result.data.map((basket) => {
						const readiness =
							audit?.baskets.find((item) => item.basketId === basket.id) ??
							null;
						const hasPendingReadiness = Boolean(
							readiness &&
								(readiness.positionsWithoutActiveOption > 0 ||
									readiness.positionsWithoutActivePhoto > 0),
						);
						const statusLabel = !basket.moldConfigured
							? "Molde pendente"
							: !readiness
								? "Etapas não conferidas"
								: hasPendingReadiness
									? "Etapas pendentes"
									: "Etapas cadastradas";

						return (
							<article className="basket-mold-card" key={basket.id}>
								<div className="basket-mold-card__image">
									{basket.imageUrl ? (
										// biome-ignore lint/performance/noImgElement: Product images use user-managed HTTPS URLs from the catalog.
										<img alt="" loading="lazy" src={basket.imageUrl} />
									) : (
										<ImageOff aria-hidden="true" size={20} />
									)}
								</div>
								<div className="basket-mold-card__body">
									<div className="basket-mold-card__title">
										<strong>{basket.name}</strong>
										<span
											className={`basket-mold-status${basket.moldConfigured && readiness && !hasPendingReadiness ? " basket-mold-status--ready" : ""}${hasPendingReadiness ? " basket-mold-status--warning" : ""}`}
										>
											{statusLabel}
										</span>
									</div>
									<p>
										{[basket.categoryName, basket.subcategoryName]
											.filter(Boolean)
											.join(" · ") || "Categoria não informada"}
									</p>
									<span className="basket-mold-card__detail">
										{basket.publicCompositionCount} composição(ões) pública(s)
										{readiness
											? ` · ${readiness.positionCount} etapas · ${readiness.activeOptionCount} opções habilitadas${readiness.positionsWithoutActiveOption > 0 ? ` · ${readiness.positionsWithoutActiveOption} sem opção` : ""}${readiness.positionsWithoutActivePhoto > 0 ? ` · ${readiness.positionsWithoutActivePhoto} sem foto` : ""}`
											: ""}
										{basket.hiddenAdjustmentCents > 0
											? ` · ajuste interno de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(basket.hiddenAdjustmentCents / 100)}`
											: ""}
									</span>
								</div>
								{basket.moldConfigured ? (
									<Link
										aria-label={`Editar alternativas de ${basket.name}`}
										className="basket-mold-edit-link"
										href={`/cestas/${basket.id}`}
									>
										Editar alternativas{" "}
										<ArrowRight aria-hidden="true" size={16} />
									</Link>
								) : (
									<span className="basket-mold-disabled-link">
										Configuração de etapas pendente
									</span>
								)}
								{readiness?.pendingPositions.length ? (
									<details className="basket-mold-pending-list">
										<summary>
											Ver etapas pendentes ({readiness.pendingPositions.length})
										</summary>
										<ul>
											{readiness.pendingPositions.map((position) => (
												<li key={position.positionId}>
													<strong>{position.label}</strong>:{" "}
													{position.issue === "no_whatsapp_option"
														? "sem opção ativa habilitada no WhatsApp"
														: "sem opção habilitada com foto"}
													{position.options.length ? (
														<ul>
															{position.options.map((option) => (
																<li key={option.productId}>
																	<Link href={`/produtos/${option.productId}`}>
																		{option.name}
																	</Link>
																	<span>
																		· {option.active ? "ativo" : "inativo"} ·{" "}
																		{option.whatsappActive === true
																			? "WhatsApp ligado"
																			: option.whatsappActive === false
																				? "WhatsApp desligado"
																				: "WhatsApp não conferido"}
																		·{" "}
																		{option.hasPhoto
																			? "foto cadastrada"
																			: "sem foto"}
																	</span>
																</li>
															))}
														</ul>
													) : (
														<p>Esta etapa ainda não tem produtos associados.</p>
													)}
												</li>
											))}
										</ul>
									</details>
								) : null}
							</article>
						);
					})}
				</section>
			)}
		</div>
	);
}

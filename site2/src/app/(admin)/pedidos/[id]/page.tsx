import { AlertCircle, ArrowLeft, MapPin, PackageCheck } from "lucide-react";
import Link from "next/link";
import {
	isAdminBlingOrderRecoveryEnabled,
	isAdminFiscalIssuanceEnabled,
} from "@/lib/admin-rollout";
import { getAdminOrderDetail } from "@/lib/supabase/admin-orders";
import { BlingRecoveryPanel } from "./bling-recovery-panel";
import { OrderDeliveryPanel } from "./delivery-panel";
import { OrderDispatchPanel } from "./dispatch-panel";
import { OrderSeparationPanel } from "./separation-panel";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

const statusNames: Record<string, string> = {
	created: "Novo",
	storefront_received: "Aguardando cliente",
	confirmed: "Aguardando separação",
	processing: "Em separação",
	ready: "Pronto para expedição",
	out_for_delivery: "Em rota de entrega",
	delivered: "Entregue",
	cancelled: "Cancelado",
};

export function generateStaticParams() {
	return [];
}

function date(value: string | null): string {
	if (!value) return "Não informada";
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime())
		? "Não informada"
		: new Intl.DateTimeFormat("pt-BR", {
				dateStyle: "long",
				timeStyle: "short",
				timeZone: "America/Cuiaba",
			}).format(parsed);
}

export default async function PedidoDetalhePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const result = UUID.test(id)
		? await getAdminOrderDetail(id)
		: { order: null, error: "not_found" as const };
	const order = result.order;
	const separation = order?.status === "ready" ? order.separation : null;
	const showBlingRecovery =
		isAdminBlingOrderRecoveryEnabled() &&
		order?.fiscalStatus?.issueEnabled === false &&
		separation !== null &&
		Boolean(separation.completion?.completedAt) &&
		separation.items.length > 0 &&
		separation.counts.pending === 0 &&
		separation.counts.missing === 0 &&
		separation.items.every((item) => item.state === "separated");
	const address = order?.address;
	const addressLines = address
		? [
				[address.street, address.number, address.complement]
					.filter(Boolean)
					.join(", "),
				[address.district, address.city, address.state]
					.filter(Boolean)
					.join(" · "),
				address.postalCode ? `CEP ${address.postalCode}` : "",
				address.reference,
			].filter(Boolean)
		: [];

	return (
		<div className="page-stack admin-order-page" id="admin-order-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">ROTINA</p>
					<h1>
						{order
							? `Pedido ${order.orderNumber ?? order.publicCode ?? order.id.slice(0, 8)}`
							: "Pedido"}
					</h1>
					<p className="page-description">
						Resumo do pedido e dados para a operação.
					</p>
				</div>
				<Link className="catalog-clear" href="/pedidos">
					<ArrowLeft aria-hidden="true" size={15} /> Voltar aos pedidos
				</Link>
			</div>

			{!order ? (
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<div>
						<strong>
							{result.error === "not_found"
								? "Pedido não encontrado"
								: result.error === "not_authorized"
									? "Esta conta não tem acesso a este pedido"
									: "Não foi possível carregar o pedido"}
						</strong>
						<p>Volte à lista e tente abrir o pedido novamente.</p>
					</div>
				</section>
			) : (
				<>
					<section className="order-summary-card">
						<div className="order-summary-heading">
							<div>
								<h2>{order.customerName}</h2>
								<p>
									{order.phone ?? "Telefone não informado"} ·{" "}
									{date(order.createdAt)}
								</p>
							</div>
							<span
								className={`order-status-pill order-status-pill--${order.lane ?? "other"}`}
							>
								{statusNames[order.status] ?? "Em análise"}
							</span>
						</div>
						<div className="order-summary-grid">
							<div>
								<span>Total</span>
								<strong>{money.format(order.totalCents / 100)}</strong>
							</div>
							<div>
								<span>Pagamento</span>
								<strong>{order.paymentMethod}</strong>
							</div>
							<div>
								<span>Origem</span>
								<strong>{order.sourceLabel}</strong>
							</div>
							<div>
								<span>Bling</span>
								<strong>
									{order.blingState ?? "Sem sincronização indicada"}
								</strong>
							</div>
						</div>
					</section>

					<OrderSeparationPanel
						orderId={order.id}
						orderStatus={order.status}
						separation={order.separation}
					/>
					{showBlingRecovery ? <BlingRecoveryPanel orderId={order.id} /> : null}
					<OrderDispatchPanel
						fiscalIssuanceEnabled={isAdminFiscalIssuanceEnabled()}
						fiscalError={order.fiscalError}
						fiscalStatus={order.fiscalStatus}
						orderId={order.id}
						orderStatus={order.status}
					/>
					<OrderDeliveryPanel
						fiscalStatus={order.fiscalStatus}
						orderId={order.id}
						orderStatus={order.status}
						totalCents={order.totalCents}
					/>

					<div className="order-detail-grid">
						<section
							className="order-detail-card"
							aria-labelledby="items-heading"
						>
							<div className="order-detail-heading">
								<PackageCheck aria-hidden="true" size={18} />
								<h2 id="items-heading">Itens do pedido</h2>
							</div>
							{order.items.length ? (
								<ul className="order-item-list">
									{order.items.map((item) => (
										<li key={item.id}>
											<div>
												<strong>{item.name}</strong>
												<span>Quantidade: {item.quantity}</span>
												{item.components.length > 0 && (
													<ul className="order-component-list">
														{item.components.map((component) => (
															<li key={component.id}>
																{component.quantity} × {component.name}
															</li>
														))}
													</ul>
												)}
											</div>
											{item.totalCents != null && (
												<strong>{money.format(item.totalCents / 100)}</strong>
											)}
										</li>
									))}
								</ul>
							) : (
								<p className="order-detail-muted">Nenhum item detalhado.</p>
							)}
						</section>

						<section
							className="order-detail-card"
							aria-labelledby="address-heading"
						>
							<div className="order-detail-heading">
								<MapPin aria-hidden="true" size={18} />
								<h2 id="address-heading">Endereço de entrega</h2>
							</div>
							{addressLines.length ? (
								<address className="order-address-lines">
									{addressLines.map((line) => (
										<span key={line}>{line}</span>
									))}
								</address>
							) : (
								<p className="order-detail-muted">Endereço não informado.</p>
							)}
						</section>
					</div>
				</>
			)}
		</div>
	);
}

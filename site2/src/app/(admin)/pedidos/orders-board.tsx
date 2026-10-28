"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { OrderLane } from "@/lib/supabase/admin-orders";
import { type OrderBoardActionState, orderBoardAction } from "./actions";

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

const laneNames: Record<OrderLane, string> = {
	new: "Novos",
	separate: "Produção",
	ready: "Expedição",
	delivered: "Entregues",
};

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

const errorNames: Record<string, string> = {
	not_configured: "O acesso ao Supabase ainda não está configurado.",
	not_authenticated: "Entre novamente para consultar os pedidos.",
	not_authorized: "Esta conta não tem acesso aos pedidos.",
	not_found: "Pedido não encontrado.",
	unavailable: "Não foi possível carregar os pedidos agora. Tente novamente.",
};

function orderDate(value: string | null): string {
	if (!value) return "Data não informada";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Data não informada";
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "America/Cuiaba",
	}).format(date);
}

export function OrdersBoard({
	initialState,
}: {
	initialState: OrderBoardActionState;
}) {
	const [state, formAction, pending] = useActionState(
		orderBoardAction,
		initialState,
	);
	const [query, setQuery] = useState(state.query);
	const result = state.result;
	const start = result.orders.length ? state.offset + 1 : 0;
	const end = state.offset + result.orders.length;
	const searchMode = state.query.length > 0;

	return (
		<div className="page-stack admin-order-page" id="admin-order-page">
			<section className="page-heading">
				<div>
					<p className="eyebrow">ROTINA</p>
					<h1>Pedidos</h1>
					<p className="page-description">
						Acompanhe o pedido desde a confirmação até a entrega.
					</p>
				</div>
			</section>

			<nav aria-label="Etapas dos pedidos" className="order-lane-nav">
				{(["new", "separate", "ready", "delivered"] as const).map((lane) => {
					const count = result.counts?.[lane];
					const active = !searchMode && state.lane === lane;
					return (
						<Link
							aria-current={active ? "page" : undefined}
							className={`order-lane-tab${active ? " order-lane-tab--active" : ""}`}
							href={`/pedidos?tab=${lane}`}
							key={lane}
						>
							<span>{laneNames[lane]}</span>
							{count !== undefined && (
								<span className="order-lane-count">{count}</span>
							)}
						</Link>
					);
				})}
			</nav>

			<form action={formAction} className="order-search-card">
				<input name="intent" type="hidden" value="search" />
				<input name="lane" type="hidden" value={state.lane} />
				<input name="offset" type="hidden" value="0" />
				<label className="catalog-search-field">
					<span>Buscar pedido</span>
					<span className="catalog-search-input">
						<Search aria-hidden="true" size={17} />
						<input
							autoComplete="off"
							maxLength={80}
							name="query"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Número, nome, telefone ou endereço"
							value={query}
						/>
					</span>
				</label>
				<button className="catalog-submit" disabled={pending} type="submit">
					{pending ? "Buscando…" : "Buscar"}
				</button>
				{query && (
					<Link className="catalog-clear" href={`/pedidos?tab=${state.lane}`}>
						Limpar busca
					</Link>
				)}
			</form>

			{searchMode && (
				<p className="order-search-note">
					A busca abrange todos os status. Os resultados não são limitados à
					etapa selecionada.
				</p>
			)}

			{result.error ? (
				<section className="catalog-message" role="status">
					<strong>{errorNames[result.error] ?? errorNames.unavailable}</strong>
				</section>
			) : result.orders.length ? (
				<section aria-label="Lista de pedidos" className="orders-list">
					{result.orders.map((order) => (
						<Link
							className="order-list-card"
							href={`/pedidos/${encodeURIComponent(order.id)}`}
							key={order.id}
						>
							<div className="order-list-main">
								<div className="order-list-heading">
									<strong>
										Pedido{" "}
										{order.orderNumber ??
											order.publicCode ??
											order.id.slice(0, 8)}
									</strong>
									<span
										className={`order-status-pill order-status-pill--${order.lane ?? "other"}`}
									>
										{statusNames[order.status] ?? "Em análise"}
									</span>
									<span className="order-source-pill">{order.sourceLabel}</span>
								</div>
								<span className="order-list-customer">
									{order.customerName}
								</span>
								<span className="order-list-meta">
									{order.phone ?? "Telefone não informado"} ·{" "}
									{orderDate(order.createdAt)}
								</span>
							</div>
							<div className="order-list-total">
								<strong>{money.format(order.totalCents / 100)}</strong>
								{!order.registrationComplete && <span>Cadastro pendente</span>}
							</div>
						</Link>
					))}
				</section>
			) : (
				<section className="catalog-empty">
					<strong>
						{searchMode
							? "Nenhum pedido encontrado"
							: "Nenhum pedido nesta etapa"}
					</strong>
					<p>
						{searchMode
							? "Confira o texto da busca e tente novamente."
							: `Os pedidos em ${laneNames[state.lane].toLowerCase()} aparecerão aqui.`}
					</p>
				</section>
			)}

			{!result.error && result.total > 0 && (
				<div className="order-pagination">
					<span>
						{start}–{end} de {result.total} pedidos
					</span>
					<div>
						{state.offset > 0 && (
							<form action={formAction}>
								<input name="intent" type="hidden" value="previous" />
								<input name="lane" type="hidden" value={state.lane} />
								<input name="query" type="hidden" value={state.query} />
								<input name="offset" type="hidden" value={state.offset} />
								<button
									aria-label="Pedidos anteriores"
									disabled={pending}
									type="submit"
								>
									<ChevronLeft size={17} />
								</button>
							</form>
						)}
						{result.hasMore && (
							<form action={formAction}>
								<input name="intent" type="hidden" value="next" />
								<input name="lane" type="hidden" value={state.lane} />
								<input name="query" type="hidden" value={state.query} />
								<input name="offset" type="hidden" value={state.offset} />
								<button
									aria-label="Próximos pedidos"
									disabled={pending}
									type="submit"
								>
									<ChevronRight size={17} />
								</button>
							</form>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

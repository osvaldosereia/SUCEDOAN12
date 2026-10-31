"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import type { OrderBoardResult, OrderLane } from "@/lib/supabase/admin-orders";
import { getBrowserAdminOrderBoard } from "@/lib/supabase/browser-admin-orders";

const PAGE_SIZE = 5;
const EMPTY_RESULT: OrderBoardResult = {
	orders: [],
	total: 0,
	hasMore: false,
	counts: null,
	error: null,
};

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

function parseLane(value: string | null): OrderLane {
	return value === "separate" || value === "ready" || value === "delivered"
		? value
		: "new";
}

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

export function OrdersBoard() {
	const [lane, setLane] = useState<OrderLane>("new");
	const [query, setQuery] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [offset, setOffset] = useState(0);
	const [routeReady, setRouteReady] = useState(false);
	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<OrderBoardResult>(EMPTY_RESULT);
	const searchMode = query.length > 0;

	useEffect(() => {
		setLane(parseLane(new URL(window.location.href).searchParams.get("tab")));
		setRouteReady(true);
	}, []);

	useEffect(() => {
		if (!routeReady) return;
		let active = true;
		setPending(true);
		void getBrowserAdminOrderBoard({ lane, query, offset })
			.then((nextResult) => {
				if (!active) return;
				setResult((previous) => ({
					...nextResult,
					counts: nextResult.counts ?? previous.counts,
				}));
			})
			.catch(() => {
				if (active) setResult({ ...EMPTY_RESULT, error: "unavailable" });
			})
			.finally(() => {
				if (active) setPending(false);
			});
		return () => {
			active = false;
		};
	}, [lane, offset, query, routeReady]);

	function selectLane(nextLane: OrderLane) {
		setLane(nextLane);
		setQuery("");
		setSearchInput("");
		setOffset(0);
		const url = new URL(window.location.href);
		url.searchParams.set("tab", nextLane);
		window.history.replaceState(null, "", url);
	}

	function search(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setQuery(searchInput.trim().slice(0, 80));
		setOffset(0);
	}

	function clearSearch() {
		setQuery("");
		setSearchInput("");
		setOffset(0);
	}

	const start = result.orders.length ? offset + 1 : 0;
	const end = offset + result.orders.length;

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
				{(["new", "separate", "ready", "delivered"] as const).map(
					(candidateLane) => {
						const count = result.counts?.[candidateLane];
						const active = !searchMode && lane === candidateLane;
						return (
							<button
								aria-current={active ? "page" : undefined}
								className={`order-lane-tab${active ? " order-lane-tab--active" : ""}`}
								disabled={pending}
								key={candidateLane}
								onClick={() => selectLane(candidateLane)}
								type="button"
							>
								<span>{laneNames[candidateLane]}</span>
								{count !== undefined && (
									<span className="order-lane-count">{count}</span>
								)}
							</button>
						);
					},
				)}
			</nav>

			<form className="order-search-card" onSubmit={search}>
				<label className="catalog-search-field">
					<span>Buscar pedido</span>
					<span className="catalog-search-input">
						<Search aria-hidden="true" size={17} />
						<input
							autoComplete="off"
							maxLength={80}
							name="query"
							onChange={(event) => setSearchInput(event.target.value)}
							placeholder="Número, nome, telefone ou endereço"
							value={searchInput}
						/>
					</span>
				</label>
				<button className="catalog-submit" disabled={pending} type="submit">
					{pending ? "Buscando…" : "Buscar"}
				</button>
				{searchMode && (
					<button className="catalog-clear" onClick={clearSearch} type="button">
						Limpar busca
					</button>
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
							href={`/pedidos/detalhe?id=${encodeURIComponent(order.id)}`}
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
			) : pending || !routeReady ? (
				<section className="catalog-message" role="status">
					Carregando pedidos…
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
							: `Os pedidos em ${laneNames[lane].toLowerCase()} aparecerão aqui.`}
					</p>
				</section>
			)}

			{!result.error && result.total > 0 && (
				<div className="order-pagination">
					<span>
						{start}–{end} de {result.total} pedidos
					</span>
					<div>
						{offset > 0 && (
							<button
								aria-label="Pedidos anteriores"
								disabled={pending}
								onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
								type="button"
							>
								<ChevronLeft size={17} />
							</button>
						)}
						{result.hasMore && (
							<button
								aria-label="Próximos pedidos"
								disabled={pending}
								onClick={() => setOffset(offset + PAGE_SIZE)}
								type="button"
							>
								<ChevronRight size={17} />
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

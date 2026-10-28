"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
	linkCustomerToConversation,
	searchAdminCustomersAction,
} from "./actions";

const INITIAL_STATE = { items: null, message: null };

export function CustomerSearch({
	conversationId,
	currentCustomerId,
	initialQuery,
}: {
	conversationId: string | null;
	currentCustomerId: string | null;
	initialQuery: string;
}) {
	const [state, formAction, pending] = useActionState(
		searchAdminCustomersAction,
		INITIAL_STATE,
	);
	const [query, setQuery] = useState(initialQuery);

	return (
		<section
			aria-labelledby="customer-search-heading"
			className="customer-card"
		>
			<div className="customer-card-heading">
				<div>
					<h2 id="customer-search-heading">Localizar cliente</h2>
					<p>Busque pelo nome, telefone ou documento.</p>
				</div>
			</div>
			<form action={formAction} className="customer-search-form">
				<label className="customer-field customer-search-field">
					<span>Dados do cliente</span>
					<input
						autoComplete="off"
						maxLength={180}
						name="query"
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Nome, telefone ou documento"
						value={query}
					/>
				</label>
				<button
					className="catalog-submit"
					disabled={pending || query.trim().length < 2}
					type="submit"
				>
					{pending ? "Buscando…" : "Buscar"}
				</button>
			</form>

			{state.message && (
				<p aria-live="polite" className="customer-search-message">
					{state.message}
				</p>
			)}

			{state.items && state.items.length > 0 && (
				<ul aria-label="Clientes encontrados" className="customer-results">
					{state.items.map((customer) => (
						<li className="customer-result" key={customer.id}>
							<div className="customer-result-copy">
								<strong>{customer.name}</strong>
								<span>
									{customer.phone ?? "Telefone não informado"}
									{customer.maskedDocument
										? ` · ${customer.maskedDocument}`
										: " · Sem documento"}
								</span>
							</div>
							<span
								className={`customer-status${customer.active ? " customer-status--active" : ""}`}
							>
								{customer.active ? "Ativo" : "Inativo"}
							</span>
							{conversationId &&
							customer.id !== currentCustomerId &&
							customer.active ? (
								<form action={linkCustomerToConversation}>
									<input hidden name="conversation_id" value={conversationId} />
									<input hidden name="customer_id" value={customer.id} />
									<button className="customer-link-button" type="submit">
										Vincular
									</button>
								</form>
							) : !conversationId ? (
								<Link className="customer-link-button" href="/atendimento">
									Abrir atendimento
								</Link>
							) : !customer.active ? (
								<span className="customer-current-link">Cadastro inativo</span>
							) : (
								<span className="customer-current-link">Vinculado</span>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

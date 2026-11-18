"use client";

import { AlertCircle, Check, PackageCheck } from "lucide-react";
import { useActionState } from "react";
import { ORDER_SEPARATORS } from "@/lib/orders/separators";
import type {
	OrderSeparation,
	OrderSeparationItem,
} from "@/lib/supabase/admin-orders";
import {
	assignOrderSeparatorAction,
	completeOrderSeparationAction,
	type SeparationActionState,
	setOrderSeparationItemAction,
} from "../actions";

const INITIAL_ACTION_STATE: SeparationActionState = {
	kind: "idle",
	message: "",
};

function ActionFeedback({ state }: { state: SeparationActionState }) {
	if (state.kind === "idle" || !state.message) return null;
	return (
		<p
			aria-live={state.kind === "error" ? "assertive" : "polite"}
			className={
				state.kind === "error"
					? "order-action-feedback order-action-feedback--error"
					: "order-action-feedback order-action-feedback--success"
			}
			role={state.kind === "error" ? "alert" : "status"}
		>
			{state.message}
		</p>
	);
}

function SeparatorAssignment({
	orderId,
	currentSeparatorKey,
	enabled,
}: {
	orderId: string;
	currentSeparatorKey: string | null;
	enabled: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		assignOrderSeparatorAction,
		INITIAL_ACTION_STATE,
	);

	return (
		<div className="order-separation-assignment">
			<form action={formAction}>
				<input name="orderId" type="hidden" value={orderId} />
				<label>
					<span>Responsável pela separação</span>
					<select
						defaultValue={currentSeparatorKey ?? ""}
						key={currentSeparatorKey ?? "unassigned"}
						name="separatorKey"
						required
					>
						<option disabled value="">
							Selecione uma pessoa
						</option>
						{ORDER_SEPARATORS.map((separator) => (
							<option key={separator.key} value={separator.key}>
								{separator.label}
							</option>
						))}
					</select>
				</label>
				<button
					className="button button--secondary"
					disabled={!enabled || pending}
					type="submit"
				>
					{pending
						? "Salvando…"
						: currentSeparatorKey
							? "Atualizar responsável"
							: "Definir responsável"}
				</button>
			</form>
			<ActionFeedback state={state} />
		</div>
	);
}

function SeparationItemRow({
	orderId,
	item,
	expectedOrderUpdatedAt,
	separatorKey,
	requiresBlingAcknowledgement,
	enabled,
}: {
	orderId: string;
	item: OrderSeparationItem;
	expectedOrderUpdatedAt: string | null;
	separatorKey: string;
	requiresBlingAcknowledgement: boolean;
	enabled: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		setOrderSeparationItemAction,
		INITIAL_ACTION_STATE,
	);
	const stateLabel =
		item.state === "separated"
			? "Separado"
			: item.state === "missing"
				? "Indisponível"
				: "Pendente";
	const stateClass = {
		pending: "order-separation-state order-separation-state--pending",
		separated: "order-separation-state order-separation-state--separated",
		missing: "order-separation-state order-separation-state--missing",
	}[item.state];

	return (
		<li className="order-separation-item">
			<div className="order-separation-item-copy">
				<div className="order-separation-item-heading">
					<strong>{item.name}</strong>
					<span className={stateClass}>{stateLabel}</span>
				</div>
				<span>Quantidade: {item.quantity}</span>
				{item.sku ? <span>SKU {item.sku}</span> : null}
			</div>
			<form action={formAction} className="order-separation-item-actions">
				<input name="orderId" type="hidden" value={orderId} />
				<input name="orderItemId" type="hidden" value={item.orderItemId} />
				<input
					name="expectedOrderUpdatedAt"
					type="hidden"
					value={expectedOrderUpdatedAt ?? ""}
				/>
				<input name="separatorKey" type="hidden" value={separatorKey} />
				{requiresBlingAcknowledgement ? (
					<label className="order-separation-acknowledgement">
						<input
							name="confirmBlingSync"
							required
							type="checkbox"
							value="yes"
						/>
						<span>
							Entendi que esta alteração pode iniciar a sincronização de estoque
							com o Bling.
						</span>
					</label>
				) : null}
				<div>
					<button
						className="order-separation-button order-separation-button--primary"
						disabled={!enabled || pending}
						name="state"
						type="submit"
						value="separated"
					>
						<Check aria-hidden="true" size={15} />
						{pending ? "Salvando…" : "Separado"}
					</button>
					<button
						className="order-separation-button order-separation-button--secondary"
						disabled={!enabled || pending}
						name="state"
						type="submit"
						value="missing"
					>
						{pending ? "Salvando…" : "Indisponível"}
					</button>
				</div>
				<ActionFeedback state={state} />
			</form>
		</li>
	);
}

function CompleteSeparation({
	orderId,
	expectedOrderUpdatedAt,
	enabled,
}: {
	orderId: string;
	expectedOrderUpdatedAt: string | null;
	enabled: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		completeOrderSeparationAction,
		INITIAL_ACTION_STATE,
	);

	return (
		<div className="order-separation-completion">
			<div>
				<strong>Todos os itens estão separados</strong>
				<p>
					Concluir esta etapa atualiza o estoque, avisa o cliente e inicia a
					sincronização operacional. A emissão fiscal fica para a etapa final.
				</p>
			</div>
			<form action={formAction}>
				<input name="orderId" type="hidden" value={orderId} />
				<input
					name="expectedOrderUpdatedAt"
					type="hidden"
					value={expectedOrderUpdatedAt ?? ""}
				/>
				<label className="order-separation-acknowledgement">
					<input
						name="confirmCompletion"
						required
						type="checkbox"
						value="yes"
					/>
					<span>
						Confirmo a conclusão da separação e seus efeitos operacionais.
					</span>
				</label>
				<button
					className="button button--primary"
					disabled={!enabled || pending}
					type="submit"
				>
					{pending ? "Concluindo…" : "Concluir separação"}
				</button>
			</form>
			<ActionFeedback state={state} />
		</div>
	);
}

function itemCount(value: number): string {
	return [String(value), value === 1 ? "item" : "itens"].join(" ");
}

function completionDate(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return "data não informada";
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "America/Cuiaba",
	}).format(parsed);
}

function inactiveSeparationMessage(orderStatus: string): string {
	if (orderStatus === "cancelled") {
		return "Pedido cancelado. A separação não pode mais ser alterada.";
	}
	if (
		orderStatus === "ready" ||
		orderStatus === "out_for_delivery" ||
		orderStatus === "delivered"
	) {
		return "O pedido já avançou para a etapa seguinte. A separação não pode mais ser alterada.";
	}
	return "A separação pode ser alterada somente enquanto o pedido aguarda ou está em separação.";
}

export function OrderSeparationPanel({
	orderId,
	orderStatus,
	separation,
}: {
	orderId: string;
	orderStatus: string;
	separation: OrderSeparation | null;
}) {
	const canOperate =
		orderStatus === "confirmed" || orderStatus === "processing";
	const assignedSeparator = ORDER_SEPARATORS.find(
		(separator) => separator.key === separation?.assignment?.separatorKey,
	);
	const allItemsSeparated =
		separation !== null &&
		separation.items.length > 0 &&
		separation.items.every((item) => item.state === "separated") &&
		separation.counts.pending === 0 &&
		separation.counts.missing === 0;
	const displayTotal = separation
		? Math.max(separation.counts.total, separation.items.length)
		: 0;

	return (
		<section
			aria-labelledby="order-separation-heading"
			className="order-detail-card order-separation-card"
		>
			<div className="order-detail-heading">
				<PackageCheck aria-hidden="true" size={18} />
				<h2 id="order-separation-heading">Separação do pedido</h2>
			</div>

			{!separation ? (
				<div className="order-separation-unavailable" role="status">
					<AlertCircle aria-hidden="true" size={17} />
					<p>
						{orderStatus === "created" || orderStatus === "storefront_received"
							? "A separação fica disponível depois que o cliente confirma o pedido."
							: orderStatus === "cancelled"
								? "Pedido cancelado. A separação não está disponível."
								: "Os dados operacionais de separação não foram retornados para este pedido. Atualize a ficha antes de agir."}
					</p>
				</div>
			) : (
				<>
					<div className="order-separation-progress">
						<div>
							<strong>
								{separation.counts.separated} de {displayTotal} itens
							</strong>
							<span>
								{itemCount(separation.counts.pending)} pendentes ·{" "}
								{itemCount(separation.counts.missing)} indisponíveis
							</span>
						</div>
						<progress
							aria-label="Progresso da separação"
							max={Math.max(1, displayTotal)}
							value={Math.min(
								separation.counts.separated,
								Math.max(1, displayTotal),
							)}
						/>
					</div>

					{separation.assignment?.separatorLabel ? (
						<p className="order-separation-assigned">
							Responsável atual:{" "}
							<strong>{separation.assignment.separatorLabel}</strong>
						</p>
					) : null}

					{canOperate && !separation.completion?.completedAt ? (
						<>
							<SeparatorAssignment
								currentSeparatorKey={assignedSeparator?.key ?? null}
								enabled={Boolean(separation.orderUpdatedAt)}
								orderId={orderId}
							/>

							{assignedSeparator && separation.items.length > 0 ? (
								<ul className="order-separation-list">
									{separation.items.map((item) => (
										<SeparationItemRow
											enabled={Boolean(separation.orderUpdatedAt)}
											expectedOrderUpdatedAt={separation.orderUpdatedAt}
											item={item}
											key={item.id}
											orderId={orderId}
											requiresBlingAcknowledgement={orderStatus === "confirmed"}
											separatorKey={assignedSeparator.key}
										/>
									))}
								</ul>
							) : (
								<p className="order-detail-muted">
									{separation.items.length === 0
										? "Este pedido não possui itens disponíveis para separação."
										: "Defina um responsável para começar a separação."}
								</p>
							)}

							{assignedSeparator && allItemsSeparated ? (
								<CompleteSeparation
									enabled={Boolean(separation.orderUpdatedAt)}
									expectedOrderUpdatedAt={separation.orderUpdatedAt}
									orderId={orderId}
								/>
							) : null}
						</>
					) : !separation.completion?.completedAt ? (
						<p className="order-detail-muted">
							{inactiveSeparationMessage(orderStatus)}
						</p>
					) : null}
					{separation.completion?.completedAt ? (
						<p className="order-detail-muted">
							Separação concluída em{" "}
							<time dateTime={separation.completion.completedAt}>
								{completionDate(separation.completion.completedAt)}
							</time>
							.
						</p>
					) : null}
				</>
			)}
		</section>
	);
}

"use client";

import { AlertCircle, Check, PackageCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ORDER_SEPARATORS } from "@/lib/orders/separators";
import type {
	OrderMutationError,
	OrderSeparation,
	OrderSeparationItem,
} from "@/lib/supabase/admin-orders";
import {
	assignBrowserOrderSeparator,
	completeBrowserOrderSeparation,
	setBrowserOrderSeparationItem,
} from "@/lib/supabase/browser-admin-orders";

type Feedback = { kind: "success" | "error"; message: string } | null;

function mutationError(error: OrderMutationError): string {
	const messages: Record<OrderMutationError, string> = {
		not_configured: "A conexão do Admin ainda não está configurada.",
		not_authenticated: "Entre novamente para continuar.",
		not_authorized: "Esta conta não tem permissão para alterar este pedido.",
		conflict: "O pedido mudou. Atualize a ficha antes de continuar.",
		fiscal_blocked:
			"Separação bloqueada: não foi possível confirmar que a emissão fiscal automática está desligada.",
		invalid_input: "Confira os dados da separação e tente novamente.",
		unavailable:
			"Não foi possível salvar agora. Confira o pedido antes de repetir.",
	};
	return messages[error];
}

function ActionFeedback({ feedback }: { feedback: Feedback }) {
	if (!feedback) return null;
	return (
		<p
			aria-live={feedback.kind === "error" ? "assertive" : "polite"}
			className={`order-action-feedback order-action-feedback--${feedback.kind}`}
			role={feedback.kind === "error" ? "alert" : "status"}
		>
			{feedback.message}
		</p>
	);
}

function stateLabel(state: OrderSeparationItem["state"]): string {
	if (state === "separated") return "Separado";
	if (state === "missing") return "Indisponível";
	return "Pendente";
}

function itemCount(value: number): string {
	return `${value} ${value === 1 ? "item" : "itens"}`;
}

function SeparatorAssignment({
	orderId,
	currentSeparatorKey,
	enabled,
	onChanged,
}: {
	orderId: string;
	currentSeparatorKey: string | null;
	enabled: boolean;
	onChanged: () => Promise<void>;
}) {
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<Feedback>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setFeedback(null);
		const form = new FormData(event.currentTarget);
		const result = await assignBrowserOrderSeparator({
			orderId,
			separatorKey: String(form.get("separatorKey") ?? ""),
		});
		setPending(false);
		if (!result.ok) {
			setFeedback({ kind: "error", message: mutationError(result.error) });
			return;
		}
		setFeedback({
			kind: "success",
			message: "Responsável pela separação registrado.",
		});
		await onChanged();
	}

	return (
		<div className="order-separation-assignment">
			<form onSubmit={submit}>
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
			<ActionFeedback feedback={feedback} />
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
	onChanged,
}: {
	orderId: string;
	item: OrderSeparationItem;
	expectedOrderUpdatedAt: string | null;
	separatorKey: string;
	requiresBlingAcknowledgement: boolean;
	enabled: boolean;
	onChanged: () => Promise<void>;
}) {
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<Feedback>(null);
	const stateClass = `order-separation-state order-separation-state--${item.state}`;

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		const submitter = (event.nativeEvent as SubmitEvent)
			.submitter as HTMLButtonElement | null;
		const state = submitter?.value;
		if (state !== "separated" && state !== "missing") return;
		if (
			requiresBlingAcknowledgement &&
			data.get("confirmBlingSync") !== "yes"
		) {
			setFeedback({
				kind: "error",
				message: "Confirme que entendeu a possível sincronização de estoque.",
			});
			return;
		}
		setPending(true);
		setFeedback(null);
		const result = await setBrowserOrderSeparationItem({
			orderId,
			orderItemId: item.orderItemId,
			state,
			expectedOrderUpdatedAt: expectedOrderUpdatedAt ?? "",
			separatorKey,
		});
		setPending(false);
		if (!result.ok) {
			setFeedback({ kind: "error", message: mutationError(result.error) });
			return;
		}
		setFeedback({
			kind: "success",
			message:
				result.warning === "bling_approval_pending"
					? "Item registrado. A aprovação no Bling ficou pendente; confira o pedido."
					: state === "separated"
						? "Item marcado como separado."
						: "Item marcado como indisponível.",
		});
		await onChanged();
	}

	return (
		<li className="order-separation-item">
			<div className="order-separation-item-copy">
				<div className="order-separation-item-heading">
					<strong>{item.name}</strong>
					<span className={stateClass}>{stateLabel(item.state)}</span>
				</div>
				<span>Quantidade: {item.quantity}</span>
				{item.sku ? <span>SKU {item.sku}</span> : null}
			</div>
			<form className="order-separation-item-actions" onSubmit={submit}>
				{requiresBlingAcknowledgement ? (
					<label className="order-separation-acknowledgement">
						<input name="confirmBlingSync" type="checkbox" value="yes" />
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
				<ActionFeedback feedback={feedback} />
			</form>
		</li>
	);
}

function CompleteSeparation({
	orderId,
	expectedOrderUpdatedAt,
	enabled,
	onChanged,
}: {
	orderId: string;
	expectedOrderUpdatedAt: string | null;
	enabled: boolean;
	onChanged: () => Promise<void>;
}) {
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<Feedback>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		if (form.get("confirmCompletion") !== "yes") {
			setFeedback({
				kind: "error",
				message: "Confirme os efeitos operacionais para continuar.",
			});
			return;
		}
		setPending(true);
		setFeedback(null);
		const result = await completeBrowserOrderSeparation({
			orderId,
			expectedOrderUpdatedAt: expectedOrderUpdatedAt ?? "",
		});
		setPending(false);
		if (!result.ok) {
			setFeedback({ kind: "error", message: mutationError(result.error) });
			return;
		}
		setFeedback({
			kind: "success",
			message:
				result.customerNotified === false
					? "Separação concluída. O aviso ao cliente não foi confirmado; confira a fila de atendimento."
					: result.integrationsQueued
						? "Separação concluída; integrações operacionais iniciadas."
						: "Separação concluída. Confira as integrações do pedido.",
		});
		await onChanged();
	}

	return (
		<div className="order-separation-completion">
			<div>
				<strong>Todos os itens estão separados</strong>
				<p>
					Concluir esta etapa atualiza o estoque, avisa o cliente e inicia as
					integrações operacionais. A emissão fiscal fica para a etapa final.
				</p>
			</div>
			<form onSubmit={submit}>
				<label className="order-separation-acknowledgement">
					<input
						name="confirmCompletion"
						required
						type="checkbox"
						value="yes"
					/>
					<span>
						Confirmo a conclusão da separação, a atualização do estoque, o aviso
						ao cliente e o início das integrações.
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
			<ActionFeedback feedback={feedback} />
		</div>
	);
}

function inactiveMessage(orderStatus: string): string {
	if (orderStatus === "cancelled")
		return "Pedido cancelado. A separação não pode mais ser alterada.";
	if (["ready", "out_for_delivery", "delivered"].includes(orderStatus)) {
		return "O pedido já avançou para a etapa seguinte. A separação não pode mais ser alterada.";
	}
	return "A separação pode ser alterada somente enquanto o pedido aguarda ou está em separação.";
}

export function BrowserOrderSeparationPanel({
	orderId,
	orderStatus,
	separation,
	onChanged,
}: {
	orderId: string;
	orderStatus: string;
	separation: OrderSeparation | null;
	onChanged: () => Promise<void>;
}) {
	const canOperate =
		orderStatus === "confirmed" || orderStatus === "processing";
	const assignedSeparator = ORDER_SEPARATORS.find(
		(separator) => separator.key === separation?.assignment?.separatorKey,
	);
	const allItemsSeparated = Boolean(
		separation &&
			separation.items.length > 0 &&
			separation.items.every((item) => item.state === "separated") &&
			separation.counts.pending === 0 &&
			separation.counts.missing === 0,
	);
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
								: "Os dados de separação não foram retornados. Atualize a ficha antes de agir."}
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
								onChanged={onChanged}
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
											onChanged={onChanged}
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
									onChanged={onChanged}
									orderId={orderId}
								/>
							) : null}
						</>
					) : !separation.completion?.completedAt ? (
						<p className="order-detail-muted">{inactiveMessage(orderStatus)}</p>
					) : (
						<p className="order-detail-muted">
							Separação concluída em {separation.completion.completedAt}.
						</p>
					)}
				</>
			)}
		</section>
	);
}

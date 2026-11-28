"use client";

import { FileCheck2, Truck } from "lucide-react";
import { useActionState } from "react";
import type {
	OrderFiscalStatus,
	OrderMutationError,
} from "@/lib/supabase/admin-orders";
import {
	issueOrderFiscalAction,
	type SeparationActionState,
	startOrderDispatchAction,
} from "../actions";

const INITIAL_ACTION_STATE: SeparationActionState = {
	kind: "idle",
	message: "",
};

function feedbackMessage(error: OrderMutationError | null): string {
	if (error === "not_authenticated") return "Entre novamente para continuar.";
	if (error === "not_authorized")
		return "Esta conta não tem permissão para iniciar a expedição.";
	if (error === "not_configured")
		return "A conexão do Admin ainda não está configurada.";
	if (error === "fiscal_blocked")
		return "A expedição exige uma NF-e autorizada no Bling.";
	return "Não foi possível consultar a situação fiscal. Atualize a ficha antes de agir.";
}

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

export function OrderDispatchPanel({
	orderId,
	orderStatus,
	fiscalStatus,
	fiscalError,
	fiscalIssuanceEnabled,
}: {
	orderId: string;
	orderStatus: string;
	fiscalStatus: OrderFiscalStatus | null;
	fiscalError: OrderMutationError | null;
	fiscalIssuanceEnabled: boolean;
}) {
	const [state, formAction, pending] = useActionState(
		startOrderDispatchAction,
		INITIAL_ACTION_STATE,
	);
	const [fiscalState, fiscalFormAction, fiscalPending] = useActionState(
		issueOrderFiscalAction,
		INITIAL_ACTION_STATE,
	);
	if (orderStatus !== "ready" && orderStatus !== "out_for_delivery")
		return null;

	const dispatchAllowed =
		orderStatus === "ready" &&
		fiscalStatus?.authorized === true &&
		fiscalStatus.canDispatch === true;
	const recoveryPending =
		fiscalStatus?.blockers.includes("invoice_generation_recovery_required") ===
		true;
	const fiscalIssueAllowed =
		fiscalIssuanceEnabled &&
		orderStatus === "ready" &&
		fiscalStatus?.authorized !== true &&
		fiscalStatus?.canIssue === true &&
		!recoveryPending;

	return (
		<section
			aria-labelledby="order-dispatch-heading"
			className="order-detail-card order-dispatch-card"
		>
			<div className="order-detail-heading">
				{orderStatus === "ready" ? (
					<FileCheck2 aria-hidden="true" size={18} />
				) : (
					<Truck aria-hidden="true" size={18} />
				)}
				<h2 id="order-dispatch-heading">
					{orderStatus === "ready" ? "Expedição e nota fiscal" : "Em entrega"}
				</h2>
			</div>

			{!fiscalStatus ? (
				<p className="order-detail-muted">{feedbackMessage(fiscalError)}</p>
			) : (
				<>
					<div className="order-dispatch-fiscal-summary">
						<div>
							<span>Nota fiscal</span>
							<strong>
								{fiscalStatus.authorized
									? "Autorizada"
									: "Aguardando autorização"}
							</strong>
						</div>
						<div>
							<span>Número</span>
							<strong>
								{fiscalStatus.invoiceNumber ?? "Ainda não disponível"}
							</strong>
						</div>
						<div>
							<span>Sefaz</span>
							<strong>{fiscalStatus.sefazStatus ?? "Sem retorno"}</strong>
						</div>
					</div>

					{!fiscalStatus.authorized ? (
						<div className="order-dispatch-note" role="status">
							<p>
								A expedição só é liberada quando a Sefaz autorizar a nota. A
								emissão fiscal será habilitada na etapa final do projeto.
							</p>
							{!fiscalIssuanceEnabled ? (
								<p>
									A emissão de NF-e permanece fora desta fase. O comando manual
									será habilitado somente no marco final.
								</p>
							) : null}
							{recoveryPending ? (
								<p>
									Há uma tentativa fiscal em reconciliação. Aguarde a
									recuperação antes de solicitar outra emissão.
								</p>
							) : null}
							{fiscalIssuanceEnabled &&
							!fiscalStatus.canIssue &&
							!recoveryPending ? (
								<p>
									O gateway ainda não liberou a emissão manual para este pedido.
								</p>
							) : null}
							{fiscalIssueAllowed ? (
								<form action={fiscalFormAction} className="order-dispatch-form">
									<input name="orderId" type="hidden" value={orderId} />
									<label className="order-separation-acknowledgement">
										<input
											name="confirmFiscalIssue"
											required
											type="checkbox"
											value="yes"
										/>
										<span>
											Confirmo a solicitação de emissão da NF-e deste pedido no
											Bling.
										</span>
									</label>
									<button
										className="button button--primary"
										disabled={fiscalPending}
										type="submit"
									>
										{fiscalPending
											? "Solicitando NF-e…"
											: "Solicitar NF-e no Bling"}
									</button>
									<ActionFeedback state={fiscalState} />
								</form>
							) : null}
						</div>
					) : null}

					{orderStatus === "ready" && dispatchAllowed ? (
						<form action={formAction} className="order-dispatch-form">
							<input name="orderId" type="hidden" value={orderId} />
							<label className="order-separation-acknowledgement">
								<input
									name="confirmDispatch"
									required
									type="checkbox"
									value="yes"
								/>
								<span>
									Confirmo a saída para entrega. Se o Bling for a autoridade de
									estoque, esta ação também movimenta o estoque físico.
								</span>
							</label>
							<button
								className="button button--primary"
								disabled={pending}
								type="submit"
							>
								{pending ? "Iniciando expedição…" : "Iniciar expedição"}
							</button>
							<ActionFeedback state={state} />
						</form>
					) : orderStatus === "ready" ? (
						<p className="order-detail-muted">
							{fiscalStatus.authorized
								? "A autorização fiscal ainda não liberou a saída para entrega."
								: "Nenhuma saída para entrega será iniciada enquanto a NF-e não estiver autorizada."}
						</p>
					) : (
						<p className="order-detail-muted">
							O pedido está em rota. A confirmação da entrega será registrada
							após concluir o fluxo de pagamento e recebimento.
						</p>
					)}
				</>
			)}
		</section>
	);
}

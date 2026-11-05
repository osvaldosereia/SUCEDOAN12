"use client";

import { RotateCcw } from "lucide-react";
import { useActionState } from "react";
import {
	recoverOrderBlingAction,
	type SeparationActionState,
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

export function BlingRecoveryPanel({ orderId }: { orderId: string }) {
	const [state, formAction, pending] = useActionState(
		recoverOrderBlingAction,
		INITIAL_ACTION_STATE,
	);

	return (
		<section
			aria-labelledby="bling-recovery-heading"
			className="order-detail-card order-separation-card"
		>
			<div className="order-detail-heading">
				<RotateCcw aria-hidden="true" size={18} />
				<h2 id="bling-recovery-heading">Integração com o Bling</h2>
			</div>
			<p className="order-detail-muted">
				Revalida a venda e a situação operacional deste pedido já separado. O
				comando manual de emissão fiscal não é chamado; a ação só pode rodar
				quando o gateway comprova que a emissão está desativada.
			</p>
			<form action={formAction} className="order-separation-completion">
				<input name="orderId" type="hidden" value={orderId} />
				<label className="order-separation-acknowledgement">
					<input name="confirmRecovery" required type="checkbox" value="yes" />
					<span>Confirmo reconciliar o pedido separado com o Bling.</span>
				</label>
				<button
					className="button button--secondary"
					disabled={pending}
					type="submit"
				>
					<RotateCcw aria-hidden="true" size={15} />
					{pending ? "Consultando Bling…" : "Reconciliar pedido"}
				</button>
			</form>
			<ActionFeedback state={state} />
		</section>
	);
}

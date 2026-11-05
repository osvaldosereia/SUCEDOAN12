"use client";

import { MapPinCheckInside } from "lucide-react";
import { useActionState } from "react";
import type { OrderFiscalStatus } from "@/lib/supabase/admin-orders";
import {
	completeOrderDeliveryAction,
	finalizeCapturedOrderDeliveryAction,
	type SeparationActionState,
} from "../actions";

const INITIAL_ACTION_STATE: SeparationActionState = {
	kind: "idle",
	message: "",
};

const PAYMENT_METHODS = [
	{ value: "pix", label: "Pix" },
	{ value: "cash", label: "Dinheiro" },
	{ value: "credit_card", label: "Cartão de crédito" },
	{ value: "food_card", label: "Cartão alimentação" },
	{ value: "meal_card", label: "Cartão refeição" },
	{ value: "other", label: "Outra forma" },
] as const;

const RECORDED_PAYMENT_STATES = new Set(["captured", "synced", "needs_review"]);

const money = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

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

function FinalizeRecordedPayment({ orderId }: { orderId: string }) {
	const [state, formAction, pending] = useActionState(
		finalizeCapturedOrderDeliveryAction,
		INITIAL_ACTION_STATE,
	);

	return (
		<form action={formAction} className="order-delivery-form">
			<input name="orderId" type="hidden" value={orderId} />
			<p>
				O pagamento da entrega já está registrado. Confirme apenas o recebimento
				do pedido; nenhum novo pagamento será lançado.
			</p>
			<label className="order-separation-acknowledgement">
				<input name="confirmDelivery" required type="checkbox" value="yes" />
				<span>Confirmo que o pedido foi entregue ao cliente.</span>
			</label>
			<button
				className="button button--primary"
				disabled={pending}
				type="submit"
			>
				{pending ? "Finalizando…" : "Confirmar entrega"}
			</button>
			<ActionFeedback state={state} />
		</form>
	);
}

function CaptureDeliveryPayment({
	orderId,
	totalCents,
}: {
	orderId: string;
	totalCents: number;
}) {
	const [state, formAction, pending] = useActionState(
		completeOrderDeliveryAction,
		INITIAL_ACTION_STATE,
	);

	return (
		<form action={formAction} className="order-delivery-form">
			<input name="orderId" type="hidden" value={orderId} />
			<input name="amountCents" type="hidden" value={totalCents} />
			<label className="order-delivery-payment-field">
				<span>Forma de pagamento recebida</span>
				<select defaultValue="" name="paymentMethod" required>
					<option disabled value="">
						Selecione a forma recebida
					</option>
					{PAYMENT_METHODS.map((method) => (
						<option key={method.value} value={method.value}>
							{method.label}
						</option>
					))}
				</select>
			</label>
			<p>
				Valor a receber: <strong>{money.format(totalCents / 100)}</strong>
			</p>
			<label className="order-separation-acknowledgement">
				<input name="confirmDelivery" required type="checkbox" value="yes" />
				<span>
					Confirmo que entreguei o pedido e recebi o valor total acima.
				</span>
			</label>
			<button
				className="button button--primary"
				disabled={pending}
				type="submit"
			>
				{pending ? "Concluindo entrega…" : "Registrar pagamento e concluir"}
			</button>
			<ActionFeedback state={state} />
		</form>
	);
}

export function OrderDeliveryPanel({
	orderId,
	orderStatus,
	totalCents,
	fiscalStatus,
}: {
	orderId: string;
	orderStatus: string;
	totalCents: number;
	fiscalStatus: OrderFiscalStatus | null;
}) {
	if (orderStatus !== "out_for_delivery") return null;

	const paymentStatus = fiscalStatus?.paymentStatus ?? "";
	const paymentSource = fiscalStatus?.paymentSource ?? null;
	const paymentRecorded = RECORDED_PAYMENT_STATES.has(paymentStatus);
	const deliveryPaymentRecorded =
		paymentRecorded && paymentSource === "delivery";
	const paymentRecordedElsewhere = paymentRecorded && !deliveryPaymentRecorded;
	const canCapturePayment =
		paymentStatus === "pending" && paymentSource === null;

	return (
		<section
			aria-labelledby="order-delivery-heading"
			className="order-detail-card order-delivery-card"
		>
			<div className="order-detail-heading">
				<MapPinCheckInside aria-hidden="true" size={18} />
				<h2 id="order-delivery-heading">Concluir entrega</h2>
			</div>

			{!fiscalStatus ? (
				<p className="order-detail-muted">
					Não foi possível confirmar o estado do pagamento. Atualize a ficha
					antes de finalizar a entrega.
				</p>
			) : deliveryPaymentRecorded ? (
				<FinalizeRecordedPayment orderId={orderId} />
			) : paymentRecordedElsewhere ? (
				<p className="order-delivery-review" role="status">
					Já existe um pagamento registrado fora do fluxo de entrega. A
					confirmação automática foi bloqueada para evitar duplicidade; revise a
					origem do pagamento antes de concluir.
				</p>
			) : !canCapturePayment ? (
				<p className="order-delivery-review" role="status">
					O gateway ainda não confirmou que este pedido pode receber um
					pagamento pela entrega. Atualize a ficha e revise a origem antes de
					continuar.
				</p>
			) : (
				<CaptureDeliveryPayment orderId={orderId} totalCents={totalCents} />
			)}
		</section>
	);
}

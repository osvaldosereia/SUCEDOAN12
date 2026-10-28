"use server";

import { revalidatePath } from "next/cache";
import {
	isAdminBlingOrderRecoveryEnabled,
	isAdminFiscalIssuanceEnabled,
} from "@/lib/admin-rollout";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { isOrderSeparatorKey } from "@/lib/orders/separators";
import {
	assignOrderSeparator,
	completeOrderDelivery,
	completeOrderSeparation,
	finalizeCapturedOrderDelivery,
	getAdminOrderBoard,
	getAdminOrderDetail,
	getAdminOrderFiscalStatus,
	issueOrderFiscal,
	type OrderBoardResult,
	type OrderLane,
	type OrderMutationError,
	recoverAdminOrderBling,
	setOrderSeparationItem,
	startOrderDispatch,
} from "@/lib/supabase/admin-orders";

export type OrderBoardActionState = {
	lane: OrderLane;
	query: string;
	offset: number;
	result: OrderBoardResult;
};

const LANES = new Set<OrderLane>(["new", "separate", "ready", "delivered"]);
const PAGE_SIZE = 5;
const DELIVERY_PAYMENT_METHODS = new Set([
	"pix",
	"cash",
	"credit_card",
	"food_card",
	"meal_card",
	"other",
]);
const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SeparationActionState = {
	kind: "idle" | "success" | "error";
	message: string;
};

function safeLane(
	value: FormDataEntryValue | null,
	fallback: OrderLane,
): OrderLane {
	return typeof value === "string" && LANES.has(value as OrderLane)
		? (value as OrderLane)
		: fallback;
}

function safeQuery(value: FormDataEntryValue | null): string {
	if (typeof value !== "string") return "";
	return Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.trim()
		.slice(0, 80);
}

function safeOffset(value: FormDataEntryValue | null): number {
	if (typeof value !== "string" || !/^\d+$/.test(value)) return 0;
	return Math.min(50_000, Math.floor(Number(value) / PAGE_SIZE) * PAGE_SIZE);
}

export async function orderBoardAction(
	previous: OrderBoardActionState,
	formData: FormData,
): Promise<OrderBoardActionState> {
	await requireAdminSession();
	const intent = formData.get("intent");
	const lane = safeLane(formData.get("lane"), previous.lane);
	const query = safeQuery(formData.get("query"));
	let offset = safeOffset(formData.get("offset"));

	if (intent === "search") offset = 0;
	if (intent === "next") offset = Math.min(50_000, offset + PAGE_SIZE);
	if (intent === "previous") offset = Math.max(0, offset - PAGE_SIZE);

	const result = await getAdminOrderBoard({ lane, query, offset });
	return {
		lane,
		query,
		offset,
		result: {
			...result,
			counts: result.counts ?? previous.result.counts,
		},
	};
}

function field(formData: FormData, name: string, max = 120): string {
	const value = formData.get(name);
	if (typeof value !== "string") return "";
	return Array.from(value, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return code >= 32 && code !== 127 ? character : " ";
	})
		.join("")
		.trim()
		.slice(0, max);
}

function orderPath(orderId: string): string {
	return ["/pedidos", orderId].join("/");
}

function actionErrorMessage(error: OrderMutationError): string {
	const messages: Record<OrderMutationError, string> = {
		not_configured: "A conexão do Admin ainda não está configurada.",
		not_authenticated: "Entre novamente para continuar.",
		not_authorized: "Esta conta não tem permissão para alterar este pedido.",
		conflict:
			"O pedido ou a integração mudou. Atualize a ficha e confira as pendências antes de repetir.",
		fiscal_blocked:
			"A expedição exige uma NF-e autorizada. Confira a situação fiscal do pedido.",
		invalid_input: "Confira os dados informados e tente novamente.",
		unavailable:
			"Não foi possível salvar agora. Confira o pedido antes de repetir.",
	};
	return messages[error];
}

export async function startOrderDispatchAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	const orderId = field(formData, "orderId", 36);
	if (!UUID.test(orderId)) {
		return { kind: "error", message: "O pedido selecionado é inválido." };
	}
	if (field(formData, "confirmDispatch", 3) !== "yes") {
		return {
			kind: "error",
			message:
				"Confirme a saída para entrega e a possível movimentação de estoque.",
		};
	}

	const current = await getAdminOrderDetail(orderId);
	if (current.order?.status !== "ready") {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: "O pedido precisa estar pronto para expedição.",
		};
	}
	const fiscal = current.order.fiscalStatus
		? { status: current.order.fiscalStatus, error: current.order.fiscalError }
		: await getAdminOrderFiscalStatus(orderId);
	if (!fiscal.status?.authorized || !fiscal.status.canDispatch) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				fiscal.error === "fiscal_blocked"
					? actionErrorMessage(fiscal.error)
					: "A expedição está bloqueada até a autorização fiscal no Bling.",
		};
	}

	const result = await startOrderDispatch(orderId);
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(orderPath(orderId));
	return {
		kind: "success",
		message: result.physicalStockPending
			? "Expedição iniciada. A movimentação de estoque ficou pendente e entrou em recuperação."
			: result.physicalStockSynced
				? "Expedição iniciada e movimentação de estoque sincronizada com o Bling."
				: "Expedição iniciada após a autorização fiscal.",
	};
}

export async function issueOrderFiscalAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	if (!isAdminFiscalIssuanceEnabled()) {
		return {
			kind: "error",
			message:
				"A emissão de NF-e será habilitada somente na etapa final do projeto. Nenhuma solicitação foi enviada.",
		};
	}
	const orderId = field(formData, "orderId", 36);
	if (!UUID.test(orderId)) {
		return { kind: "error", message: "O pedido selecionado é inválido." };
	}
	if (field(formData, "confirmFiscalIssue", 3) !== "yes") {
		return {
			kind: "error",
			message: "Confirme a solicitação de emissão da NF-e no Bling.",
		};
	}

	const current = await getAdminOrderDetail(orderId);
	if (current.order?.status !== "ready") {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				"A NF-e só pode ser solicitada quando o pedido está em Expedição.",
		};
	}
	const fiscal = current.order.fiscalStatus
		? { status: current.order.fiscalStatus, error: current.order.fiscalError }
		: await getAdminOrderFiscalStatus(orderId);
	if (!fiscal.status) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: actionErrorMessage(fiscal.error ?? "unavailable"),
		};
	}
	if (!fiscal.status.canIssue) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: fiscal.status.blockers.includes(
				"invoice_generation_recovery_required",
			)
				? "Há uma emissão em reconciliação. Aguarde a recuperação antes de solicitar outra."
				: !fiscal.status.issueEnabled
					? "A configuração fiscal atual não liberou a emissão manual."
					: "O gateway fiscal ainda não liberou a emissão deste pedido.",
		};
	}

	const result = await issueOrderFiscal(orderId);
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(orderPath(orderId));
	if (result.alreadyAuthorized) {
		return {
			kind: "success",
			message: result.invoiceNumber
				? `A NF-e ${result.invoiceNumber} já está autorizada.`
				: "A NF-e já está autorizada. A ficha foi atualizada.",
		};
	}
	if (result.stage === "rejected") {
		return {
			kind: "error",
			message:
				"O Bling informou que a NF-e foi rejeitada. Revise o retorno fiscal no Bling; a expedição continua bloqueada até a autorização da Sefaz.",
		};
	}
	return {
		kind: "success",
		message:
			result.stage === "processing" || !result.requestAccepted
				? "O Bling está processando a solicitação. A expedição só será liberada após a autorização da Sefaz."
				: "Solicitação enviada ao Bling. A expedição só será liberada após a autorização da Sefaz.",
	};
}

export async function recoverOrderBlingAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	if (!isAdminBlingOrderRecoveryEnabled()) {
		return {
			kind: "error",
			message: "A recuperação manual do Bling está desativada neste ambiente.",
		};
	}

	const orderId = field(formData, "orderId", 36);
	if (!UUID.test(orderId)) {
		return { kind: "error", message: "O pedido selecionado é inválido." };
	}
	if (field(formData, "confirmRecovery", 3) !== "yes") {
		return {
			kind: "error",
			message: "Confirme a reconciliação do pedido já separado com o Bling.",
		};
	}

	const current = await getAdminOrderDetail(orderId);
	const separation = current.order?.separation;
	if (
		current.order?.status !== "ready" ||
		current.order.fiscalStatus?.issueEnabled !== false ||
		!separation?.completion?.completedAt ||
		separation.items.length === 0 ||
		separation.counts.pending > 0 ||
		separation.counts.missing > 0 ||
		separation.items.some((item) => item.state !== "separated")
	) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				"A recuperação exige separação física concluída e emissão fiscal comprovadamente desativada.",
		};
	}

	const result = await recoverAdminOrderBling(orderId);
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	if (!result.recovered) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				"O Bling não confirmou a recuperação. Atualize a ficha e confira antes de tentar novamente.",
		};
	}

	revalidatePath(orderPath(orderId));
	return {
		kind: "success",
		message:
			"Pedido reconciliado com o Bling. Confira a situação atualizada na ficha.",
	};
}

function cents(value: FormDataEntryValue | null): number | null {
	if (typeof value !== "string" || !/^\d{1,12}$/.test(value)) return null;
	const amount = Number(value);
	return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function deliveryPaymentAlreadyRecorded(
	order: NonNullable<Awaited<ReturnType<typeof getAdminOrderDetail>>["order"]>,
): boolean {
	const paymentStatus = order.fiscalStatus?.paymentStatus;
	return (
		["captured", "synced", "needs_review"].includes(paymentStatus ?? "") &&
		order.fiscalStatus?.paymentSource === "delivery"
	);
}

export async function completeOrderDeliveryAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	const orderId = field(formData, "orderId", 36);
	const method = field(formData, "paymentMethod", 30);
	const amountCents = cents(formData.get("amountCents"));
	if (
		!UUID.test(orderId) ||
		!DELIVERY_PAYMENT_METHODS.has(method) ||
		!amountCents
	) {
		return {
			kind: "error",
			message: "Confira a forma de pagamento e o valor recebido.",
		};
	}
	if (field(formData, "confirmDelivery", 3) !== "yes") {
		return {
			kind: "error",
			message: "Confirme que a entrega foi realizada e o valor foi recebido.",
		};
	}

	const current = await getAdminOrderDetail(orderId);
	if (current.order?.status !== "out_for_delivery") {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: "Este pedido não está mais em rota de entrega.",
		};
	}
	if (amountCents !== current.order.totalCents) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: "O valor recebido precisa corresponder ao total do pedido.",
		};
	}
	if (deliveryPaymentAlreadyRecorded(current.order)) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				"O pagamento já foi registrado. Use a confirmação de entrega sem registrar outro recebimento.",
		};
	}
	if (
		current.order.fiscalStatus?.paymentStatus !== "pending" ||
		current.order.fiscalStatus.paymentSource !== null
	) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				"O gateway não confirmou que este pedido pode receber um novo pagamento. Atualize a ficha e revise a origem do pagamento.",
		};
	}

	const result = await completeOrderDelivery({
		orderId,
		method: method as
			| "pix"
			| "cash"
			| "credit_card"
			| "food_card"
			| "meal_card"
			| "other",
		amountCents,
	});
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(orderPath(orderId));
	return {
		kind: "success",
		message: result.blingPending
			? "Entrega concluída. A sincronização com o Bling ficou pendente e entrou em recuperação."
			: result.blingSynced
				? "Entrega concluída, pagamento registrado e situação sincronizada com o Bling."
				: "Entrega concluída. Confira a situação do Bling no painel de atenção.",
	};
}

export async function finalizeCapturedOrderDeliveryAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	const orderId = field(formData, "orderId", 36);
	if (!UUID.test(orderId)) {
		return { kind: "error", message: "O pedido selecionado é inválido." };
	}
	if (field(formData, "confirmDelivery", 3) !== "yes") {
		return {
			kind: "error",
			message: "Confirme que a entrega foi realizada.",
		};
	}
	const current = await getAdminOrderDetail(orderId);
	if (
		current.order?.status !== "out_for_delivery" ||
		!deliveryPaymentAlreadyRecorded(current.order)
	) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message:
				"Não há pagamento de entrega confirmado para finalizar este pedido.",
		};
	}
	const result = await finalizeCapturedOrderDelivery(orderId);
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(orderPath(orderId));
	return {
		kind: "success",
		message: result.blingPending
			? "Entrega concluída. A sincronização com o Bling ficou pendente e entrou em recuperação."
			: result.blingSynced
				? "Entrega concluída e situação sincronizada com o Bling."
				: "Entrega concluída. Confira a situação do Bling no painel de atenção.",
	};
}

export async function assignOrderSeparatorAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	const orderId = field(formData, "orderId", 36);
	const separatorKey = field(formData, "separatorKey", 30);
	if (!UUID.test(orderId) || !isOrderSeparatorKey(separatorKey)) {
		return { kind: "error", message: "Selecione um responsável válido." };
	}

	const result = await assignOrderSeparator({ orderId, separatorKey });
	if (!result.ok) {
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(`/pedidos/${orderId}`);
	return { kind: "success", message: "Responsável pela separação registrado." };
}

export async function setOrderSeparationItemAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	const orderId = field(formData, "orderId", 36);
	const orderItemId = field(formData, "orderItemId", 80);
	const expectedOrderUpdatedAt = field(formData, "expectedOrderUpdatedAt", 80);
	const separatorKey = field(formData, "separatorKey", 30);
	const state = field(formData, "state", 20);
	if (
		!UUID.test(orderId) ||
		!UUID.test(orderItemId) ||
		!Number.isFinite(Date.parse(expectedOrderUpdatedAt)) ||
		!isOrderSeparatorKey(separatorKey) ||
		(state !== "separated" && state !== "missing")
	) {
		return { kind: "error", message: "Os dados da separação estão inválidos." };
	}

	const current = await getAdminOrderDetail(orderId);
	const separation = current.order?.separation;
	if (
		!current.order ||
		!separation ||
		separation.orderUpdatedAt !== expectedOrderUpdatedAt ||
		separation.assignment?.separatorKey !== separatorKey
	) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: "O pedido mudou. Atualize a ficha antes de continuar.",
		};
	}
	if (
		separation.status === "confirmed" &&
		field(formData, "confirmBlingSync", 3) !== "yes"
	) {
		return {
			kind: "error",
			message:
				"Confirme que entendeu a tentativa de sincronização com o Bling.",
		};
	}

	const result = await setOrderSeparationItem({
		orderId,
		orderItemId,
		state,
		expectedOrderUpdatedAt,
		separatorKey,
	});
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(`/pedidos/${orderId}`);
	return {
		kind: "success",
		message:
			result.warning === "bling_approval_pending"
				? "Item registrado. A aprovação no Bling ficou pendente; confira a atenção do pedido."
				: state === "separated"
					? "Item marcado como separado."
					: "Item marcado como indisponível.",
	};
}

export async function completeOrderSeparationAction(
	_previous: SeparationActionState,
	formData: FormData,
): Promise<SeparationActionState> {
	await requireAdminSession();
	const orderId = field(formData, "orderId", 36);
	const expectedOrderUpdatedAt = field(formData, "expectedOrderUpdatedAt", 80);
	if (
		!UUID.test(orderId) ||
		!Number.isFinite(Date.parse(expectedOrderUpdatedAt))
	) {
		return { kind: "error", message: "A versão do pedido está inválida." };
	}
	if (field(formData, "confirmCompletion", 3) !== "yes") {
		return {
			kind: "error",
			message:
				"Confirme a baixa de estoque, o aviso ao cliente e o início das integrações.",
		};
	}

	const current = await getAdminOrderDetail(orderId);
	const separation = current.order?.separation;
	if (
		!current.order ||
		!separation ||
		separation.orderUpdatedAt !== expectedOrderUpdatedAt
	) {
		revalidatePath(orderPath(orderId));
		return {
			kind: "error",
			message: "O pedido mudou. Atualize a ficha antes de concluir.",
		};
	}
	if (
		!separation.assignment?.separatorKey ||
		separation.items.length === 0 ||
		separation.counts.pending > 0 ||
		separation.counts.missing > 0 ||
		separation.items.some((item) => item.state !== "separated")
	) {
		return {
			kind: "error",
			message:
				"Marque todos os itens como separados antes de concluir esta etapa.",
		};
	}
	if (!isAdminFiscalIssuanceEnabled()) {
		const fiscal = await getAdminOrderFiscalStatus(orderId);
		if (!fiscal.status || fiscal.status.issueEnabled) {
			revalidatePath(orderPath(orderId));
			return {
				kind: "error",
				message:
					"Separação bloqueada: não foi possível confirmar que a emissão fiscal automática está desativada. A emissão será liberada na etapa final.",
			};
		}
	}

	const result = await completeOrderSeparation({
		orderId,
		expectedOrderUpdatedAt,
	});
	if (!result.ok) {
		revalidatePath(orderPath(orderId));
		return { kind: "error", message: actionErrorMessage(result.error) };
	}
	revalidatePath(`/pedidos/${orderId}`);
	return {
		kind: "success",
		message:
			result.customerNotified === false
				? "Separação concluída e estoque atualizado. A notificação ao cliente não foi confirmada; confira a fila de atendimento."
				: result.integrationsQueued
					? "Separação concluída. Estoque atualizado, cliente avisado e integrações do pedido enfileiradas."
					: "Separação concluída. Estoque atualizado e cliente avisado.",
	};
}

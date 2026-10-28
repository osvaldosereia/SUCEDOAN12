import {
	AlertCircle,
	ArrowUpRight,
	Clock3,
	MessageCircle,
	Package,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import {
	type AttendanceContext,
	type AttendanceConversation,
	type AttendanceLibraryItem,
	type AttendanceQueueItem,
	type AttendanceQuickReply,
	getAttendanceAccounts,
	getAttendanceContext,
	getAttendanceConversation,
	getAttendanceLibraryItems,
	getAttendanceQueue,
	getAttendanceQuickReplies,
} from "@/lib/supabase/admin-attendance";
import { getAdminFlowConfiguration } from "@/lib/supabase/admin-flow-configuration";
import {
	type AdminIdentityReview,
	type AdminIdentityReviewState,
	getAdminIdentityReviews,
} from "@/lib/supabase/admin-identity-reviews";
import {
	type AdminWhatsAppOrderIntent,
	getAdminWhatsAppOrderIntents,
} from "@/lib/supabase/admin-order-intents";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import { MessageMedia } from "./message-media";
import {
	acknowledgeIdentityReview,
	prepareCatalogOrderIntent,
	sendBasketFlow,
	sendCatalogOrderConfirmation,
} from "./review-actions";
import { TemplateMessageComposer } from "./template-message-composer";

type SearchParams = Record<string, string | string[] | undefined>;

function value(input: string | string[] | undefined): string {
	return Array.isArray(input) ? (input[0] ?? "") : (input ?? "");
}

function href(input: {
	accountId: string;
	conversationId?: string;
	search: string;
}): string {
	const params = new URLSearchParams();
	params.set("account_id", input.accountId);
	if (input.conversationId) params.set("conversation_id", input.conversationId);
	if (input.search) params.set("search", input.search);
	return `/atendimento?${params.toString()}`;
}

function identityReviewHref(input: {
	state: AdminIdentityReviewState;
	accountId: string;
	conversationId?: string;
	search: string;
}): string {
	const params = new URLSearchParams({
		account_id: input.accountId,
		identity_state: input.state,
	});
	if (input.conversationId) params.set("conversation_id", input.conversationId);
	if (input.search) params.set("search", input.search);
	return `/atendimento?${params.toString()}#identidades-sem-telefone`;
}

function dateTime(date: string | null): string {
	if (!date) return "";
	const parsed = new Date(date);
	return Number.isNaN(parsed.getTime())
		? ""
		: parsed.toLocaleString("pt-BR", {
				dateStyle: "short",
				timeStyle: "short",
			});
}

function dateOnly(date: string | null): string {
	if (!date) return "";
	const parsed = new Date(date);
	return Number.isNaN(parsed.getTime())
		? ""
		: parsed.toLocaleDateString("pt-BR");
}

function money(amount: number | null): string {
	return amount == null
		? "—"
		: new Intl.NumberFormat("pt-BR", {
				style: "currency",
				currency: "BRL",
			}).format(amount);
}

function messagePreview(item: AttendanceQueueItem): string {
	if (item.lastMessageType === "order") return "Enviou um carrinho do catálogo";
	if (["interactive", "button"].includes(item.lastMessageType)) {
		return item.lastMessageDirection === "outbound"
			? "Mensagem interativa enviada"
			: "Resposta interativa recebida";
	}
	if (item.lastMessageText !== "Sem mensagem de texto") {
		return item.lastMessageText;
	}
	if (item.lastMessageType === "image") return "Enviou uma imagem";
	if (item.lastMessageType === "audio") return "Enviou um áudio";
	if (item.lastMessageType === "video") return "Enviou um vídeo";
	return "Mensagem recebida";
}

function messageStatus(status: string): string {
	const labels: Record<string, string> = {
		queued: "Na fila",
		sending: "Enviando",
		sent: "Enviada",
		delivered: "Entregue",
		read: "Lida",
		failed: "Falhou",
		accepted: "Aceita",
		needs_review: "Conferir envio",
	};
	return labels[status] ?? "Enviada";
}

function messageTypeLabel(type: string, direction: string): string {
	const sent = direction === "outbound";
	const labels: Record<string, string> = {
		image: sent ? "Imagem enviada" : "Imagem recebida",
		audio: sent ? "Áudio enviado" : "Áudio recebido",
		video: sent ? "Vídeo enviado" : "Vídeo recebido",
		document: sent ? "Documento enviado" : "Documento recebido",
		sticker: sent ? "Figurinha enviada" : "Figurinha recebida",
		order: sent
			? "Carrinho do catálogo enviado"
			: "Carrinho recebido pelo catálogo do WhatsApp",
		interactive: sent
			? "Mensagem interativa enviada"
			: "Mensagem interativa recebida",
		button: sent ? "Botão enviado" : "Resposta de botão recebida",
		location: sent ? "Localização enviada" : "Localização recebida",
		contacts: sent ? "Contato enviado" : "Contato recebido",
		reaction: sent ? "Reação enviada" : "Reação recebida",
		unknown: sent ? "Mensagem enviada" : "Mensagem recebida",
	};
	return labels[type] ?? "Mensagem recebida";
}

function supportsMediaPreview(type: string): boolean {
	return ["image", "audio", "video", "document", "sticker"].includes(type);
}

function intentStatus(status: AdminWhatsAppOrderIntent["status"]): string {
	const labels: Record<AdminWhatsAppOrderIntent["status"], string> = {
		received: "Recebido",
		needs_review: "Precisa de revisão",
		awaiting_confirmation: "Aguardando confirmação",
		reprice_required: "Novo valor para confirmar",
		declined: "Recusado",
		converted: "Pedido criado",
	};
	return labels[status];
}

function paymentMethodLabel(value: string): string {
	const labels: Record<string, string> = {
		pix: "Pix",
		cash: "Dinheiro",
		debit_card: "Cartão de débito",
		credit_card: "Cartão de crédito",
		food_card: "Vale-alimentação",
		meal_card: "Vale-refeição",
	};
	return labels[value] ?? "Selecione";
}

function orderStatus(status: string | null): string | null {
	if (!status) return null;
	const labels: Record<string, string> = {
		confirmed: "Em produção",
		sent_to_bling: "Enviado ao Bling",
		processing: "Em produção",
		ready: "Pronto para expedição",
		out_for_delivery: "Em entrega",
		delivered: "Entregue",
		cancelled: "Cancelado",
		returned: "Devolvido",
		storefront_received: "Novo",
	};
	return labels[status] ?? "Pedido";
}

function noticeText(notice: string): string | null {
	const notices: Record<string, string> = {
		catalog_prepared:
			"Dados salvos no rascunho interno. Nenhuma mensagem foi enviada e nenhum pedido foi criado.",
		catalog_confirmation_sent:
			"Resumo enviado ao cliente. O pedido só será criado depois que ele confirmar.",
		catalog_confirmation_sending:
			"O envio está sendo processado. Confira a conversa antes de tentar novamente.",
		catalog_confirmation_reprice_required:
			"O preço mudou. Revise o carrinho e envie um novo resumo ao cliente.",
		catalog_confirmation_delivery_unknown:
			"A Meta não confirmou o envio. Confira a conversa antes de qualquer nova tentativa.",
		catalog_confirmation_failed:
			"O resumo não foi enviado. Revise a situação do carrinho antes de tentar novamente.",
		catalog_confirmation_needs_review:
			"O carrinho precisa de revisão antes de enviar o resumo.",
		catalog_confirmation_invalid:
			"Este carrinho não é válido para confirmação.",
		catalog_confirmation_identity_unavailable:
			"Não foi possível confirmar o telefone do cliente.",
		catalog_confirmation_customer_conflict:
			"O telefone está ligado a cadastros diferentes. Revise o cliente.",
		catalog_confirmation_customer_name_missing:
			"Informe o nome do cliente para continuar.",
		catalog_confirmation_address_invalid: "Confira o endereço de entrega.",
		catalog_confirmation_address_unavailable:
			"O endereço salvo não pertence ao cadastro ativo deste telefone.",
		catalog_confirmation_payment_missing:
			"Selecione a forma de pagamento antes de enviar.",
		catalog_confirmation_quote_unavailable:
			"Não foi possível validar os preços atuais do carrinho.",
		catalog_confirmation_items_invalid:
			"Confira os produtos e quantidades deste carrinho.",
		catalog_confirmation_summary_too_long:
			"O resumo excede o limite de mensagem. Revise os produtos ou o endereço.",
		catalog_confirmation_outbox_missing:
			"Não foi possível localizar a mensagem de confirmação deste carrinho.",
		catalog_confirmation_outbox_conflict:
			"Há uma mensagem anterior que precisa de revisão antes de continuar.",
		catalog_confirmation_dispatch_unavailable:
			"O serviço de envio não respondeu. Confira o status antes de tentar novamente.",
		catalog_preparation_invalid:
			"Confira os dados do cliente, endereço e pagamento.",
		catalog_intent_not_ready:
			"Este carrinho precisa de revisão antes de preparar a confirmação.",
		intent_not_found: "Este carrinho não está mais disponível.",
		flow_send_sent:
			"Flow enviado. O pedido só será criado depois que o cliente concluir e confirmar o resumo.",
		flow_send_processing:
			"O Flow está sendo processado. Confira o status antes de tentar novamente.",
		flow_send_needs_review:
			"O envio pode ter sido aceito. Confira a conversa e confirme com o cliente antes de iniciar outro Flow.",
		flow_send_failed:
			"O Flow não foi enviado. Confira a conexão e o vínculo publicado antes de tentar novamente.",
		flow_send_request_invalid: "Confira a conversa e a cesta selecionada.",
		flow_send_prepare_failed:
			"Não foi possível preparar o Flow para esta conversa.",
		flow_send_prepare_response_invalid:
			"Não foi possível validar a preparação do Flow.",
		flow_session_open_failed:
			"Não foi possível abrir uma sessão segura para este Flow.",
		flow_session_response_invalid: "Não foi possível validar a sessão do Flow.",
		flow_send_claim_failed:
			"A sessão do Flow precisa ser conferida antes do envio.",
		flow_sender_config_invalid:
			"A conexão Meta deste número ainda não está pronta para enviar o Flow.",
		flow_binding_not_ready:
			"Este número ainda não tem um Flow publicado, validado e habilitado para envio.",
		flow_recipient_phone_unavailable:
			"Não há um telefone WhatsApp confirmado para esta conversa.",
		flow_account_unavailable:
			"A configuração do número Meta ainda não está pronta.",
		basket_mold_ambiguous:
			"Este modelo de cesta precisa de revisão antes de abrir o Flow.",
		basket_position_has_no_eligible_options:
			"Esta cesta tem etapas sem produto ativo no WhatsApp, com foto e preço. Complete essas opções antes de enviá-la.",
		flow_session_invalid:
			"A sessão do Flow expirou ou não corresponde à cesta selecionada.",
		flow_send_receipt_pending:
			"O envio aconteceu, mas o Admin ainda não recebeu a confirmação técnica. Confira a conversa.",
		catalog_intent_required:
			"A preparação está disponível somente para carrinhos do Catálogo.",
		catalog_customer_phone_conflict:
			"O telefone está vinculado a cadastros diferentes. Revise o cliente antes de continuar.",
		catalog_customer_name_required: "Informe o nome do cliente para continuar.",
		catalog_address_choice_invalid:
			"Escolha um endereço salvo ou cadastre um novo.",
		catalog_address_customer_missing:
			"Cadastre o cliente e o endereço antes de continuar.",
		catalog_address_unavailable:
			"O endereço escolhido não pertence ao cadastro ativo deste telefone.",
		catalog_address_invalid: "Confira os campos do endereço.",
		catalog_address_required: "Escolha ou informe um endereço de entrega.",
		catalog_quote_unavailable:
			"Não foi possível confirmar os vínculos e preços atuais dos produtos.",
		message_accepted: "Mensagem aceita para envio.",
		service_window_closed:
			"A janela de atendimento expirou. Aguarde uma nova mensagem do cliente ou use um modelo aprovado.",
		human_send_not_homologated:
			"O envio por atendente ainda não foi habilitado nesta integração.",
		meta_transport_not_configured:
			"O envio deste número ainda não está configurado.",
		meta_send_uncertain:
			"O provedor não confirmou o envio. Confira a conversa antes de tentar novamente.",
		rate_limited: "Aguarde um instante antes de enviar outra mensagem.",
		invalid_text: "Escreva uma mensagem de até 4.000 caracteres.",
		invalid_conversation: "Não foi possível identificar esta conversa.",
		not_authenticated: "Entre novamente para continuar.",
		not_authorized: "Esta conta não tem acesso ao atendimento.",
		not_configured: "A conexão do Admin ainda não foi configurada.",
		unavailable:
			"Não foi possível concluir a ação. Tente novamente em instantes.",
	};
	return notices[notice] ?? null;
}

function identityReviewNoticeText(notice: string): string | null {
	const notices: Record<string, string> = {
		reviewed: "Evento marcado como revisado.",
		invalid_event: "O evento informado não é válido.",
		not_authorized: "Esta conta não tem acesso à revisão de identidades.",
		not_authenticated: "Entre novamente para continuar.",
		not_configured: "A conexão do Admin ainda não foi configurada.",
		unavailable: "Não foi possível registrar a revisão. Tente novamente.",
		invalid_response: "Não foi possível validar a resposta da revisão.",
	};
	return notices[notice] ?? null;
}

function identityReviewKind(item: AdminIdentityReview): string {
	if (item.intakeKind === "catalog_order") return "Catálogo do WhatsApp";
	if (item.intakeKind === "flow_submission") return "Flow de cesta";
	if (item.intakeKind === "confirmation_reply") return "Confirmação de pedido";
	const labels: Record<string, string> = {
		text: "Mensagem de texto",
		image: "Imagem",
		audio: "Áudio",
		video: "Vídeo",
		document: "Documento",
		sticker: "Figurinha",
		location: "Localização",
		contacts: "Contato",
		interactive: "Mensagem interativa",
		button: "Botão",
		unknown: "Mensagem recebida",
	};
	return labels[item.messageType] ?? "Mensagem recebida";
}

function identityReviewPreview(item: AdminIdentityReview): string {
	if (item.textPreview) return item.textPreview;
	const labels: Record<string, string> = {
		image: "Imagem recebida",
		audio: "Áudio recebido",
		video: "Vídeo recebido",
		document: "Documento recebido",
		sticker: "Figurinha recebida",
		location: "Localização recebida",
		contacts: "Contato recebido",
	};
	return labels[item.messageType] ?? "Sem prévia de texto";
}

function IdentityReviewQueue({
	items,
	state,
	error,
	notice,
	accountId,
	conversationId,
	search,
}: {
	items: AdminIdentityReview[];
	state: AdminIdentityReviewState;
	error: string | null;
	notice: string | null;
	accountId: string;
	conversationId?: string;
	search: string;
}) {
	const pendingHref = identityReviewHref({
		state: "pending",
		accountId,
		conversationId,
		search,
	});
	const acknowledgedHref = identityReviewHref({
		state: "acknowledged",
		accountId,
		conversationId,
		search,
	});

	return (
		<section
			aria-labelledby="identity-review-title"
			className="inbox-filters-card identity-review-card"
			id="identidades-sem-telefone"
		>
			<div className="identity-review-heading">
				<div>
					<p className="eyebrow">REVISÃO MANUAL</p>
					<h2 id="identity-review-title">Mensagens sem telefone verificado</h2>
					<p>
						Cada evento fica separado. Revisar registra que ele foi analisado;
						não associa um cliente nem libera envio ao identificador recebido.
					</p>
				</div>
				<nav aria-label="Estado da revisão" className="identity-review-tabs">
					<Link
						aria-current={state === "pending" ? "page" : undefined}
						href={pendingHref}
					>
						Pendentes
					</Link>
					<Link
						aria-current={state === "acknowledged" ? "page" : undefined}
						href={acknowledgedHref}
					>
						Revisados
					</Link>
				</nav>
			</div>

			{notice && (
				<p className="inbox-notice" role="status">
					{notice}
				</p>
			)}
			{error ? (
				<ErrorPanel message={error} />
			) : items.length ? (
				<ul className="identity-review-list">
					{items.map((item) => (
						<li key={item.eventId}>
							<article className="identity-review-item">
								<div className="identity-review-content">
									<div className="identity-review-topline">
										<strong>
											{item.accountName} · {item.accountPhone}
										</strong>
										<time dateTime={item.receivedAt}>
											{dateTime(item.receivedAt)}
										</time>
									</div>
									<div className="identity-review-meta">
										<span>{identityReviewKind(item)}</span>
										<span>
											Remetente:{" "}
											{item.senderProviderId ?? "identificador ausente"}
										</span>
									</div>
									<p>{identityReviewPreview(item)}</p>
									{item.state === "acknowledged" && item.reviewedAt && (
										<small>Revisado em {dateTime(item.reviewedAt)}</small>
									)}
								</div>
								{item.state === "pending" && (
									<form action={acknowledgeIdentityReview}>
										<input name="event_id" type="hidden" value={item.eventId} />
										<input name="identity_state" type="hidden" value={state} />
										<button className="catalog-submit" type="submit">
											Marcar como revisado
										</button>
									</form>
								)}
							</article>
						</li>
					))}
				</ul>
			) : (
				<div className="identity-review-empty">
					<strong>
						{state === "pending"
							? "Nenhum evento pendente"
							: "Nenhum evento revisado"}
					</strong>
					<p>
						{state === "pending"
							? "Eventos sem telefone confirmado aparecerão aqui."
							: "Os eventos marcados como revisados aparecerão aqui."}
					</p>
				</div>
			)}
		</section>
	);
}

function ErrorPanel({ message }: { message: string }) {
	return (
		<div className="inbox-error" role="status">
			<AlertCircle aria-hidden="true" size={18} />
			<span>{message}</span>
		</div>
	);
}

function ConversationRow({
	item,
	accountId,
	search,
	selected,
}: {
	item: AttendanceQueueItem;
	accountId: string;
	search: string;
	selected: boolean;
}) {
	return (
		<li>
			<Link
				aria-current={selected ? "page" : undefined}
				className={`inbox-conversation${selected ? " inbox-conversation--selected" : ""}`}
				href={href({ accountId, conversationId: item.conversationId, search })}
			>
				<span aria-hidden="true" className="inbox-contact-avatar">
					{item.displayName.slice(0, 1).toUpperCase()}
				</span>
				<span className="inbox-conversation-main">
					<span className="inbox-conversation-heading">
						<strong>{item.displayName}</strong>
						<time dateTime={item.lastMessageAt ?? undefined}>
							{dateTime(item.lastMessageAt)}
						</time>
					</span>
					<span className="inbox-conversation-preview">
						{messagePreview(item)}
					</span>
					<span className="inbox-conversation-tags">
						{item.humanRequired && <span>Precisa de atendimento</span>}
						{item.hasOrder && (
							<span>
								Pedido{item.orderNumber ? ` ${item.orderNumber}` : ""}
							</span>
						)}
						{item.registrationIncomplete && <span>Cadastro incompleto</span>}
						{item.labels.slice(0, 2).map((label) => (
							<span key={label.id}>{label.name}</span>
						))}
					</span>
				</span>
				{item.unreadCount > 0 && (
					<span
						aria-label={`${item.unreadCount} mensagens não lidas`}
						className="inbox-unread-count"
						role="status"
					>
						{item.unreadCount > 99 ? "99+" : item.unreadCount}
					</span>
				)}
			</Link>
		</li>
	);
}

function CustomerContext({
	context,
	conversationId,
	accountId,
	search,
	contactPhone,
	orderIntents,
	orderIntentsUnavailable,
	flowBaskets,
	flowSendAttempts,
	flowSendBlockReason,
	flowSendStatusUnavailable,
	canSendFlow,
	serviceWindowOpen,
}: {
	context: AttendanceContext;
	conversationId: string;
	accountId: string;
	search: string;
	contactPhone: string | null;
	orderIntents: AdminWhatsAppOrderIntent[];
	orderIntentsUnavailable: boolean;
	flowBaskets: Array<{ id: string; name: string }>;
	flowSendAttempts: AttendanceConversation["flowSendAttempts"];
	flowSendBlockReason: string | null;
	flowSendStatusUnavailable: boolean;
	canSendFlow: boolean;
	serviceWindowOpen: boolean;
}) {
	return (
		<div className="inbox-context-content">
			<FlowBasketSender
				accountId={accountId}
				attempts={flowSendAttempts}
				blockReason={flowSendBlockReason}
				canSend={canSendFlow}
				conversationId={conversationId}
				flowBaskets={flowBaskets}
				search={search}
				statusUnavailable={flowSendStatusUnavailable}
				windowOpen={serviceWindowOpen}
			/>
			{context.customer ? (
				<section>
					<h2>Cadastro</h2>
					<strong>{context.customer.name}</strong>
					<span>
						{context.customer.phone ?? contactPhone ?? "Telefone não informado"}
					</span>
					<span>{context.customer.orderCount} pedidos anteriores</span>
				</section>
			) : (
				<section>
					<h2>Cadastro</h2>
					<p>Este contato ainda não está vinculado a um cliente.</p>
				</section>
			)}

			{context.address && (
				<section>
					<h2>Endereço principal</h2>
					<strong>{context.address.label ?? "Entrega"}</strong>
					<p>
						{[
							context.address.street,
							context.address.number,
							context.address.complement,
						]
							.filter(Boolean)
							.join(", ")}
					</p>
					<p>
						{[
							context.address.neighborhood,
							context.address.city,
							context.address.state,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
					{context.address.postalCode && (
						<span>CEP {context.address.postalCode}</span>
					)}
				</section>
			)}

			<section>
				<h2>Pedidos recentes</h2>
				{context.orders.length ? (
					context.orders.slice(0, 3).map((order) => (
						<div className="inbox-context-order" key={order.id}>
							<span>
								<Package aria-hidden="true" size={14} />
								{order.number ? `Pedido ${order.number}` : "Pedido"}
							</span>
							<strong>{money(order.total)}</strong>
							<small>
								{order.status} · {dateOnly(order.createdAt)}
							</small>
						</div>
					))
				) : (
					<p>Nenhum pedido anterior vinculado.</p>
				)}
			</section>

			<section id="pedidos-whatsapp">
				<h2>Pedidos pelo WhatsApp</h2>
				{orderIntentsUnavailable ? (
					<p>Não foi possível carregar os pedidos do Flow e do Catálogo.</p>
				) : orderIntents.length ? (
					orderIntents.map((intent) => (
						<div className="inbox-context-order" key={intent.id}>
							<span>
								<Package aria-hidden="true" size={14} />
								{intent.intentKind === "customer_review"
									? "Revisão de cadastro"
									: intent.source === "flow"
										? "Flow de cesta"
										: "Catálogo do WhatsApp"}
							</span>
							<strong>
								{money(
									intent.source === "catalog"
										? intent.currentEstimateTotalCents === null
											? null
											: intent.currentEstimateTotalCents / 100
										: intent.quoteTotalCents === null
											? null
											: intent.quoteTotalCents / 100,
								)}
							</strong>
							{intent.items.length > 0 ? (
								<div className="inbox-context-intent-items">
									{intent.items.map((item) => (
										<span key={item.key}>
											{item.quantity === null
												? "Quantidade pendente"
												: `${item.quantity} ×`}{" "}
											{item.name}
											{!item.available ? " · conferir" : ""}
										</span>
									))}
								</div>
							) : null}
							{intent.intentKind === "customer_review" ? (
								<small>
									O cadastro associado não pôde ser confirmado no Flow. Nenhum
									pedido ou endereço novo foi criado.
								</small>
							) : null}
							<small>
								{intent.intentKind === "customer_review"
									? "Atendimento humano solicitado"
									: intentStatus(intent.status)}
								{intent.orderStatus
									? ` · ${orderStatus(intent.orderStatus)}`
									: ""}
								{intent.createdAt ? ` · ${dateOnly(intent.createdAt)}` : ""}
							</small>
							{intent.source === "catalog" ? (
								<>
									<small>
										{intent.currentEstimateTotalCents === null
											? "Preço ou vínculo aguardando conferência; ainda não é pedido operacional."
											: "Estimativa pelos preços atuais do Admin; ainda não é pedido operacional."}
									</small>
									{intent.catalogPreparation ? (
										<CatalogIntentPreparation
											accountId={accountId}
											conversationId={conversationId}
											intent={intent}
											search={search}
										/>
									) : null}
								</>
							) : null}
							{intent.orderId && (
								<Link
									className="inbox-context-intent-link"
									href={`/pedidos/${encodeURIComponent(intent.orderId)}`}
								>
									Abrir pedido
									<ArrowUpRight aria-hidden="true" size={13} />
								</Link>
							)}
						</div>
					))
				) : (
					<p>Nenhum pedido iniciado pelo Flow ou Catálogo.</p>
				)}
			</section>

			<Link
				className="inbox-context-link"
				href={`/clientes?conversation_id=${encodeURIComponent(conversationId)}`}
			>
				{context.conversation?.customerId
					? "Abrir cadastro"
					: "Localizar cadastro"}{" "}
				<ArrowUpRight aria-hidden="true" size={14} />
			</Link>
		</div>
	);
}

function FlowBasketSender({
	accountId,
	conversationId,
	search,
	flowBaskets,
	attempts,
	canSend,
	blockReason,
	statusUnavailable,
	windowOpen,
}: {
	accountId: string;
	conversationId: string;
	search: string;
	flowBaskets: Array<{ id: string; name: string }>;
	attempts: AttendanceConversation["flowSendAttempts"];
	canSend: boolean;
	blockReason: string | null;
	statusUnavailable: boolean;
	windowOpen: boolean;
}) {
	const blockLabels: Record<string, string> = {
		service_window_closed:
			"A janela de atendimento terminou. Aguarde uma nova mensagem do cliente.",
		flow_binding_not_ready:
			"Este número ainda não tem um Flow publicado e validado para envio.",
		flow_send_needs_review:
			"Confira o envio anterior na conversa antes de iniciar outro Flow.",
		flow_recipient_phone_unavailable:
			"Esta conversa não tem um telefone WhatsApp confirmado.",
		flow_account_unavailable:
			"A configuração Meta deste número ainda não está pronta.",
		conversation_unavailable: "Esta conversa não está disponível para envio.",
	};
	const statusLabels: Record<(typeof attempts)[number]["status"], string> = {
		preparing: "Preparando",
		sending: "Enviando",
		sent: "Enviado",
		failed: "Falhou",
		needs_review: "Conferir antes de reenviar",
	};

	return (
		<section id="enviar-flow">
			<h2>Enviar cesta pelo Flow</h2>
			<p>
				Escolha a cesta para o cliente preencher no WhatsApp. Cada envio gera um
				pedido separado.
			</p>
			{statusUnavailable ? (
				<p>
					Não foi possível confirmar a disponibilidade do Flow para este número.
				</p>
			) : flowBaskets.length === 0 ? (
				<p>Nenhuma cesta está habilitada para o Flow.</p>
			) : !canSend || !windowOpen ? (
				<p>
					{blockLabels[blockReason ?? ""] ??
						"O Flow só pode ser enviado quando o número e a publicação estiverem prontos."}
				</p>
			) : (
				<form action={sendBasketFlow} className="customer-form">
					<input name="account_id" type="hidden" value={accountId} />
					<input name="conversation_id" type="hidden" value={conversationId} />
					<input name="search" type="hidden" value={search} />
					<input
						name="idempotency_key"
						type="hidden"
						value={crypto.randomUUID()}
					/>
					<label className="customer-field">
						Modelo da cesta
						<select
							defaultValue={flowBaskets[0]?.id}
							name="basket_template_id"
							required
						>
							{flowBaskets.map((basket) => (
								<option key={basket.id} value={basket.id}>
									{basket.name}
								</option>
							))}
						</select>
					</label>
					<button className="catalog-submit" type="submit">
						Enviar Flow de cesta
					</button>
				</form>
			)}
			{attempts.length > 0 && (
				<div className="inbox-context-intent-items">
					{attempts.slice(0, 3).map((attempt) => (
						<span key={attempt.id}>
							{attempt.basketName} · {statusLabels[attempt.status]}
							{attempt.createdAt ? ` · ${dateOnly(attempt.createdAt)}` : ""}
						</span>
					))}
				</div>
			)}
		</section>
	);
}

function CatalogIntentPreparation({
	accountId,
	conversationId,
	intent,
	search,
}: {
	accountId: string;
	conversationId: string;
	intent: AdminWhatsAppOrderIntent;
	search: string;
}) {
	const preparation = intent.catalogPreparation;
	if (!preparation) return null;
	const canPrepare =
		preparation.statusReady &&
		intent.currentEstimateTotalCents !== null &&
		intent.items.length > 0 &&
		intent.items.every((item) => item.available && item.quantity !== null) &&
		(preparation.customerState === "matched" ||
			preparation.customerState === "not_found") &&
		preparation.addressState !== "address_review";
	const defaultAddressId =
		preparation.selectedAddressId ?? preparation.suggestedAddressId ?? "";
	const hasAddressOptions =
		preparation.customerState === "matched" && preparation.addresses.length > 0;
	const newAddress = preparation.newAddress;
	const hasNewAddress = Boolean(
		newAddress?.street?.trim() &&
			newAddress.number?.trim() &&
			newAddress.neighborhood?.trim() &&
			newAddress.city?.trim() &&
			newAddress.state?.trim() &&
			newAddress.postalCode?.trim(),
	);
	const hasCustomerName = Boolean(
		(preparation.customerState === "matched" && preparation.customer) ||
			(preparation.customerState === "not_found" &&
				preparation.customerName?.trim()),
	);
	const confirmationDataReady =
		preparation.statusReady &&
		preparation.paymentMethod !== null &&
		hasCustomerName &&
		Boolean(preparation.selectedAddressId || hasNewAddress) &&
		intent.currentEstimateTotalCents !== null &&
		intent.items.length > 0 &&
		intent.items.every((item) => item.available && item.quantity !== null) &&
		(intent.status === "received" || intent.status === "reprice_required");
	const canSendConfirmation =
		confirmationDataReady && preparation.serviceWindowOpen;

	return (
		<div className="inbox-catalog-preparation">
			<strong>Preparar este carrinho</strong>
			{preparation.customerState === "matched" && preparation.customer ? (
				<p>
					Telefone encontrado no cadastro de{" "}
					<b>{preparation.customer.name || "cliente sem nome registrado"}</b>.
				</p>
			) : preparation.customerState === "not_found" ? (
				<p>
					Este telefone ainda não tem cadastro. Os dados ficarão privados até a
					confirmação do cliente.
				</p>
			) : (
				<p>
					{preparation.customerState === "phone_conflict"
						? "Há mais de um cadastro para este telefone. O carrinho precisa de revisão."
						: preparation.customerState === "inactive"
							? "O cadastro encontrado está inativo. O carrinho precisa de revisão."
							: "Não foi possível confirmar o telefone do cliente. O carrinho precisa de revisão."}
				</p>
			)}
			{canPrepare ? (
				<form action={prepareCatalogOrderIntent} className="customer-form">
					<input name="intent_id" type="hidden" value={intent.id} />
					<input name="conversation_id" type="hidden" value={conversationId} />
					<input name="account_id" type="hidden" value={accountId} />
					<input name="search" type="hidden" value={search} />
					{preparation.customerState === "not_found" ||
					!preparation.customer?.name ? (
						<label className="customer-field">
							Nome do cliente
							<input
								defaultValue={preparation.customerName ?? ""}
								maxLength={180}
								name="customer_name"
								placeholder="Nome completo"
								type="text"
							/>
						</label>
					) : (
						<input
							name="customer_name"
							type="hidden"
							value={preparation.customerName ?? preparation.customer.name}
						/>
					)}
					<label className="customer-field">
						Forma de pagamento
						<select
							defaultValue={preparation.paymentMethod ?? ""}
							name="payment_method"
							required
						>
							<option disabled value="">
								Selecione
							</option>
							<option value="pix">Pix</option>
							<option value="cash">Dinheiro</option>
							<option value="debit_card">Cartão de débito</option>
							<option value="credit_card">Cartão de crédito</option>
							<option value="food_card">Vale-alimentação</option>
							<option value="meal_card">Vale-refeição</option>
						</select>
					</label>
					{hasAddressOptions ? (
						<label className="customer-field">
							Endereço de entrega
							<select defaultValue={defaultAddressId} name="address_id">
								<option value="">Cadastrar um endereço novo</option>
								{preparation.addresses.map((address) => (
									<option key={address.id} value={address.id}>
										{address.label ?? "Endereço"}: {address.street},{" "}
										{address.number} · {address.city}
										{address.isDefault ? " · principal" : ""}
									</option>
								))}
							</select>
						</label>
					) : (
						<input name="address_id" type="hidden" value="" />
					)}
					<details
						className="inbox-catalog-address-details"
						open={!hasAddressOptions || defaultAddressId === ""}
					>
						<summary>
							{hasAddressOptions
								? "Cadastrar outro endereço"
								: "Endereço de entrega"}
						</summary>
						<div className="customer-form-grid">
							<label className="customer-field">
								Rua
								<input
									defaultValue={newAddress?.street ?? ""}
									maxLength={180}
									name="street"
									type="text"
								/>
							</label>
							<label className="customer-field">
								Número
								<input
									defaultValue={newAddress?.number ?? ""}
									maxLength={40}
									name="number"
									type="text"
								/>
							</label>
							<label className="customer-field">
								Complemento
								<input
									defaultValue={newAddress?.complement ?? ""}
									maxLength={120}
									name="complement"
									type="text"
								/>
							</label>
							<label className="customer-field">
								Bairro
								<input
									defaultValue={newAddress?.neighborhood ?? ""}
									maxLength={120}
									name="neighborhood"
									type="text"
								/>
							</label>
							<label className="customer-field">
								Cidade
								<input
									defaultValue={newAddress?.city ?? ""}
									maxLength={120}
									name="city"
									type="text"
								/>
							</label>
							<label className="customer-field">
								UF
								<input
									defaultValue={newAddress?.state ?? ""}
									maxLength={2}
									name="state"
									type="text"
								/>
							</label>
							<label className="customer-field">
								CEP
								<input
									defaultValue={newAddress?.postalCode ?? ""}
									maxLength={16}
									name="postal_code"
									type="text"
								/>
							</label>
							<label className="customer-field customer-field--wide">
								Referência
								<input
									defaultValue={newAddress?.reference ?? ""}
									maxLength={180}
									name="reference"
									type="text"
								/>
							</label>
						</div>
					</details>
					<small>
						Ficam salvos só no rascunho interno. A confirmação ao cliente e a
						criação do pedido virão depois.
					</small>
					<button className="catalog-submit" type="submit">
						Salvar dados do carrinho
					</button>
				</form>
			) : (
				<p>
					{intent.currentEstimateTotalCents === null ||
					intent.items.some((item) => !item.available || item.quantity === null)
						? "Confira os produtos e preços antes de preparar este carrinho."
						: "Resolva a identificação do cliente antes de preparar este carrinho."}
				</p>
			)}
			{preparation.paymentMethod ? (
				<small>
					Pagamento salvo: {paymentMethodLabel(preparation.paymentMethod)}
				</small>
			) : null}
			{confirmationDataReady && !preparation.serviceWindowOpen ? (
				<p>
					A janela de atendimento da Meta terminou. O carrinho continua salvo;
					aguarde uma nova mensagem do cliente para enviar a confirmação.
				</p>
			) : null}
			{canSendConfirmation ? (
				<form action={sendCatalogOrderConfirmation} className="customer-form">
					<input name="intent_id" type="hidden" value={intent.id} />
					<input name="conversation_id" type="hidden" value={conversationId} />
					<input name="account_id" type="hidden" value={accountId} />
					<input name="search" type="hidden" value={search} />
					<small>
						O resumo mostra produtos, quantidades e total. Nenhum pedido será
						criado antes da confirmação do cliente.
					</small>
					<button className="catalog-submit" type="submit">
						{intent.status === "reprice_required"
							? "Enviar resumo com o preço atualizado"
							: "Enviar resumo para confirmação"}
					</button>
				</form>
			) : intent.status === "awaiting_confirmation" ? (
				<p>
					Resumo enviado ou em processamento. O pedido ainda não foi criado;
					aguarda a confirmação do cliente.
				</p>
			) : null}
		</div>
	);
}

export async function InboxWorkspace({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const search = value(searchParams.search).trim().slice(0, 80);
	const notice = noticeText(value(searchParams.notice));
	const identityState: AdminIdentityReviewState =
		value(searchParams.identity_state) === "acknowledged"
			? "acknowledged"
			: "pending";
	const identityNotice = identityReviewNoticeText(
		value(searchParams.identity_notice),
	);
	const accountsResult = await getAttendanceAccounts();

	if (!accountsResult.ok) {
		return (
			<div className="page-stack">
				<div className="page-heading">
					<div>
						<p className="eyebrow">ROTINA</p>
						<h1>Atendimento</h1>
						<p className="page-description">
							Conversas recebidas nos dois números da loja.
						</p>
					</div>
				</div>
				<ErrorPanel
					message={
						noticeText(accountsResult.error) ??
						"Não foi possível carregar os números do WhatsApp."
					}
				/>
			</div>
		);
	}

	const accounts = accountsResult.data;
	if (accounts.length === 0) {
		return (
			<div className="page-stack">
				<div className="page-heading">
					<div>
						<p className="eyebrow">ROTINA</p>
						<h1>Atendimento</h1>
						<p className="page-description">
							Conversas recebidas nos dois números da loja.
						</p>
					</div>
				</div>
				<ErrorPanel message="Nenhum número ativo foi encontrado na configuração Meta." />
			</div>
		);
	}

	const requestedAccountId = value(searchParams.account_id);
	const account =
		accounts.find((item) => item.id === requestedAccountId) ?? accounts[0];
	const [queueResult, identityReviewsResult] = await Promise.all([
		getAttendanceQueue(account.id, search),
		getAdminIdentityReviews(identityState),
	]);
	const queue = queueResult.ok ? queueResult.data : [];
	const requestedConversationId = value(searchParams.conversation_id);
	const selected = queue.find(
		(item) =>
			item.conversationId === requestedConversationId &&
			item.accountId === account.id,
	);
	const [conversationResult, contextResult, orderIntentsResult] = selected
		? await Promise.all([
				getAttendanceConversation(selected.conversationId),
				getAttendanceContext(selected.conversationId),
				getAdminWhatsAppOrderIntents(selected.conversationId),
			])
		: ([null, null, null] as const);
	const conversation = conversationResult?.ok ? conversationResult.data : null;
	const context = contextResult?.ok ? contextResult.data : null;
	const [quickRepliesResult, mediaLibraryResult] = conversation?.canSendText
		? await Promise.all([
				getAttendanceQuickReplies(),
				getAttendanceLibraryItems(),
			])
		: ([null, null] as const);
	const quickReplies: AttendanceQuickReply[] = quickRepliesResult?.ok
		? quickRepliesResult.data
		: [];
	const mediaLibraryItems: AttendanceLibraryItem[] = mediaLibraryResult?.ok
		? mediaLibraryResult.data
		: [];
	const flowConfigurationResult = selected
		? await getAdminFlowConfiguration()
		: null;
	const flowBaskets = (
		flowConfigurationResult?.configuration?.basketTypes ?? []
	)
		.filter(
			(basket) =>
				basket.active &&
				basket.templateActive &&
				basket.flowEnabled &&
				basket.linkedTemplateId,
		)
		.map((basket) => ({
			id: basket.linkedTemplateId as string,
			name: basket.name,
		}));

	return (
		<div className="page-stack inbox-page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">ROTINA</p>
					<h1>Atendimento</h1>
					<p className="page-description">
						Converse com os clientes dos dois números em uma caixa de entrada
						simples.
					</p>
				</div>
				<span className="environment-tag">
					<MessageCircle aria-hidden="true" size={15} />
					{queueResult.ok ? `${queue.length} conversas` : "Fila indisponível"}
				</span>
			</div>

			{notice && (
				<p className="inbox-notice" role="status">
					{notice}
				</p>
			)}
			{!queueResult.ok && (
				<ErrorPanel
					message={
						noticeText(queueResult.error) ??
						"Não foi possível carregar as conversas deste número."
					}
				/>
			)}

			<div className="inbox-filters-card">
				<form action="/atendimento" className="inbox-filter-form" method="get">
					<label>
						<span>Número de atendimento</span>
						<select defaultValue={account.id} name="account_id">
							{accounts.map((item) => (
								<option key={item.id} value={item.id}>
									{item.name} · {item.phone}
								</option>
							))}
						</select>
					</label>
					<label className="inbox-search-field">
						<span>Buscar conversa</span>
						<input
							defaultValue={search}
							maxLength={80}
							name="search"
							placeholder="Nome ou telefone"
							type="search"
						/>
					</label>
					<button className="catalog-submit" type="submit">
						Buscar
					</button>
				</form>
			</div>

			<IdentityReviewQueue
				accountId={account.id}
				conversationId={selected?.conversationId}
				error={
					identityReviewsResult.error
						? (identityReviewNoticeText(identityReviewsResult.error) ??
							"Não foi possível carregar a revisão de identidades.")
						: null
				}
				items={identityReviewsResult.items}
				notice={identityNotice}
				search={search}
				state={identityState}
			/>

			<div className="inbox-workspace">
				<section
					aria-label="Lista de conversas"
					className="inbox-panel inbox-queue-panel"
				>
					<header className="inbox-panel-heading">
						<div>
							<strong>Conversas</strong>
							<span>{account.name}</span>
						</div>
						<span className="inbox-account-phone">{account.phone}</span>
					</header>
					{queueResult.ok && queue.length > 0 ? (
						<ul className="inbox-conversation-list">
							{queue.map((item) => (
								<ConversationRow
									accountId={account.id}
									item={item}
									key={item.conversationId}
									search={search}
									selected={item.conversationId === selected?.conversationId}
								/>
							))}
						</ul>
					) : queueResult.ok ? (
						<div className="inbox-empty-list">
							<UserRound aria-hidden="true" size={22} />
							<strong>
								{search
									? "Nenhuma conversa encontrada"
									: "Ainda não há conversas"}
							</strong>
							<p>
								{search
									? "Tente outro nome ou telefone."
									: "As conversas recebidas aparecerão aqui."}
							</p>
						</div>
					) : null}
				</section>

				<section
					aria-label="Conversa selecionada"
					className="inbox-panel inbox-chat-panel"
				>
					{conversation && selected ? (
						<>
							<header className="inbox-panel-heading inbox-chat-heading">
								<div className="inbox-chat-person">
									<span aria-hidden="true" className="inbox-contact-avatar">
										{selected.displayName.slice(0, 1).toUpperCase()}
									</span>
									<div>
										<strong>{selected.displayName}</strong>
										<span>
											{conversation.phone ??
												selected.phone ??
												"Telefone não identificado"}
										</span>
									</div>
								</div>
								<span
									className={`inbox-window-badge${conversation.serviceWindowOpen ? " inbox-window-badge--open" : ""}`}
								>
									<Clock3 aria-hidden="true" size={13} />
									{conversation.serviceWindowOpen
										? "Janela de atendimento aberta"
										: "Janela encerrada"}
								</span>
							</header>
							<MessageList>
								{conversation.messages.length ? (
									conversation.messages.map((message) => (
										<article
											className={`inbox-message${message.direction === "outbound" ? " inbox-message--outbound" : ""}`}
											key={message.id}
										>
											<div className="inbox-message-bubble">
												{message.text ? (
													<p>{message.text}</p>
												) : message.interactiveSummary ? (
													<p>{message.interactiveSummary}</p>
												) : (
													<p>
														{messageTypeLabel(message.type, message.direction)}
													</p>
												)}
												{message.direction === "inbound" &&
													supportsMediaPreview(message.type) && (
														<MessageMedia
															messageId={message.id}
															messageType={message.type}
														/>
													)}
												<footer>
													<time dateTime={message.messageAt ?? undefined}>
														{dateTime(message.messageAt)}
													</time>
													{message.direction === "outbound" && (
														<span>{messageStatus(message.status)}</span>
													)}
												</footer>
											</div>
										</article>
									))
								) : (
									<div className="inbox-empty-messages">
										Nenhuma mensagem disponível nesta conversa.
									</div>
								)}
							</MessageList>
							<div className="inbox-compose-wrap">
								{conversation.canSendText ? (
									<MessageComposer
										key={selected.conversationId}
										accountId={account.id}
										conversationId={selected.conversationId}
										canSendInteractive={conversation.canSendInteractive}
										idempotencyKey={crypto.randomUUID()}
										libraryItems={mediaLibraryItems}
										libraryUnavailable={mediaLibraryResult?.ok !== true}
										quickReplies={quickReplies}
										search={search}
									/>
								) : (
									<div className="inbox-compose-blocked">
										<Clock3 aria-hidden="true" size={16} />
										<span>
											{conversation.sendBlockReason === "service_window_closed"
												? "A conversa está fora da janela de atendimento. Use um modelo aprovado ou aguarde o cliente responder."
												: "O envio humano está desativado para este número até a homologação do canal."}
										</span>
									</div>
								)}
								<TemplateMessageComposer
									key={`${account.id}:${selected.conversationId}`}
									accountId={account.id}
									conversationId={selected.conversationId}
								/>
							</div>
						</>
					) : (
						<div className="inbox-empty-chat">
							<span className="inbox-empty-chat-icon">
								<MessageCircle aria-hidden="true" size={23} />
							</span>
							<strong>
								{queueResult.ok
									? "Escolha uma conversa"
									: "Fila temporariamente indisponível"}
							</strong>
							<p>
								{queueResult.ok
									? "As mensagens e os dados do cliente aparecerão aqui."
									: "Tente novamente mais tarde."}
							</p>
						</div>
					)}
				</section>

				<aside
					aria-label="Dados do cliente"
					className="inbox-panel inbox-context-panel"
				>
					<header className="inbox-context-heading">
						<span aria-hidden="true" className="inbox-context-icon">
							<UserRound size={17} />
						</span>
						<div>
							<strong>Cliente e pedido</strong>
							<span>Contexto da conversa</span>
						</div>
					</header>
					{context && selected ? (
						<CustomerContext
							accountId={account.id}
							contactPhone={selected.phone}
							context={context}
							conversationId={selected.conversationId}
							orderIntents={orderIntentsResult?.intents ?? []}
							orderIntentsUnavailable={orderIntentsResult?.error != null}
							flowBaskets={flowBaskets}
							flowSendAttempts={conversation?.flowSendAttempts ?? []}
							flowSendBlockReason={conversation?.flowSendBlockReason ?? null}
							flowSendStatusUnavailable={
								conversation?.flowSendStatusUnavailable ?? true
							}
							canSendFlow={conversation?.canSendFlow ?? false}
							serviceWindowOpen={conversation?.serviceWindowOpen ?? false}
							search={search}
						/>
					) : selected && contextResult && !contextResult.ok ? (
						<div className="inbox-context-unavailable">
							Os dados do cliente não puderam ser carregados.
						</div>
					) : (
						<div className="inbox-context-empty">
							<UserRound aria-hidden="true" size={18} />
							Selecione uma conversa para ver o contexto.
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}

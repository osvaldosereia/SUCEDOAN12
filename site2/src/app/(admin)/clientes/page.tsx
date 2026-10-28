import { AlertCircle, ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { getAttendanceContext } from "@/lib/supabase/admin-attendance";
import {
	type AdminCustomerEditor,
	getAdminCustomerEditor,
} from "@/lib/supabase/admin-customers";
import {
	createCustomerForConversation,
	reconcileCustomerWithConversation,
	updateCustomerForConversation,
} from "./actions";
import { CustomerSearch } from "./customer-search";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function noticeMessage(notice: string): string | null {
	const messages: Record<string, string> = {
		ambiguous:
			"Mais de um cadastro corresponde a este telefone. Confira a busca e vincule o cliente correto.",
		created: "Cliente cadastrado e vinculado à conversa.",
		updated: "Cadastro do cliente atualizado.",
		duplicate_document: "Este documento já pertence a outro cadastro.",
		duplicate_phone: "Este telefone já está vinculado a outro cadastro.",
		invalid_conversation: "Não foi possível localizar essa conversa.",
		invalid_form: "Confira o nome, documento, email e endereço preenchidos.",
		linked: "Cadastro vinculado à conversa.",
		not_authorized: "Esta conta não tem acesso aos cadastros de clientes.",
		stale:
			"O cadastro mudou enquanto esta tela estava aberta. Os dados atuais foram carregados; revise e salve novamente.",
		not_found:
			"Nenhum cadastro foi encontrado pelo telefone. Revise a busca antes de criar um novo cliente.",
		not_linked: "Esta conversa ainda não está vinculada a um cadastro.",
		unavailable: "Não foi possível concluir agora. Tente novamente.",
		write_forbidden: "Seu perfil pode consultar, mas não salvar alterações.",
	};
	return messages[notice] ?? null;
}

function CustomerSummary({
	value,
	conversationId,
}: {
	value: AdminCustomerEditor;
	conversationId: string;
}) {
	const { customer, conversationPhone, addresses, selectedAddressId } = value;
	const address =
		addresses.find((item) => item.id === selectedAddressId) ?? null;
	const displayAddress = address ?? value.legacyAddress;
	const selectedAddressLabel = displayAddress
		? [
				[displayAddress.label, displayAddress.isDefault ? "Principal" : ""]
					.filter(Boolean)
					.join(" · "),
				[
					displayAddress.street,
					displayAddress.number,
					displayAddress.city,
					displayAddress.state,
				]
					.filter(Boolean)
					.join(", "),
			]
				.filter(Boolean)
				.join(" — ")
		: "Escolha um endereço ativo";

	return (
		<section
			aria-labelledby="customer-details-heading"
			className="customer-card"
		>
			<div className="customer-card-heading">
				<div>
					<h2 id="customer-details-heading">Cadastro do cliente</h2>
					<p>Dados vinculados à conversa selecionada.</p>
				</div>
				<span
					className={`customer-status${customer.status === "active" ? " customer-status--active" : ""}`}
				>
					{customer.status === "active" ? "Ativo" : "Inativo"}
				</span>
			</div>
			<div className="customer-detail-grid">
				<div>
					<span className="customer-detail-label">Nome</span>
					<strong className="customer-detail-value">
						{customer.name || "Não informado"}
					</strong>
				</div>
				<div>
					<span className="customer-detail-label">Telefone</span>
					<strong className="customer-detail-value">
						{conversationPhone ?? customer.phone ?? "Não informado"}
					</strong>
				</div>
				<div>
					<span className="customer-detail-label">CPF ou CNPJ</span>
					<strong className="customer-detail-value">
						{customer.maskedDocument || "Não informado"}
					</strong>
				</div>
				<div>
					<span className="customer-detail-label">Email</span>
					<strong className="customer-detail-value">
						{customer.email || "Não informado"}
					</strong>
				</div>
			</div>
			{value.canEdit && addresses.length > 1 && (
				<form
					action="/clientes"
					className="customer-address-picker"
					method="get"
				>
					<input hidden name="conversation_id" value={conversationId} />
					<label className="customer-field">
						<span>Endereço que deseja editar</span>
						<select defaultValue={selectedAddressId ?? ""} name="address_id">
							<option value="">Escolha um endereço ativo</option>
							{addresses.map((item) => (
								<option key={item.id} value={item.id}>
									{[
										item.label,
										item.isDefault ? "Principal" : "",
										[item.street, item.number, item.city]
											.filter(Boolean)
											.join(", "),
									]
										.filter(Boolean)
										.join(" — ")}
								</option>
							))}
						</select>
					</label>
					<button className="customer-address-picker__button" type="submit">
						Abrir endereço
					</button>
				</form>
			)}
			{value.canEdit && value.addressRequiresChoice && !address && (
				<p className="customer-help-text">
					Há mais de um endereço ativo. Escolha qual cadastro deseja alterar.
				</p>
			)}
			{value.canEdit ? (
				<form action={updateCustomerForConversation} className="customer-form">
					<input hidden name="conversation_id" value={conversationId} />
					<input hidden name="customer_updated_at" value={customer.updatedAt} />
					{address && (
						<>
							<input hidden name="address_id" value={address.id} />
							<input
								hidden
								name="address_updated_at"
								value={address.updatedAt}
							/>
						</>
					)}
					<div className="customer-address-heading">
						<strong>Dados que podem ser atualizados</strong>
						<span>{selectedAddressLabel}</span>
					</div>
					<div className="customer-form-grid">
						<label className="customer-field customer-field--wide">
							<span>Nome do cliente *</span>
							<input
								autoComplete="name"
								defaultValue={customer.name}
								maxLength={180}
								name="display_name"
								required
							/>
						</label>
						{address && (
							<>
								<label className="customer-field customer-field--wide">
									<span>Rua ou avenida *</span>
									<input
										autoComplete="street-address"
										defaultValue={address.street}
										maxLength={180}
										name="street"
										required
									/>
								</label>
								<label className="customer-field">
									<span>Número</span>
									<input
										defaultValue={address.number}
										maxLength={40}
										name="number"
									/>
								</label>
								<label className="customer-field">
									<span>Complemento</span>
									<input
										defaultValue={address.complement}
										maxLength={140}
										name="complement"
									/>
								</label>
								<label className="customer-field">
									<span>Bairro</span>
									<input
										defaultValue={address.district}
										maxLength={140}
										name="district"
									/>
								</label>
								<label className="customer-field">
									<span>Cidade *</span>
									<input
										autoComplete="address-level2"
										defaultValue={address.city}
										maxLength={120}
										name="city"
										required
									/>
								</label>
								<label className="customer-field">
									<span>Estado</span>
									<input
										autoComplete="address-level1"
										defaultValue={address.state}
										maxLength={2}
										name="state"
										placeholder="UF"
									/>
								</label>
								<label className="customer-field">
									<span>CEP</span>
									<input
										autoComplete="postal-code"
										defaultValue={address.postalCode}
										inputMode="numeric"
										maxLength={9}
										name="postal_code"
									/>
								</label>
								<label className="customer-field customer-field--wide">
									<span>Ponto de referência</span>
									<input
										defaultValue={address.reference}
										maxLength={400}
										name="reference"
									/>
								</label>
							</>
						)}
					</div>
					<div className="customer-form-footer">
						<span>
							Telefone, documento e email são preservados e não podem ser
							alterados por esta tela.
						</span>
						<button className="catalog-submit" type="submit">
							Salvar alterações
						</button>
					</div>
				</form>
			) : (
				<>
					<div className="customer-address-summary">
						<strong className="customer-detail-value">
							Endereço cadastrado
						</strong>
						{displayAddress &&
							[
								[
									displayAddress.street,
									displayAddress.number,
									displayAddress.complement,
								]
									.filter(Boolean)
									.join(", "),
								[
									displayAddress.district,
									displayAddress.city,
									displayAddress.state,
								]
									.filter(Boolean)
									.join(" · "),
								displayAddress.postalCode
									? `CEP ${displayAddress.postalCode}`
									: "",
								displayAddress.reference,
							]
								.filter(Boolean)
								.map((line) => (
									<span className="customer-detail-label" key={line}>
										{line}
									</span>
								))}
						{!displayAddress && (
							<span className="customer-detail-label">Não informado</span>
						)}
					</div>
					<div className="customer-message customer-readonly-note" role="note">
						<AlertCircle aria-hidden="true" size={18} />
						<p className="customer-message-copy">
							A edição está bloqueada até a instalação e validação do writer
							seguro. A ficha continua disponível para consulta.
						</p>
					</div>
				</>
			)}
		</section>
	);
}

function CustomerCreateForm({
	conversationId,
	phone,
}: {
	conversationId: string;
	phone: string;
}) {
	return (
		<section aria-labelledby="customer-form-heading" className="customer-card">
			<div className="customer-card-heading">
				<div>
					<h2 id="customer-form-heading">Novo cadastro</h2>
					<p>O telefone será associado a partir desta conversa.</p>
				</div>
				<span className="customer-status customer-status--active">{phone}</span>
			</div>

			<form action={createCustomerForConversation} className="customer-form">
				<input hidden name="conversation_id" value={conversationId} />
				<div className="customer-form-grid">
					<label className="customer-field customer-field--wide">
						<span>Nome do cliente *</span>
						<input
							autoComplete="name"
							maxLength={180}
							name="display_name"
							placeholder="Nome e sobrenome"
							required
						/>
					</label>
					<div className="customer-field">
						<span>Telefone da conversa</span>
						<div className="customer-readonly-value">{phone}</div>
					</div>
					<label className="customer-field">
						<span>CPF ou CNPJ</span>
						<input
							autoComplete="off"
							inputMode="numeric"
							maxLength={18}
							name="cpf"
							placeholder="Opcional"
							type="password"
						/>
					</label>
					<label className="customer-field">
						<span>Email</span>
						<input
							autoComplete="email"
							maxLength={180}
							name="email"
							placeholder="cliente@email.com"
							type="email"
						/>
					</label>
				</div>

				<div className="customer-address-heading">
					<strong>Endereço principal</strong>
					<span>Use o endereço confirmado pelo cliente.</span>
				</div>
				<div className="customer-form-grid">
					<label className="customer-field customer-field--wide">
						<span>Rua ou avenida</span>
						<input
							autoComplete="street-address"
							maxLength={180}
							name="street"
						/>
					</label>
					<label className="customer-field">
						<span>Número</span>
						<input maxLength={40} name="number" />
					</label>
					<label className="customer-field">
						<span>Complemento</span>
						<input maxLength={140} name="complement" />
					</label>
					<label className="customer-field">
						<span>Bairro</span>
						<input maxLength={140} name="district" />
					</label>
					<label className="customer-field">
						<span>Cidade</span>
						<input maxLength={120} name="city" />
					</label>
					<label className="customer-field">
						<span>Estado</span>
						<input maxLength={2} name="state" placeholder="UF" />
					</label>
					<label className="customer-field">
						<span>CEP</span>
						<input
							autoComplete="postal-code"
							inputMode="numeric"
							maxLength={9}
							name="postal_code"
						/>
					</label>
					<label className="customer-field customer-field--wide">
						<span>Ponto de referência</span>
						<input maxLength={400} name="reference" />
					</label>
				</div>

				<div className="customer-form-footer">
					<button className="catalog-submit" type="submit">
						Cadastrar e vincular cliente
					</button>
				</div>
			</form>
		</section>
	);
}

export default async function ClientesPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	await requireAdminSession();
	const params = await searchParams;
	const rawConversationId = one(params.conversation_id);
	const conversationId = UUID.test(rawConversationId)
		? rawConversationId
		: null;
	const rawAddressId = one(params.address_id);
	const addressId = UUID.test(rawAddressId) ? rawAddressId : null;
	const noticeKey = one(params.notice);
	const notice = noticeMessage(noticeKey);
	const contextResult = conversationId
		? await getAttendanceContext(conversationId)
		: null;
	const context = contextResult?.ok ? contextResult.data : null;
	const conversation = context?.conversation ?? null;
	const editorResult =
		conversationId && conversation?.customerId
			? await getAdminCustomerEditor(conversationId, addressId)
			: null;
	const editor = editorResult?.ok ? editorResult.data : null;
	const missingConversation = Boolean(
		conversationId && contextResult?.ok && !conversation,
	);
	const canCreate = Boolean(
		conversationId &&
			conversation &&
			!conversation.customerId &&
			noticeKey === "not_found" &&
			conversation.phone,
	);

	return (
		<div className="page-stack">
			<div className="page-heading">
				<div>
					<p className="eyebrow">CADASTROS</p>
					<h1>Clientes</h1>
					<p className="page-description">
						Localize cadastros e mantenha os dados confirmados de cada cliente.
					</p>
				</div>
				{conversationId && (
					<Link className="catalog-clear" href="/atendimento">
						<ArrowLeft aria-hidden="true" size={15} /> Voltar ao atendimento
					</Link>
				)}
			</div>

			{notice && (
				<p aria-live="polite" className="inbox-notice" role="status">
					{notice}
				</p>
			)}

			{missingConversation ? (
				<section className="customer-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<p className="customer-message-copy">
						Não foi possível carregar os dados desta conversa.
					</p>
				</section>
			) : conversationId && contextResult && !contextResult.ok ? (
				<section className="customer-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<p className="customer-message-copy">
						Não foi possível carregar o contexto do cliente. Tente novamente.
					</p>
				</section>
			) : null}

			{conversation && (
				<section
					aria-label="Conversa selecionada"
					className="customer-conversation"
				>
					<span aria-hidden="true" className="customer-conversation-icon">
						<Users size={17} />
					</span>
					<div>
						<strong>{context?.customer?.name ?? "Contato WhatsApp"}</strong>
						<span className="customer-conversation-phone">
							{conversation.phone ?? "Telefone não informado"}
						</span>
					</div>
					<span className="customer-conversation-label">
						{conversation.customerId
							? "Cadastro vinculado"
							: "Sem cadastro vinculado"}
					</span>
				</section>
			)}

			{!conversationId ? (
				<>
					<CustomerSearch
						conversationId={null}
						currentCustomerId={null}
						initialQuery=""
					/>
					<p className="customer-help-text">
						Para vincular um cadastro, abra a conversa do cliente no
						atendimento.
					</p>
				</>
			) : conversation && !conversation.customerId ? (
				<>
					{conversation.phone ? (
						<section className="customer-card customer-reconcile-card">
							<div>
								<h2>Conferir cadastro pelo telefone</h2>
								<p>
									A busca automática usa somente o telefone confirmado desta
									conversa.
								</p>
							</div>
							<form action={reconcileCustomerWithConversation}>
								<input hidden name="conversation_id" value={conversationId} />
								<button className="catalog-submit" type="submit">
									Verificar cadastro existente
								</button>
							</form>
						</section>
					) : (
						<p className="customer-help-text">
							Sem telefone confirmado, você pode vincular um cadastro existente
							após conferência. Para criar uma ficha nova, peça ao cliente
							compartilhar um número.
						</p>
					)}
					<CustomerSearch
						key={`${conversationId}-${noticeKey}`}
						conversationId={conversationId}
						currentCustomerId={null}
						initialQuery={
							noticeKey === "ambiguous" ? (conversation.phone ?? "") : ""
						}
					/>
					{canCreate && conversation.phone && (
						<CustomerCreateForm
							conversationId={conversationId}
							phone={conversation.phone}
						/>
					)}
				</>
			) : conversationId && conversation?.customerId ? (
				editor ? (
					<CustomerSummary conversationId={conversationId} value={editor} />
				) : (
					<section className="customer-message" role="status">
						<AlertCircle aria-hidden="true" size={20} />
						<p className="customer-message-copy">
							{editorResult &&
							!editorResult.ok &&
							editorResult.error === "not_authorized"
								? "Esta conta não tem acesso ao cadastro do cliente."
								: "Não foi possível abrir o cadastro do cliente. Tente novamente."}
						</p>
					</section>
				)
			) : null}
		</div>
	);
}

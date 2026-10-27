import {
	ArrowUpRight,
	Blocks,
	MessageCircle,
	PlugZap,
	ShieldCheck,
	Store,
} from "lucide-react";
import Link from "next/link";

import { loadAnaAdmin } from "@/lib/supabase/admin-ana";
import { getAttendanceAccounts } from "@/lib/supabase/admin-attendance";
import {
	getBlingIntegrationReadiness,
	getMetaAccountReadiness,
	type MetaAccountReadinessResult,
} from "@/lib/supabase/admin-integrations";

function maskedLastFour(phone: string): string {
	const digits = phone.replace(/\D/g, "");
	return digits.length >= 4
		? `•••• ${digits.slice(-4)}`
		: "Número não identificado";
}

function flagLabel(value: boolean): string {
	return value ? "Ativa" : "Pausada";
}

function formatTimestamp(value: string | null): string {
	if (!value) return "Ainda não registrado";
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "short",
		timeStyle: "short",
		timeZone: "America/Cuiaba",
	}).format(new Date(value));
}

function blingErrorMessage(error: string): string {
	if (error === "not_configured")
		return "A conexão do painel não está configurada.";
	if (error === "not_authenticated")
		return "Entre novamente para consultar as conexões.";
	if (error === "not_authorized")
		return "Esta conta não tem acesso ao status do Bling.";
	return "Não foi possível consultar o status do Bling agora.";
}

function metaCheckMessage(
	result: MetaAccountReadinessResult | undefined,
): string {
	if (!result) return "Consulta não disponível";
	if (!result.ok) {
		if (result.error === "not_authenticated")
			return "Entre novamente para consultar";
		if (result.error === "not_authorized")
			return "Perfil sem acesso à consulta";
		if (result.error === "account_not_found")
			return "Número não encontrado na configuração Meta";
		if (result.error === "endpoint_not_deployed")
			return "Verificação da Meta ainda não publicada neste ambiente";
		return "Não foi possível consultar o Graph agora";
	}
	switch (result.readiness.status) {
		case "connected":
			return "Número e WABA confirmados";
		case "not_configured":
			return "Credencial ou versão Graph ausente";
		case "account_inactive":
			return "Conta pausada";
		case "provider_rejected":
			return "Meta recusou a consulta; revisar token/permissão";
		case "provider_unavailable":
			return "Meta indisponível no momento";
		case "provider_invalid_response":
			return "Resposta da Meta inválida";
		case "phone_not_in_waba":
			return "ID não encontrado neste WABA";
		case "phone_mapping_mismatch":
			return "Telefone não confere com o cadastro";
		case "check_incomplete":
			return "Consulta incompleta; tente novamente";
	}
}

function metaQualityLabel(
	value: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | null,
): string {
	if (value === "GREEN") return "Verde";
	if (value === "YELLOW") return "Amarela";
	if (value === "RED") return "Vermelha";
	if (value === "UNKNOWN") return "Desconhecida";
	return "Não informada";
}

export default async function ConfiguracoesPage() {
	const [blingResult, accountsResult, anaResult] = await Promise.all([
		getBlingIntegrationReadiness().catch(() => null),
		getAttendanceAccounts().catch(() => null),
		loadAnaAdmin().catch(() => null),
	]);
	const bling = blingResult?.ok ? blingResult.readiness : null;
	const blingError = blingResult?.ok
		? null
		: blingResult
			? blingErrorMessage(blingResult.error)
			: "Não foi possível consultar o status do Bling agora.";
	const blingStatus = !blingResult?.ok
		? "Consulta indisponível"
		: blingResult.readiness.hubEnabled === true
			? "Gateway habilitado"
			: blingResult.readiness.hubEnabled === false
				? "Gateway pausado"
				: "Situação não informada";
	const accounts = accountsResult?.ok === true ? accountsResult.data : null;
	const metaChecks = accounts
		? await Promise.all(
				accounts.map((account) =>
					getMetaAccountReadiness(account.id).catch(() => ({
						ok: false as const,
						error: "unavailable" as const,
					})),
				),
			)
		: [];
	const metaByAccountId = new Map(
		(accounts ?? []).map((account, index) => [account.id, metaChecks[index]]),
	);
	const anaChannels = anaResult?.ok === true ? anaResult.view.channels : null;
	const metaStatus =
		accounts === null
			? "Consulta indisponível"
			: accounts.length === 0
				? "Nenhum número cadastrado"
				: accounts.length === 2
					? "2 números cadastrados"
					: `${accounts.length} ${accounts.length === 1 ? "número cadastrado" : "números cadastrados"} · esperado 2`;
	const accountError =
		accountsResult && !accountsResult.ok
			? accountsResult.error === "not_authorized"
				? "Esta conta não tem acesso à configuração dos números."
				: accountsResult.error === "not_authenticated"
					? "Entre novamente para consultar os números."
					: "Não foi possível consultar os números cadastrados."
			: "Não foi possível consultar os números cadastrados.";
	const anaError =
		anaResult && !anaResult.ok
			? anaResult.error === "not_authorized"
				? "A configuração por número não está disponível para este perfil."
				: anaResult.error === "not_authenticated"
					? "Entre novamente para consultar a configuração da ANA."
					: "Não foi possível consultar a configuração por número."
			: "Não foi possível consultar a configuração por número.";

	return (
		<div className="page-stack">
			<section className="page-heading">
				<div>
					<p className="eyebrow">SISTEMA</p>
					<h1>Configurações</h1>
					<p className="page-description">
						Acompanhe conexões e informações necessárias para operar o Admin.
					</p>
					<Link
						className="settings-quick-replies-link"
						href="/configuracoes/respostas-rapidas"
					>
						Respostas rápidas
						<ArrowUpRight aria-hidden="true" size={15} />
					</Link>
				</div>
			</section>

			<section className="section-block" aria-labelledby="connections-heading">
				<div className="section-heading">
					<div>
						<h2 id="connections-heading">Conexões do sistema</h2>
						<p>Segredos nunca aparecem nesta tela.</p>
					</div>
				</div>
				<div className="integration-grid">
					<article className="integration-card">
						<div className="integration-card__top">
							<div className="integration-card__title">
								<span className="integration-card__icon" aria-hidden="true">
									<Blocks size={18} />
								</span>
								Supabase
							</div>
							<span className="integration-card__status integration-card__status--ok">
								Sessão autenticada
							</span>
						</div>
						<p>
							O painel está aberto com uma sessão válida. Cada consulta de dados
							também é conferida pelo gateway.
						</p>
					</article>

					<article className="integration-card">
						<div className="integration-card__top">
							<div className="integration-card__title">
								<span className="integration-card__icon" aria-hidden="true">
									<MessageCircle size={18} />
								</span>
								WhatsApp da Meta
							</div>
							<span className="integration-card__status">{metaStatus}</span>
						</div>
						<p>
							Ao abrir esta página, uma consulta somente de leitura confere cada
							telefone com o WABA salvo. Ela não confirma webhook, envio de
							mensagem, catálogo, Flow publicado ou funcionamento do
							atendimento.
						</p>
						{accounts === null ? (
							<p className="integration-card__empty">{accountError}</p>
						) : accounts.length === 0 ? (
							<p className="integration-card__empty">
								Nenhum número foi retornado pelo gateway de atendimento.
							</p>
						) : (
							<div className="integration-channel-list">
								{accounts.map((account) => {
									const metaCheck = metaByAccountId.get(account.id);
									const channel = anaChannels?.find(
										(item) =>
											item.id.toLowerCase() === account.id.toLowerCase(),
									);

									return (
										<div className="integration-channel" key={account.id}>
											<div className="integration-channel__heading">
												<strong>{account.name}</strong>
												<span>{maskedLastFour(account.phone)}</span>
											</div>
											<dl className="integration-card__details">
												<div>
													<dt>Entrada WhatsApp</dt>
													<dd>
														{anaChannels === null
															? anaError
															: channel
																? flagLabel(channel.captureEnabled)
																: "Configuração não encontrada"}
													</dd>
												</div>
												<div>
													<dt>Envio manual</dt>
													<dd>
														{anaChannels === null
															? "Indisponível"
															: channel
																? flagLabel(
																		channel.sendEnabled &&
																			channel.humanSendEnabled,
																	)
																: "Configuração não encontrada"}
													</dd>
												</div>
												<div>
													<dt>ANA</dt>
													<dd>
														{anaChannels === null
															? "Indisponível"
															: channel
																? flagLabel(channel.anaEnabled)
																: "Configuração não encontrada"}
													</dd>
												</div>
												<div>
													<dt>Homologação</dt>
													<dd>
														{anaChannels === null
															? "Indisponível"
															: channel?.homologated
																? "Registro existente"
																: channel
																	? "Sem registro"
																	: "Configuração não encontrada"}
													</dd>
												</div>
												<div>
													<dt>Checagem Meta Graph</dt>
													<dd
														className={
															metaCheck?.ok &&
															metaCheck.readiness.status === "connected"
																? "integration-card__value--ok"
																: undefined
														}
													>
														{metaCheckMessage(metaCheck)}
													</dd>
												</div>
												<div>
													<dt>Nome verificado</dt>
													<dd>
														{metaCheck?.ok
															? (metaCheck.readiness.verifiedName ??
																"Não informado")
															: "Indisponível"}
													</dd>
												</div>
												<div>
													<dt>Qualidade informada pela Meta</dt>
													<dd>
														{metaCheck?.ok
															? metaQualityLabel(
																	metaCheck.readiness.qualityRating,
																)
															: "Indisponível"}
													</dd>
												</div>
												<div>
													<dt>Última consulta Graph</dt>
													<dd>
														{metaCheck?.ok
															? formatTimestamp(metaCheck.readiness.checkedAt)
															: "Indisponível"}
													</dd>
												</div>
											</dl>
										</div>
									);
								})}
							</div>
						)}
					</article>

					<article className="integration-card">
						<div className="integration-card__top">
							<div className="integration-card__title">
								<span className="integration-card__icon" aria-hidden="true">
									<PlugZap size={18} />
								</span>
								Bling
							</div>
							<span
								className={`integration-card__status${bling?.hubEnabled === true ? " integration-card__status--ok" : ""}`}
							>
								{blingStatus}
							</span>
						</div>
						<p>
							{bling
								? "Resumo somente leitura. As datas mostram os últimos registros, não confirmam que o token atual responde ao Bling."
								: blingError}
						</p>
						{bling && (
							<dl className="integration-card__details">
								<div>
									<dt>Último OAuth válido</dt>
									<dd>{formatTimestamp(bling.lastOAuthOkAt)}</dd>
								</div>
								<div>
									<dt>Última leitura confirmada</dt>
									<dd>{formatTimestamp(bling.lastReadOnlyOkAt)}</dd>
								</div>
								<div>
									<dt>Nota fiscal</dt>
									<dd>
										{bling.fiscalSafeOff === true
											? "Desativada"
											: bling.fiscalSafeOff === false
												? "Precisa de revisão antes de liberar"
												: "Situação não disponível"}
									</dd>
								</div>
							</dl>
						)}
					</article>
				</div>
			</section>

			<section className="section-block" aria-labelledby="company-heading">
				<div className="section-heading">
					<div>
						<h2 id="company-heading">Dados da operação</h2>
						<p>
							As políticas serão configuradas antes do atendimento automático.
						</p>
					</div>
				</div>
				<article className="empty-panel">
					<div className="empty-panel__content">
						<div className="empty-panel__icon" aria-hidden="true">
							<Store size={21} strokeWidth={1.8} />
						</div>
						<h2>Informações da loja ainda não configuradas</h2>
						<p>
							Horário humano, regiões de entrega, formas de pagamento e regras
							comerciais serão preenchidos antes de ativar a ANA.
						</p>
						<span className="empty-panel__hint">
							<ShieldCheck aria-hidden="true" size={14} />
							Nenhuma integração de produção foi acionada
						</span>
					</div>
				</article>
			</section>
		</div>
	);
}

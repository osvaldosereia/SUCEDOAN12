"use client";

import {
	Check,
	CircleAlert,
	LoaderCircle,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

type FlowView = {
	id: string;
	name: string;
	status: string;
	jsonVersion: string | null;
	dataApiVersion: string | null;
	endpointMatches: boolean;
	validationErrorCount: number;
	validationErrors: Array<{
		code: string | null;
		message: string | null;
		line: number | null;
		column: number | null;
	}>;
	canBind: boolean;
	bound: boolean;
	sendEnabled: boolean;
};
type Binding = {
	id: string;
	meta_flow_id: string;
	flow_json_version: string;
	data_api_version: string;
	flow_message_version: string;
	flow_status: string;
	flow_cta: string;
	body_text: string;
	is_verified: boolean;
	is_send_enabled: boolean;
	verified_at: string | null;
};
type SetupState = {
	account: { id: string; slug: string };
	key: {
		status: string;
		vaultSecretPresent: boolean;
		metaKeyPresent: boolean | null;
		metaFingerprint: string | null;
		verifiedMetaFingerprint: string | null;
		metaSignatureStatus: string | null;
		verifiedAt: string | null;
		issue: string | null;
	};
	bindings: Binding[];
	flows: FlowView[];
	flowListIssue: string | null;
};

const errors: Record<string, string> = {
	admin_auth_required: "Entre novamente para continuar.",
	admin_session_invalid: "Sua sessão expirou. Entre novamente.",
	admin_not_authorized: "Seu perfil não pode alterar esta configuração.",
	meta_credentials_not_configured:
		"Falta configurar as credenciais do canal no servidor.",
	provider_rejected:
		"A Meta recusou a consulta. Revise as permissões do canal.",
	provider_unavailable: "A Meta está indisponível. Tente novamente.",
	provider_invalid_response: "A Meta retornou dados fora do formato esperado.",
	meta_key_exists_without_local_key:
		"A Meta já tem uma chave, mas o Admin não encontrou o par privado. A configuração foi bloqueada para não trocar uma chave em uso.",
	meta_key_mismatch:
		"A chave da Meta não corresponde à chave privada salva. Nenhuma chave foi substituída.",
	meta_key_not_verified:
		"A Meta ainda não confirmou a chave. Atualize o status antes de continuar.",
	meta_key_readback_failed:
		"Não foi possível confirmar a chave após o registro.",
	local_key_state_conflict:
		"O estado local da chave exige revisão antes de continuar.",
	local_private_key_invalid:
		"A chave privada salva não está em um formato compatível.",
	flow_key_not_ready: "Configure e verifique a chave deste número primeiro.",
	flow_candidate_conflict:
		"Já existe um rascunho com esse nome em estado diferente. Confira o Flow na Meta antes de continuar.",
	flow_not_draft:
		"A definição só pode ser enviada para o rascunho deste Admin.",
	flow_template_invalid:
		"A definição do Flow não corresponde à versão aprovada neste projeto.",
	flow_not_published: "Publique o Flow no WhatsApp Manager e atualize a lista.",
	flow_endpoint_mismatch:
		"O Flow está apontando para outro endpoint. Revise o endpoint antes de vinculá-lo.",
	flow_validation_errors: "A Meta ainda aponta erros de validação neste Flow.",
	flow_version_unsupported:
		"Este Flow usa uma versão diferente da tela de cesta deste projeto.",
	flow_binding_no_longer_valid:
		"O Flow mudou ou deixou de atender aos requisitos. Atualize a lista.",
	flow_account_mismatch: "Este Flow não pertence ao número selecionado.",
	flow_setup_snapshot_unavailable:
		"Não foi possível consultar a configuração salva.",
	flow_binding_save_failed: "Não foi possível salvar o vínculo deste Flow.",
	flow_enable_failed: "Não foi possível habilitar o envio deste Flow.",
	key_state_update_failed:
		"A Meta confirmou a chave, mas o estado do Admin não foi atualizado.",
	key_vault_store_failed: "Não foi possível guardar a chave no Vault.",
	key_already_exists:
		"Já existe outra chave privada salva. Ela não foi substituída.",
	key_provisioning_not_allowed:
		"A chave deste número não está no estado que permite geração automática.",
	key_fingerprint_mismatch:
		"A conferência da chave não passou. Nenhuma alteração adicional foi feita.",
	flow_binding_not_verified:
		"Vincule e confira um Flow publicado antes de habilitar o envio.",
	flow_binding_not_found: "O vínculo deste Flow não foi encontrado.",
	flow_disable_failed: "Não foi possível pausar o envio deste Flow.",
	service_unavailable: "Serviço temporariamente indisponível. Tente novamente.",
};

function errorMessage(value: unknown): string {
	return typeof value === "string"
		? (errors[value] ?? "Não foi possível concluir esta ação.")
		: "Não foi possível concluir esta ação.";
}

function keyStatusLabel(status: string): string {
	if (status === "ready") return "Chave verificada";
	if (status === "pending_meta_verification")
		return "Aguardando conferência na Meta";
	if (status === "disabled") return "Chave desativada";
	return "Chave ainda não configurada";
}

function dateLabel(value: string | null): string {
	if (!value) return "Sem registro";
	const date = new Date(value);
	return Number.isFinite(date.getTime())
		? new Intl.DateTimeFormat("pt-BR", {
				dateStyle: "short",
				timeStyle: "short",
				timeZone: "America/Cuiaba",
			}).format(date)
		: "Sem registro";
}

function isFlowKeyReady(state: SetupState | null): boolean {
	return Boolean(
		state?.key.status === "ready" &&
			state.key.metaFingerprint &&
			state.key.verifiedMetaFingerprint &&
			state.key.metaFingerprint === state.key.verifiedMetaFingerprint &&
			state.key.metaSignatureStatus === "VALID",
	);
}

export function FlowSetupPanel({
	accountId,
	label,
	phone,
	flowJson,
}: {
	accountId: string;
	label: string;
	phone: string;
	flowJson: string;
}) {
	const supabase = useMemo(() => createClient(), []);
	const [pending, startTransition] = useTransition();
	const [state, setState] = useState<SetupState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [readyAtLeastOnce, setReadyAtLeastOnce] = useState(false);

	async function request(action: string, fields: Record<string, string> = {}) {
		setError(null);
		setNotice(null);
		const { data, error: invokeError } = await supabase.functions.invoke(
			"admin-whatsapp-flow-setup-v1",
			{
				body: { action, accountId, ...fields },
			},
		);
		if (invokeError) {
			const context = invokeError.context;
			if (context instanceof Response) {
				try {
					const response = (await context.clone().json()) as {
						error?: unknown;
					};
					setError(errorMessage(response.error));
					return null;
				} catch {
					setError("Não foi possível falar com o serviço de configuração.");
					return null;
				}
			}
			setError("Não foi possível falar com o serviço de configuração.");
			return null;
		}
		if (!data || typeof data !== "object") {
			setError("O serviço retornou uma resposta inválida.");
			return null;
		}
		const result = data as Record<string, unknown>;
		if (result.ok !== true) {
			setError(errorMessage(result.error));
			return null;
		}
		return result;
	}

	function inspect(showNotice = false) {
		startTransition(async () => {
			const result = await request("inspect");
			if (!result) return;
			setState(result as unknown as SetupState);
			setReadyAtLeastOnce(true);
			if (showNotice) setNotice("Informações atualizadas.");
		});
	}

	function setupKey() {
		startTransition(async () => {
			const result = await request("setup_key");
			if (!result) return;
			const refreshed = await request("inspect");
			if (refreshed) setState(refreshed as unknown as SetupState);
			setReadyAtLeastOnce(true);
			setNotice("Chave conferida com a Meta e salva no Vault.");
		});
	}

	function prepareFlow() {
		if (
			!window.confirm(
				"Esta ação verifica a chave deste número e, se preciso, registra uma nova chave na Meta. Depois cria ou atualiza o rascunho e envia o JSON para validação. Não publica o Flow nem envia mensagens. Continuar?",
			)
		)
			return;

		startTransition(async () => {
			let currentState = state;
			if (!isFlowKeyReady(currentState)) {
				const keyResult = await request("setup_key");
				if (!keyResult) return;
				const afterKey = await request("inspect");
				if (!afterKey) return;
				currentState = afterKey as unknown as SetupState;
				setState(currentState);
				setReadyAtLeastOnce(true);
				if (!isFlowKeyReady(currentState)) {
					setError(errorMessage("meta_key_not_verified"));
					return;
				}
			}

			const draft = await request("create_draft");
			if (!draft) return;
			const flowId =
				typeof draft.flowId === "string" && /^[0-9]{6,32}$/.test(draft.flowId)
					? draft.flowId
					: null;
			if (!flowId) {
				setError(errorMessage("provider_invalid_response"));
				return;
			}

			const uploaded = await request("upload_flow_json", { flowId, flowJson });
			if (!uploaded) return;
			const validationErrorCount = Number(uploaded.validationErrorCount ?? 0);
			if (
				!Number.isSafeInteger(validationErrorCount) ||
				validationErrorCount < 0
			) {
				setError(errorMessage("provider_invalid_response"));
				return;
			}
			const refreshed = await request("inspect");
			if (!refreshed) return;
			setState(refreshed as unknown as SetupState);
			setReadyAtLeastOnce(true);
			setNotice(
				validationErrorCount === 0
					? draft.existing === true
						? "JSON enviado ao rascunho existente. A Meta não retornou erros de validação."
						: "Rascunho criado e JSON enviado. A Meta não retornou erros de validação."
					: `JSON enviado. A Meta retornou ${validationErrorCount} erro(s); confira os detalhes abaixo.`,
			);
		});
	}

	function bindFlow(flowId: string) {
		startTransition(async () => {
			const result = await request("bind_flow", { flowId });
			if (!result) return;
			const refreshed = await request("inspect");
			if (refreshed) setState(refreshed as unknown as SetupState);
			setReadyAtLeastOnce(true);
			setNotice(
				"Flow vinculado. O envio continua desligado até você habilitá-lo.",
			);
		});
	}

	function enableFlow(bindingId: string) {
		if (
			!window.confirm(
				"Habilitar este Flow permite que a equipe o envie aos clientes pelo Atendimento. Deseja continuar?",
			)
		)
			return;
		startTransition(async () => {
			const result = await request("enable_flow", { bindingId });
			if (!result) return;
			const refreshed = await request("inspect");
			if (refreshed) setState(refreshed as unknown as SetupState);
			setReadyAtLeastOnce(true);
			setNotice("Envio do Flow habilitado para este número.");
		});
	}

	function disableFlow(bindingId: string) {
		startTransition(async () => {
			const result = await request("disable_flow", { bindingId });
			if (!result) return;
			const refreshed = await request("inspect");
			if (refreshed) setState(refreshed as unknown as SetupState);
			setReadyAtLeastOnce(true);
			setNotice("O envio deste Flow foi pausado.");
		});
	}

	const localAndMetaMatch = isFlowKeyReady(state);
	const keyReady = localAndMetaMatch;
	const candidateName = state
		? `Cestas Dona Antônia - ${state.account.slug.slice(-4)}`
		: "";

	return (
		<article className="flow-setup-card">
			<div className="flow-setup-card__heading">
				<div>
					<p className="eyebrow">WHATSAPP OFICIAL</p>
					<h3>{label}</h3>
					<p>{phone}</p>
				</div>
				<span
					className={`integration-card__status${state?.key.status === "ready" ? " integration-card__status--ok" : ""}`}
				>
					{state
						? keyReady
							? "Chave verificada"
							: keyStatusLabel(state.key.status)
						: "Ainda não consultado"}
				</span>
			</div>

			{state && (
				<div className="flow-setup-key-state">
					<div>
						<span>Chave privada no Vault</span>
						<strong>
							{state.key.vaultSecretPresent ? "Encontrada" : "Ausente"}
						</strong>
					</div>
					<div>
						<span>Chave pública na Meta</span>
						<strong>
							{state.key.metaKeyPresent === null
								? "Não consultada"
								: state.key.metaKeyPresent
									? "Encontrada"
									: "Ausente"}
						</strong>
					</div>
					<div>
						<span>Correspondência das chaves</span>
						<strong>
							{localAndMetaMatch && state.key.metaSignatureStatus === "VALID"
								? "Confirmada"
								: "Pendente"}
						</strong>
					</div>
					<div>
						<span>Última verificação</span>
						<strong>{dateLabel(state.key.verifiedAt)}</strong>
					</div>
					{state.key.issue && (
						<p className="flow-setup-inline-note">
							A consulta à chave da Meta está indisponível.
						</p>
					)}
				</div>
			)}

			<div className="flow-setup-actions">
				<button
					className="button button--secondary flow-setup-button"
					disabled={pending}
					onClick={() => inspect(readyAtLeastOnce)}
					type="button"
				>
					{pending ? (
						<LoaderCircle
							aria-hidden="true"
							className="flow-setup-spinner"
							size={15}
						/>
					) : (
						<RefreshCw aria-hidden="true" size={15} />
					)}
					{readyAtLeastOnce ? "Atualizar Meta" : "Consultar Meta"}
				</button>
				<button
					className="button button--primary flow-setup-button"
					disabled={pending || keyReady}
					onClick={setupKey}
					type="button"
				>
					<ShieldCheck aria-hidden="true" size={15} />
					Verificar/configurar chave
				</button>
			</div>

			{!state && (
				<p className="flow-setup-inline-note">
					Consulte a Meta para ver os Flows deste número.
				</p>
			)}
			{notice && (
				<p
					aria-live="polite"
					className="flow-setup-feedback flow-setup-feedback--ok"
				>
					<Check aria-hidden="true" size={15} />
					{notice}
				</p>
			)}
			{error && (
				<p
					aria-live="polite"
					className="flow-setup-feedback flow-setup-feedback--error"
				>
					<CircleAlert aria-hidden="true" size={15} />
					{error}
				</p>
			)}

			{state && (
				<div className="flow-setup-flows">
					<div className="flow-setup-flows__heading">
						<div>
							<h4>Flows da Meta</h4>
							<p>
								Crie o rascunho e envie o JSON para ver a validação da Meta. Só
								Flows publicados, válidos e ligados a este projeto podem ser
								vinculados.
							</p>
						</div>
						<button
							className="button button--secondary flow-setup-button"
							disabled={pending || state.flowListIssue !== null}
							onClick={prepareFlow}
							type="button"
						>
							Preparar Flow e validar
						</button>
					</div>
					{!keyReady && (
						<p className="flow-setup-inline-note">
							Ao preparar, a chave deste número será verificada e só será criada
							se ainda não existir. O processo para se a Meta não confirmar a
							chave.
						</p>
					)}
					{state.flowListIssue ? (
						<p className="flow-setup-inline-note">
							Não foi possível consultar a lista de Flows. Atualize a Meta.
						</p>
					) : state.flows.length === 0 ? (
						<p className="flow-setup-inline-note">
							Nenhum Flow foi encontrado neste WABA. Crie o rascunho por aqui.
						</p>
					) : (
						<div className="flow-setup-flow-list">
							{state.flows.map((flow) => {
								const binding = state.bindings.find(
									(item) => item.meta_flow_id === flow.id,
								);
								const validationErrors = Array.isArray(flow.validationErrors)
									? flow.validationErrors
									: [];
								return (
									<div className="flow-setup-flow" key={flow.id}>
										<div className="flow-setup-flow__main">
											<div>
												<strong>{flow.name}</strong>
												<small>
													ID {flow.id} · {flow.status} · JSON{" "}
													{flow.jsonVersion ?? "?"} · Data API{" "}
													{flow.dataApiVersion ?? "?"}
												</small>
											</div>
											<span
												className={`integration-card__status${flow.canBind ? " integration-card__status--ok" : ""}`}
											>
												{flow.sendEnabled && flow.canBind
													? "Envio ativo"
													: binding?.is_verified && flow.canBind
														? "Vinculado"
														: flow.canBind
															? "Pronto para vincular"
															: "Precisa de ajuste"}
											</span>
										</div>
										<div className="flow-setup-flow__facts">
											<span>
												Endpoint{" "}
												{flow.endpointMatches ? "correto" : "diferente"}
											</span>
											<span>
												{flow.validationErrorCount} erros de validação
											</span>
										</div>
										{validationErrors.length > 0 && (
											<ul className="flow-setup-validation-errors">
												{validationErrors.slice(0, 5).map((issue) => (
													<li
														key={`${flow.id}-${issue.code ?? "erro"}-${issue.line ?? 0}-${issue.column ?? 0}-${issue.message ?? ""}`}
													>
														<strong>{issue.code ?? "Validação"}</strong>
														{issue.line ? ` · linha ${issue.line}` : ""}
														{issue.message ? ` — ${issue.message}` : ""}
													</li>
												))}
											</ul>
										)}
										{flow.status === "DRAFT" && flow.name === candidateName && (
											<p className="flow-setup-inline-note">
												Use “Preparar Flow e validar” para atualizar o JSON
												deste rascunho.
											</p>
										)}
										{binding?.is_verified ? (
											binding.is_send_enabled ? (
												<>
													<p className="flow-setup-inline-note">
														Este é o Flow ativo neste número.
													</p>
													<button
														className="button button--secondary flow-setup-button flow-setup-enable"
														disabled={pending}
														onClick={() => disableFlow(binding.id)}
														type="button"
													>
														Pausar envio
													</button>
												</>
											) : (
												<button
													className="button button--primary flow-setup-button flow-setup-enable"
													disabled={pending || !flow.canBind}
													onClick={() => enableFlow(binding.id)}
													type="button"
												>
													Ativar envio no Atendimento
												</button>
											)
										) : (
											<button
												className="button button--secondary flow-setup-button flow-setup-enable"
												disabled={pending || !flow.canBind}
												onClick={() => bindFlow(flow.id)}
												type="button"
											>
												Vincular Flow
											</button>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}
		</article>
	);
}

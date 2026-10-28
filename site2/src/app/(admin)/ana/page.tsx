import {
	Bot,
	Check,
	CircleAlert,
	FlaskConical,
	MessageCircle,
	RotateCcw,
	Save,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { requireAdminSession } from "@/lib/auth/require-admin-session";
import { loadAnaAdmin } from "@/lib/supabase/admin-ana";
import {
	publishAnaDraft,
	rollbackAnaVersion,
	runAnaDraftTest,
	saveAnaDraft,
} from "./actions";

const notices: Record<string, { text: string; tone: "success" | "warning" }> = {
	draft_saved: {
		text: "Rascunho salvo. A versão ativa não foi alterada.",
		tone: "success",
	},
	test_passed: {
		text: "Todos os cenários configurados passaram no teste seguro.",
		tone: "success",
	},
	test_failed: {
		text: "O teste encontrou cenários que precisam de revisão.",
		tone: "warning",
	},
	published: { text: "Nova versão da ANA publicada.", tone: "success" },
	rolled_back: { text: "A versão anterior foi reativada.", tone: "success" },
	conflict: {
		text: "Outra pessoa alterou o rascunho. Atualize a tela antes de salvar.",
		tone: "warning",
	},
	invalid: {
		text: "Revise os campos: há informação ausente ou fora do limite permitido.",
		tone: "warning",
	},
	not_authorized: {
		text: "Seu perfil não permite esta ação.",
		tone: "warning",
	},
	no_test_cases: {
		text: "Cadastre cenários de teste antes de executar a validação.",
		tone: "warning",
	},
	test_required: {
		text: "Execute com sucesso todos os cenários do rascunho antes de publicar.",
		tone: "warning",
	},
	unavailable: {
		text: "Não foi possível concluir a ação. Atualize a tela e tente novamente.",
		tone: "warning",
	},
};

function formatDate(value: string | null): string {
	if (!value) return "Ainda não registrado";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Ainda não registrado"
		: new Intl.DateTimeFormat("pt-BR", {
				dateStyle: "short",
				timeStyle: "short",
			}).format(date);
}

function roleLabel(role: string): string {
	if (role === "owner") return "Responsável";
	if (role === "admin") return "Administrador";
	if (role === "editor") return "Editor";
	return "Consulta";
}

export default async function AnaPage({
	searchParams,
}: {
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
	await requireAdminSession();
	const [loaded, query] = await Promise.all([loadAnaAdmin(), searchParams]);
	const view = loaded.ok ? loaded.view : null;
	const loadError = loaded.ok ? null : loaded.error;
	const notice =
		typeof query.notice === "string" ? notices[query.notice] : null;

	if (!view) {
		const message =
			loadError === "not_authorized"
				? "Sua conta ainda não tem permissão para consultar a configuração da ANA."
				: loadError === "not_configured"
					? "A conexão com o Supabase ainda não está configurada neste ambiente."
					: "Não foi possível carregar a configuração. Atualize a página e tente novamente.";
		return (
			<div className="page-stack" id="ana-admin-page">
				<section className="page-heading">
					<div>
						<p className="eyebrow">ASSISTENTE</p>
						<h1>Atendente virtual ANA</h1>
						<p className="page-description">
							Configure a forma de responder e as informações aprovadas.
						</p>
					</div>
				</section>
				<div className="ana-notice ana-notice--warning" role="status">
					<CircleAlert aria-hidden="true" size={17} />
					{message}
				</div>
			</div>
		);
	}

	const canEdit = ["owner", "admin", "editor"].includes(view.role);
	const requiredTestKeys =
		loaded.ok && Array.isArray(loaded.rawConfiguration.test_cases)
			? loaded.rawConfiguration.test_cases
					.map((item) => {
						if (!item || typeof item !== "object" || Array.isArray(item))
							return null;
						const key = (item as Record<string, unknown>).key;
						return typeof key === "string" ? key : null;
					})
					.filter((key): key is string => key !== null)
			: [];
	const publishTest = view.testRuns.find(
		(run) =>
			run.draftRevision === view.draftRevision &&
			run.failedCount === 0 &&
			run.passedCount === requiredTestKeys.length &&
			run.scenarioKeys.length === requiredTestKeys.length &&
			run.scenarioKeys.every((key, index) => key === requiredTestKeys[index]) &&
			view.testCaseCount > 0,
	);

	return (
		<div className="page-stack" id="ana-admin-page">
			<section className="page-heading">
				<div>
					<p className="eyebrow">ASSISTENTE</p>
					<h1>Atendente virtual ANA</h1>
					<p className="page-description">
						Ajuste a comunicação e as informações aprovadas. Salvar cria um
						rascunho; a versão ativa só muda depois do teste e da publicação.
					</p>
				</div>
				<span className="ana-role-badge">{roleLabel(view.role)}</span>
			</section>

			{notice ? (
				<div className={`ana-notice ana-notice--${notice.tone}`} role="status">
					{notice.tone === "success" ? (
						<Check aria-hidden="true" size={17} />
					) : (
						<CircleAlert aria-hidden="true" size={17} />
					)}
					{notice.text}
				</div>
			) : null}

			<section className="ana-status-grid" aria-label="Estado da ANA">
				<article className="ana-status-card">
					<span>VERSÃO ATIVA</span>
					<strong>
						{view.activeVersion ? `v${view.activeVersion}` : "Nenhuma"}
					</strong>
					<small>{formatDate(view.activeCreatedAt)}</small>
				</article>
				<article className="ana-status-card">
					<span>RASCUNHO</span>
					<strong>Revisão {view.draftRevision}</strong>
					<small>Atualizado em {formatDate(view.draftUpdatedAt)}</small>
				</article>
				<article className="ana-status-card">
					<span>REGRAS E CENÁRIOS</span>
					<strong>{view.enabledTriggerCount} regras ativas</strong>
					<small>
						{view.testCaseCount} cenários · {view.knowledge.length} informações
						cadastradas
					</small>
				</article>
			</section>

			<section
				className="section-block ana-section"
				aria-labelledby="ana-behavior-heading"
			>
				<div className="section-heading">
					<div>
						<h2 id="ana-behavior-heading">Como a ANA conversa</h2>
						<p>Preferências aplicadas à próxima versão publicada.</p>
					</div>
					<Bot aria-hidden="true" size={19} />
				</div>

				{canEdit ? (
					<form action={saveAnaDraft} className="ana-editor-form">
						<input
							type="hidden"
							name="expected_revision"
							value={view.draftRevision}
						/>
						<div className="ana-field-grid">
							<label className="ana-field">
								<span>Tom</span>
								<select defaultValue={view.tone} name="behavior_tone">
									<option value="cordial">Cordial e objetiva</option>
									<option value="warm">Acolhedora</option>
									<option value="neutral">Neutra e profissional</option>
								</select>
							</label>
							<label className="ana-field">
								<span>Comprimento das respostas</span>
								<select
									defaultValue={view.conciseness}
									name="behavior_conciseness"
								>
									<option value="short">Curtas</option>
									<option value="balanced">Objetivas, com contexto</option>
								</select>
							</label>
							<label className="ana-field">
								<span>Emojis</span>
								<select defaultValue={view.emoji} name="behavior_emoji">
									<option value="never">Não usar</option>
									<option value="sparingly">Usar com moderação</option>
								</select>
							</label>
							<label className="ana-check-field">
								<input
									defaultChecked={view.useKnownFirstName}
									name="use_known_first_name"
									type="checkbox"
								/>
								<span>
									Usar o primeiro nome conhecido na primeira saudação do dia
								</span>
							</label>
						</div>

						<div className="ana-knowledge-heading">
							<div>
								<h3>Informações que a ANA pode usar</h3>
								<p>
									Rascunhos e informações arquivadas não entram nas respostas.
								</p>
							</div>
							<ShieldCheck aria-hidden="true" size={18} />
						</div>

						{view.knowledge.length ? (
							<div className="ana-knowledge-list">
								{view.knowledge.map((item) => (
									<article className="ana-knowledge-card" key={item.key}>
										<div className="ana-knowledge-card__top">
											<label className="ana-field ana-field--title">
												<span>Título</span>
												<input
													defaultValue={item.title}
													maxLength={100}
													name={`knowledge_title_${item.key}`}
													required
													type="text"
												/>
											</label>
											<label className="ana-field ana-field--status">
												<span>Situação</span>
												<select
													defaultValue={item.status}
													name={`knowledge_status_${item.key}`}
												>
													<option value="draft">Rascunho</option>
													<option value="published">Aprovada</option>
													<option value="archived">Arquivada</option>
												</select>
											</label>
										</div>
										<label className="ana-field">
											<span>Resposta aprovada</span>
											<textarea
												defaultValue={item.content}
												maxLength={1600}
												name={`knowledge_content_${item.key}`}
												required
												rows={3}
											/>
										</label>
										<label className="ana-field">
											<span>Palavras-chave (uma por linha)</span>
											<textarea
												defaultValue={item.keywords.join("\n")}
												maxLength={800}
												name={`knowledge_keywords_${item.key}`}
												rows={2}
											/>
										</label>
									</article>
								))}
							</div>
						) : (
							<p className="ana-empty-copy">
								Ainda não há informações cadastradas.
							</p>
						)}

						{view.knowledge.length < 30 ? (
							<details className="ana-add-knowledge">
								<summary>Adicionar informação</summary>
								<div className="ana-field-grid ana-field-grid--new">
									<label className="ana-field">
										<span>Título</span>
										<input
											maxLength={100}
											name="new_knowledge_title"
											type="text"
										/>
									</label>
									<label className="ana-field ana-field--wide">
										<span>Conteúdo aprovado</span>
										<textarea
											maxLength={1600}
											name="new_knowledge_content"
											rows={3}
										/>
									</label>
									<label className="ana-field ana-field--wide">
										<span>Palavras-chave (uma por linha)</span>
										<textarea
											maxLength={800}
											name="new_knowledge_keywords"
											rows={2}
										/>
									</label>
								</div>
								<p className="ana-field-hint">
									A nova informação começa como rascunho. Revise e aprove antes
									de publicar.
								</p>
							</details>
						) : null}

						<div className="ana-form-footer">
							<p>
								Salvar não envia mensagens e não altera a versão em atendimento.
							</p>
							<button className="button button--primary" type="submit">
								<Save aria-hidden="true" size={16} />
								Salvar rascunho
							</button>
						</div>
					</form>
				) : (
					<p className="ana-readonly-note">
						Seu perfil pode consultar a configuração, mas não alterar o
						rascunho.
					</p>
				)}
			</section>

			<section className="ana-operation-grid" aria-label="Validação e canais">
				<article className="section-block ana-section">
					<div className="section-heading">
						<div>
							<h2>Teste antes de publicar</h2>
							<p>
								Simula os cenários salvos, pode usar IA e registra o resultado.
								Não envia mensagens ao WhatsApp.
							</p>
						</div>
						<FlaskConical aria-hidden="true" size={18} />
					</div>
					<div className="ana-test-summary">
						<strong>{view.testCaseCount} cenários</strong>
						<span>
							{publishTest
								? "Todos passaram para este rascunho."
								: "É necessário um teste completo aprovado nesta revisão."}
						</span>
					</div>
					{canEdit ? (
						<form action={runAnaDraftTest} className="ana-action-form">
							<input
								type="hidden"
								name="expected_revision"
								value={view.draftRevision}
							/>
							<button
								className="button button--secondary"
								disabled={view.testCaseCount === 0}
								type="submit"
							>
								<Sparkles aria-hidden="true" size={16} />
								Executar teste seguro
							</button>
						</form>
					) : null}
					{view.testRuns.length ? (
						<ul className="ana-test-list">
							{view.testRuns.slice(0, 3).map((run) => (
								<li key={run.id}>
									<span>
										Revisão {run.draftRevision} · {formatDate(run.createdAt)}
									</span>
									<strong
										className={
											run.failedCount === 0 ? "ana-test-pass" : "ana-test-fail"
										}
									>
										{run.passedCount} aprovados · {run.failedCount} falhas
									</strong>
								</li>
							))}
						</ul>
					) : null}
				</article>

				<article className="section-block ana-section">
					<div className="section-heading">
						<div>
							<h2>Números conectados</h2>
							<p>Estado por canal, sem exibir credenciais.</p>
						</div>
						<MessageCircle aria-hidden="true" size={18} />
					</div>
					{view.channels.length ? (
						<ul className="ana-channel-list">
							{view.channels.map((channel) => (
								<li key={channel.id}>
									<div>
										<strong>{channel.name}</strong>
										<small>
											{channel.phoneLast4
												? `•••• ${channel.phoneLast4}`
												: "Número não identificado"}
										</small>
									</div>
									<span
										className={
											channel.anaEnabled
												? "ana-channel-state ana-channel-state--on"
												: "ana-channel-state"
										}
									>
										{channel.anaEnabled ? "ANA habilitada" : "ANA desligada"}
									</span>
									<p>
										Entrada {channel.captureEnabled ? "ativa" : "pausada"} ·
										Saída {channel.sendEnabled ? "ativa" : "pausada"} ·{" "}
										{channel.homologated
											? "homologação registrada"
											: "homologação pendente"}
									</p>
								</li>
							))}
						</ul>
					) : (
						<p className="ana-empty-copy">
							Os canais ainda não aparecem para este perfil.
						</p>
					)}
				</article>
			</section>

			<section
				className="section-block ana-section"
				aria-labelledby="ana-publish-heading"
			>
				<div className="section-heading">
					<div>
						<h2 id="ana-publish-heading">Publicar versão</h2>
						<p>
							Somente o responsável pode ativar uma versão, após todos os
							cenários passarem.
						</p>
					</div>
					<ShieldCheck aria-hidden="true" size={18} />
				</div>
				{view.role === "owner" ? (
					<form action={publishAnaDraft} className="ana-publish-form">
						<input
							type="hidden"
							name="expected_revision"
							value={view.draftRevision}
						/>
						<label className="ana-field">
							<span>Nota desta publicação</span>
							<input
								maxLength={240}
								minLength={3}
								name="publish_note"
								required
								type="text"
							/>
						</label>
						<label className="ana-check-field ana-publish-confirm">
							<input name="confirm_publish" required type="checkbox" />
							<span>
								Confirmo ativar este rascunho como nova versão da ANA.
							</span>
						</label>
						<button
							className="button button--primary"
							disabled={!publishTest}
							type="submit"
						>
							<Sparkles aria-hidden="true" size={16} />
							Publicar versão testada
						</button>
					</form>
				) : (
					<p className="ana-readonly-note">
						A publicação e o rollback ficam restritos ao perfil responsável.
					</p>
				)}
			</section>

			<section
				className="section-block ana-section"
				aria-labelledby="ana-rollback-heading"
			>
				<div className="section-heading">
					<div>
						<h2 id="ana-rollback-heading">Versões anteriores</h2>
						<p>
							Reativar uma versão muda imediatamente as instruções usadas pela
							ANA.
						</p>
					</div>
					<RotateCcw aria-hidden="true" size={18} />
				</div>
				{view.role === "owner" ? (
					view.versions.filter(
						(version) => version.version !== view.activeVersion,
					).length ? (
						<ul className="ana-version-list">
							{view.versions
								.filter((version) => version.version !== view.activeVersion)
								.slice(0, 5)
								.map((version) => (
									<li key={version.id}>
										<div className="ana-version-copy">
											<strong>Versão v{version.version}</strong>
											<span>{formatDate(version.createdAt)}</span>
											<p>{version.changeNote || "Sem nota registrada."}</p>
										</div>
										<form
											action={rollbackAnaVersion}
											className="ana-rollback-form"
										>
											<input
												type="hidden"
												name="version_id"
												value={version.id}
											/>
											<label className="ana-field">
												<span>Motivo da reativação</span>
												<input
													maxLength={240}
													minLength={3}
													name="rollback_note"
													required
													type="text"
												/>
											</label>
											<label className="ana-check-field">
												<input
													name="confirm_rollback"
													required
													type="checkbox"
												/>
												<span>Confirmo reativar esta versão agora.</span>
											</label>
											<button
												className="button button--secondary"
												type="submit"
											>
												<RotateCcw aria-hidden="true" size={15} />
												Reativar v{version.version}
											</button>
										</form>
									</li>
								))}
						</ul>
					) : (
						<p className="ana-empty-copy">
							Ainda não há outras versões publicadas.
						</p>
					)
				) : (
					<p className="ana-readonly-note">
						A reativação de versões fica restrita ao perfil responsável.
					</p>
				)}
			</section>

			<p className="ana-footer-note">
				<ShieldCheck aria-hidden="true" size={15} />A configuração publicada
				continua sujeita aos gates de segurança e aos estados ativos de cada
				número.
			</p>
		</div>
	);
}

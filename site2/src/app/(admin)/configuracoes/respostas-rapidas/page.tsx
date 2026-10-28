import { ArrowLeft, Star } from "lucide-react";
import Link from "next/link";
import { getAttendanceQuickReplies } from "@/lib/supabase/admin-attendance";
import { pauseQuickReply, saveQuickReply } from "../quick-replies-actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function noticeText(code: string): string | null {
	const messages: Record<string, string> = {
		saved: "Resposta rápida salva e disponível no atendimento.",
		paused: "Resposta rápida pausada. O texto continua salvo para reativação.",
		quick_reply_title_required: "Informe um título para a resposta.",
		quick_reply_content_required: "Escreva o texto da resposta.",
		quick_reply_title_conflict:
			"Já existe uma resposta rápida com esse título.",
		quick_reply_not_found: "Essa resposta rápida não está mais disponível.",
		invalid_quick_reply_id: "Não foi possível localizar essa resposta rápida.",
		invalid_quick_reply_order:
			"A ordem precisa ser um número inteiro entre -9999 e 9999.",
		not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
		not_authorized: "Seu perfil não pode alterar respostas rápidas.",
		not_configured: "A conexão do atendimento não está configurada.",
		invalid_response:
			"O serviço retornou uma resposta inválida. Tente novamente.",
		unavailable: "Não foi possível salvar agora. Tente novamente.",
	};
	return messages[code] ?? null;
}

export default async function QuickRepliesPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const query = await searchParams;
	const noticeCode = param(query.notice);
	const notice = noticeText(noticeCode);
	const result = await getAttendanceQuickReplies(true);
	const items = result.ok ? result.data : [];
	const activeCount = items.filter((item) => item.isActive).length;
	const error = result.ok
		? null
		: result.error === "not_authenticated"
			? "Entre novamente para consultar as respostas rápidas."
			: result.error === "not_authorized"
				? "Seu perfil não pode consultar as respostas rápidas."
				: "Não foi possível carregar as respostas rápidas agora.";

	return (
		<div className="page-stack quick-replies-page">
			<section className="page-heading">
				<div>
					<p className="eyebrow">ATENDIMENTO</p>
					<h1>Respostas rápidas</h1>
					<p className="page-description">
						Salve textos que a equipe usa com frequência. Eles entram na caixa
						de mensagem para revisão; nunca são enviados automaticamente.
					</p>
				</div>
				<Link className="quick-replies-back" href="/configuracoes">
					<ArrowLeft aria-hidden="true" size={15} />
					Configurações
				</Link>
			</section>

			{notice && (
				<p className="quick-replies-notice" role="status">
					{notice}
				</p>
			)}
			{error && (
				<p className="quick-replies-error" role="alert">
					{error}
				</p>
			)}

			<section
				className="section-block"
				aria-labelledby="new-quick-reply-heading"
			>
				<div className="section-heading">
					<div>
						<h2 id="new-quick-reply-heading">Criar resposta</h2>
						<p>O título aparece no seletor da conversa.</p>
					</div>
				</div>
				<form action={saveQuickReply} className="quick-reply-form">
					<label>
						<span>Título</span>
						<input maxLength={80} name="title" required />
					</label>
					<label>
						<span>Texto da mensagem</span>
						<textarea maxLength={4000} name="content" required rows={4} />
					</label>
					<div className="quick-reply-form-footer">
						<label className="quick-reply-checkbox">
							<input defaultChecked name="is_favorite" type="checkbox" />
							Favorita
						</label>
						<label className="quick-reply-order">
							<span>Ordem</span>
							<input
								max={9999}
								min={-9999}
								name="sort_order"
								type="number"
								defaultValue={0}
							/>
						</label>
						<button className="quick-reply-save" type="submit">
							Salvar resposta
						</button>
					</div>
				</form>
			</section>

			<section
				className="section-block"
				aria-labelledby="saved-quick-replies-heading"
			>
				<div className="section-heading">
					<div>
						<h2 id="saved-quick-replies-heading">Textos salvos</h2>
						<p>
							{activeCount} ativas · {items.length - activeCount} pausadas
						</p>
					</div>
				</div>
				{items.length ? (
					<div className="quick-replies-list">
						{items.map((item) => (
							<details className="quick-reply-item" key={item.id}>
								<summary>
									<span className="quick-reply-item-title">
										{item.isFavorite && (
											<Star aria-label="Favorita" size={13} />
										)}
										{item.title}
									</span>
									<span
										className={
											item.isActive
												? "quick-reply-state quick-reply-state--active"
												: "quick-reply-state"
										}
									>
										{item.isActive ? "Ativa" : "Pausada"}
									</span>
								</summary>
								<div className="quick-reply-item-content">
									<form action={saveQuickReply} className="quick-reply-form">
										<input name="id" type="hidden" value={item.id} />
										<label>
											<span>Título</span>
											<input
												defaultValue={item.title}
												maxLength={80}
												name="title"
												required
											/>
										</label>
										<label>
											<span>Texto da mensagem</span>
											<textarea
												defaultValue={item.content}
												maxLength={4000}
												name="content"
												required
												rows={4}
											/>
										</label>
										<div className="quick-reply-form-footer">
											<label className="quick-reply-checkbox">
												<input
													defaultChecked={item.isFavorite}
													name="is_favorite"
													type="checkbox"
												/>
												Favorita
											</label>
											<label className="quick-reply-order">
												<span>Ordem</span>
												<input
													defaultValue={item.sortOrder}
													max={9999}
													min={-9999}
													name="sort_order"
													type="number"
												/>
											</label>
											<button className="quick-reply-save" type="submit">
												{item.isActive
													? "Salvar alterações"
													: "Salvar e reativar"}
											</button>
										</div>
									</form>
									{item.isActive && (
										<form action={pauseQuickReply}>
											<input name="id" type="hidden" value={item.id} />
											<button className="quick-reply-pause" type="submit">
												Pausar resposta
											</button>
										</form>
									)}
								</div>
							</details>
						))}
					</div>
				) : !error ? (
					<p className="quick-replies-empty">
						Ainda não há respostas rápidas cadastradas.
					</p>
				) : null}
			</section>
		</div>
	);
}

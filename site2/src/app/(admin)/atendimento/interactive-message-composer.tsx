"use client";

import { ChevronDown, List, Send, SquareMousePointer } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { sendAttendanceInteractive } from "./interactive-actions";

type MessageKind = "button" | "list";

const ERROR_TEXT: Record<string, string> = {
	service_window_closed:
		"A janela de atendimento encerrou. Aguarde uma mensagem do cliente.",
	human_send_not_homologated:
		"O envio interativo ainda não foi homologado para este número.",
	meta_canary_destination_blocked:
		"Este cliente não está liberado para o envio de homologação.",
	meta_send_uncertain:
		"A Meta não confirmou o resultado. Confira a conversa antes de tentar outro envio interativo.",
	rate_limited: "Muitas mensagens foram enviadas. Aguarde um pouco.",
	idempotency_conflict:
		"O envio mudou durante a tentativa. Atualize a conversa.",
	interactive_buttons_invalid:
		"Use de 1 a 3 opções, com até 20 caracteres cada.",
	interactive_list_invalid:
		"Confira o botão da lista e suas opções (até 10, com títulos curtos).",
	meta_transport_not_configured:
		"O envio pela Meta não está configurado para este número.",
	not_authorized: "Seu perfil não pode enviar mensagens interativas.",
	not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
	interactive_invalid: "Confira o formato e os campos da mensagem.",
	interactive_body_invalid: "Escreva uma mensagem de até 1.024 caracteres.",
	interactive_header_invalid: "O cabeçalho pode ter até 60 caracteres.",
	interactive_footer_invalid: "O rodapé pode ter até 60 caracteres.",
	unavailable:
		"Não foi possível concluir o envio. Atualize a conversa e confira o histórico.",
};

function lines(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

export function InteractiveMessageComposer({
	conversationId,
	enabled,
}: {
	conversationId: string;
	enabled: boolean;
}) {
	const router = useRouter();
	const busyRef = useRef(false);
	const [kind, setKind] = useState<MessageKind>("button");
	const [body, setBody] = useState("");
	const [choicesText, setChoicesText] = useState("");
	const [listButton, setListButton] = useState("Ver opções");
	const [header, setHeader] = useState("");
	const [footer, setFooter] = useState("");
	const [busy, setBusy] = useState(false);
	const [uncertain, setUncertain] = useState(false);
	const [notice, setNotice] = useState("");
	const choices = lines(choicesText);
	const duplicateChoices =
		new Set(choices.map((choice) => choice.toLocaleLowerCase("pt-BR"))).size !==
		choices.length;
	const validCount =
		choices.length >= 1 &&
		(kind === "button" ? choices.length <= 3 : choices.length <= 10);
	const validLengths = choices.every(
		(choice) => choice.length <= (kind === "button" ? 20 : 24),
	);
	const canSend =
		Boolean(body.trim()) &&
		body.trim().length <= 1024 &&
		validCount &&
		validLengths &&
		!duplicateChoices &&
		(kind === "button" ||
			(listButton.trim().length > 0 && listButton.length <= 20));
	if (!enabled) {
		return (
			<p className="inbox-interactive-unavailable">
				Botões e listas ficam disponíveis quando este número usa a Cloud API
				Meta homologada.
			</p>
		);
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!canSend || busyRef.current || uncertain) return;
		busyRef.current = true;
		setBusy(true);
		setNotice("Enviando mensagem interativa…");
		try {
			const idempotencyKey = crypto.randomUUID();
			const result = await sendAttendanceInteractive({
				conversationId,
				idempotencyKey,
				kind,
				body: body.trim(),
				...(header.trim() ? { header: header.trim() } : {}),
				...(footer.trim() ? { footer: footer.trim() } : {}),
				...(kind === "button"
					? { buttonTitles: choices }
					: {
							listButton: listButton.trim(),
							options: choices.map((title) => ({ title })),
						}),
			});
			if (!result.ok) {
				setUncertain(result.error === "meta_send_uncertain");
				setNotice(ERROR_TEXT[result.error] ?? ERROR_TEXT.unavailable);
				return;
			}
			setNotice("Mensagem enviada ao WhatsApp.");
			setBody("");
			setChoicesText("");
			router.refresh();
		} catch {
			setUncertain(true);
			setNotice(ERROR_TEXT.meta_send_uncertain);
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}

	return (
		<details
			className="inbox-interactive-compose"
			onToggle={(event) => {
				if (!event.currentTarget.open) setNotice("");
			}}
		>
			<summary>
				<span className="inbox-interactive-title">
					<SquareMousePointer aria-hidden="true" size={15} />
					Mensagem interativa
				</span>
				<ChevronDown
					aria-hidden="true"
					className="inbox-interactive-chevron"
					size={15}
				/>
			</summary>
			<form onSubmit={submit}>
				<label className="inbox-compose-label" htmlFor="interactive-kind">
					Formato
				</label>
				<select
					id="interactive-kind"
					value={kind}
					disabled={busy || uncertain}
					onChange={(event) => {
						setKind(event.target.value as MessageKind);
						setChoicesText("");
						setNotice("");
					}}
				>
					<option value="button">Botões de resposta</option>
					<option value="list">Lista de opções</option>
				</select>
				<label className="inbox-compose-label" htmlFor="interactive-body">
					Mensagem
				</label>
				<textarea
					id="interactive-body"
					maxLength={1024}
					rows={2}
					value={body}
					disabled={busy || uncertain}
					onChange={(event) => setBody(event.target.value)}
					placeholder="Escreva a pergunta ou instrução…"
				/>
				<label className="inbox-compose-label" htmlFor="interactive-choices">
					{kind === "button"
						? "Botões (um por linha, até 3)"
						: "Opções (uma por linha, até 10)"}
				</label>
				<textarea
					id="interactive-choices"
					maxLength={kind === "button" ? 65 : 260}
					rows={Math.min(4, Math.max(2, choices.length + 1))}
					value={choicesText}
					disabled={busy || uncertain}
					onChange={(event) => setChoicesText(event.target.value)}
					placeholder={kind === "button" ? "Sim\nNão" : "Arroz\nFeijão\nÓleo"}
				/>
				{kind === "list" && (
					<label className="inbox-interactive-list-button">
						<span>Texto do botão da lista</span>
						<input
							maxLength={20}
							value={listButton}
							disabled={busy || uncertain}
							onChange={(event) => setListButton(event.target.value)}
						/>
					</label>
				)}
				<details className="inbox-interactive-extra">
					<summary>Adicionar cabeçalho ou rodapé</summary>
					<div>
						<label>
							<span>Cabeçalho (opcional)</span>
							<input
								maxLength={60}
								value={header}
								disabled={busy || uncertain}
								onChange={(event) => setHeader(event.target.value)}
							/>
						</label>
						<label>
							<span>Rodapé (opcional)</span>
							<input
								maxLength={60}
								value={footer}
								disabled={busy || uncertain}
								onChange={(event) => setFooter(event.target.value)}
							/>
						</label>
					</div>
				</details>
				{body.trim() && choices.length > 0 && (
					<div className="inbox-interactive-preview">
						<strong>Prévia</strong>
						<p>{body.trim()}</p>
						{header.trim() && <span>{header.trim()}</span>}
						<ul>
							{choices.map((choice) => (
								<li key={choice}>
									{kind === "button" ? (
										<SquareMousePointer size={12} />
									) : (
										<List size={12} />
									)}
									{choice}
								</li>
							))}
						</ul>
						{footer.trim() && <span>{footer.trim()}</span>}
					</div>
				)}
				{duplicateChoices && (
					<p className="inbox-interactive-validation">
						Remova opções repetidas.
					</p>
				)}
				{choices.some(
					(choice) => choice.length > (kind === "button" ? 20 : 24),
				) && (
					<p className="inbox-interactive-validation">
						{kind === "button"
							? "Cada botão pode ter até 20 caracteres."
							: "Cada opção pode ter até 24 caracteres."}
					</p>
				)}
				<p className="inbox-interactive-hint">
					O servidor confere a janela de atendimento e a homologação antes do
					envio.
				</p>
				<button
					className="inbox-interactive-send"
					disabled={!canSend || busy || uncertain}
					type="submit"
				>
					<Send aria-hidden="true" size={14} />
					{busy
						? "Enviando…"
						: kind === "button"
							? "Enviar botões"
							: "Enviar lista"}
				</button>
				{notice && (
					<p aria-live="polite" className="inbox-interactive-status">
						{notice}
					</p>
				)}
			</form>
		</details>
	);
}

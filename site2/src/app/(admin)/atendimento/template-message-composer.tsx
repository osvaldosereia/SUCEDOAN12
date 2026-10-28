"use client";

import { ChevronDown, FileText, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import {
	listAttendanceTemplates,
	sendAttendanceTemplate,
} from "./template-actions";

type AttendanceTemplate = {
	id: string;
	name: string;
	language: string;
	category: string;
	body: string;
	parameterCount: number;
};

const ERROR_TEXT: Record<string, string> = {
	not_configured: "A conexão com o Supabase ainda não está configurada.",
	not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
	not_authorized: "Seu perfil não pode enviar modelos pelo atendimento.",
	unavailable: "Não foi possível carregar ou enviar o modelo. Tente novamente.",
	invalid_account_id: "O número selecionado não está disponível.",
	meta_template_send_uncertain:
		"A Meta pode ter recebido a mensagem. Confira a conversa antes de qualquer novo envio.",
	meta_send_uncertain:
		"A Meta pode ter recebido a mensagem. Confira a conversa antes de qualquer novo envio.",
	template_not_sendable:
		"Este modelo não está aprovado e liberado para este número.",
	template_parameter_count_mismatch:
		"Os campos deste modelo mudaram. Atualize a conversa e tente novamente.",
	template_parameter_invalid: "Preencha todos os campos do modelo.",
	template_parameters_invalid: "Preencha todos os campos do modelo.",
	template_dynamic_component_unsupported:
		"Este modelo usa um componente que ainda não pode ser enviado pelo atendimento.",
	meta_template_send_not_homologated:
		"O envio de modelos ainda não foi homologado para este número.",
	meta_canary_destination_blocked:
		"Este cliente não está liberado para a homologação do canal.",
	meta_transport_not_configured:
		"O envio oficial da Meta não está configurado para este número.",
	rate_limited: "Muitas mensagens foram enviadas. Aguarde um pouco.",
	idempotency_conflict:
		"O envio mudou durante a tentativa. Atualize a conversa antes de tentar novamente.",
	invalid_template_id: "O modelo selecionado não está mais disponível.",
	invalid_conversation_id:
		"A conversa mudou. Atualize a página e tente novamente.",
	invalid_idempotency_key: "Atualize a conversa antes de tentar novamente.",
};

function renderBody(template: AttendanceTemplate, values: string[]): string {
	return template.body.replace(
		/\{\{([1-9][0-9]*)\}\}/g,
		(placeholder, index) => {
			return values[Number(index) - 1]?.trim() || placeholder;
		},
	);
}

export function TemplateMessageComposer({
	accountId,
	conversationId,
}: {
	accountId: string;
	conversationId: string;
}) {
	const router = useRouter();
	const loadingRef = useRef(false);
	const busyRef = useRef(false);
	const [loaded, setLoaded] = useState(false);
	const [loading, setLoading] = useState(false);
	const [templates, setTemplates] = useState<AttendanceTemplate[]>([]);
	const [templateId, setTemplateId] = useState("");
	const [parameters, setParameters] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);
	const [uncertain, setUncertain] = useState(false);
	const [notice, setNotice] = useState("");
	const selectedTemplate = templates.find((item) => item.id === templateId);
	const parameterNumbers = selectedTemplate
		? Array.from(
				{ length: selectedTemplate.parameterCount },
				(_, index) => index + 1,
			)
		: [];
	const parametersReady = parameters.every((parameter) =>
		Boolean(parameter.trim()),
	);

	async function loadTemplates() {
		if (loadingRef.current || loaded) return;
		loadingRef.current = true;
		setLoading(true);
		setNotice("Carregando modelos liberados para este número…");
		try {
			const result = await listAttendanceTemplates({ accountId });
			if (!result.ok) {
				setNotice(ERROR_TEXT[result.error] ?? ERROR_TEXT.unavailable);
				return;
			}
			setTemplates(result.templates);
			setLoaded(true);
			setTemplateId(
				result.templates.length === 1 ? result.templates[0].id : "",
			);
			setParameters(
				result.templates.length === 1
					? Array.from({ length: result.templates[0].parameterCount }, () => "")
					: [],
			);
			setNotice(
				result.templates.length === 0
					? "Nenhum modelo de utilidade aprovado e liberado para este número."
					: "",
			);
		} catch {
			setNotice(ERROR_TEXT.unavailable);
		} finally {
			loadingRef.current = false;
			setLoading(false);
		}
	}

	function selectTemplate(id: string) {
		setTemplateId(id);
		const template = templates.find((item) => item.id === id);
		setParameters(
			template ? Array.from({ length: template.parameterCount }, () => "") : [],
		);
		setNotice("");
		setUncertain(false);
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedTemplate || !parametersReady || busyRef.current || uncertain) {
			return;
		}
		busyRef.current = true;
		setBusy(true);
		setNotice("Enviando modelo aprovado…");
		try {
			const result = await sendAttendanceTemplate({
				accountId,
				conversationId,
				templateId: selectedTemplate.id,
				parameters,
				idempotencyKey: crypto.randomUUID(),
			});
			if (!result.ok) {
				setUncertain(result.error === "meta_send_uncertain");
				setNotice(ERROR_TEXT[result.error] ?? ERROR_TEXT.unavailable);
				return;
			}
			setNotice(
				result.duplicate
					? "Este envio já estava registrado. A conversa foi atualizada."
					: "Modelo enviado ao WhatsApp.",
			);
			setParameters(
				Array.from({ length: selectedTemplate.parameterCount }, () => ""),
			);
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
				if (event.currentTarget.open) void loadTemplates();
				else if (!uncertain) setNotice("");
			}}
		>
			<summary>
				<span className="inbox-interactive-title">
					<FileText aria-hidden="true" size={15} />
					Modelo aprovado
				</span>
				<ChevronDown
					aria-hidden="true"
					className="inbox-interactive-chevron"
					size={15}
				/>
			</summary>
			<form onSubmit={submit}>
				{loading && <p className="inbox-interactive-hint">Carregando…</p>}
				{loaded && templates.length > 0 && (
					<>
						<label
							className="inbox-compose-label"
							htmlFor="attendance-template"
						>
							Modelo e idioma
						</label>
						<select
							id="attendance-template"
							value={templateId}
							disabled={busy || uncertain}
							onChange={(event) => selectTemplate(event.target.value)}
						>
							<option value="">Escolher modelo…</option>
							{templates.map((template) => (
								<option key={template.id} value={template.id}>
									{template.name} · {template.language}
								</option>
							))}
						</select>
					</>
				)}
				{selectedTemplate &&
					parameterNumbers.map((parameterNumber) => (
						<label
							className="inbox-compose-label"
							key={`${selectedTemplate.id}:parameter-${parameterNumber}`}
						>
							Personalização {parameterNumber}
							<input
								maxLength={1024}
								value={parameters[parameterNumber - 1] ?? ""}
								disabled={busy || uncertain}
								onChange={(event) =>
									setParameters((current) =>
										current.map((item, itemIndex) =>
											itemIndex === parameterNumber - 1
												? event.target.value
												: item,
										),
									)
								}
								placeholder={`Valor para {{${parameterNumber}}}`}
							/>
						</label>
					))}
				{selectedTemplate && (
					<div className="inbox-interactive-preview">
						<strong>Prévia · {selectedTemplate.category}</strong>
						<p>{renderBody(selectedTemplate, parameters)}</p>
					</div>
				)}
				{loaded && templates.length > 0 && (
					<button
						className="inbox-interactive-send"
						disabled={
							!selectedTemplate || !parametersReady || busy || uncertain
						}
						type="submit"
					>
						<Send aria-hidden="true" size={14} />
						{busy ? "Enviando…" : "Enviar modelo"}
					</button>
				)}
				{notice && (
					<p aria-live="polite" className="inbox-interactive-status">
						{notice}
						{!loading && !loaded && !uncertain && (
							<button
								className="inbox-template-retry"
								onClick={() => void loadTemplates()}
								type="button"
							>
								Tentar novamente
							</button>
						)}
					</p>
				)}
				<p className="inbox-interactive-hint">
					Só aparecem modelos de utilidade aprovados e liberados para esta
					conta. Modelos de marketing usam o fluxo próprio de consentimento. O
					servidor confere homologação, destinatário e duplicidade antes de
					enviar.
				</p>
			</form>
		</details>
	);
}

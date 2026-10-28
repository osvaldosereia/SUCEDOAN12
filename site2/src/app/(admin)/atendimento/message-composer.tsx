"use client";

import { Send, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type {
	AttendanceLibraryItem,
	AttendanceQuickReply,
} from "@/lib/supabase/browser-admin-attendance";
import { createClient } from "@/lib/supabase/client";
import { sendAttendanceText } from "./actions";
import { InteractiveMessageComposer } from "./interactive-message-composer";
import {
	completeAttendanceMediaUpload,
	prepareAttendanceMediaUpload,
	sendAttendanceMedia,
} from "./media-actions";

const LIBRARY_BUCKET = "attendance-library-v1";
const OUTBOUND_MIME_LIMITS = new Map<string, number>([
	["image/jpeg", 5 * 1024 * 1024],
	["image/png", 5 * 1024 * 1024],
	["audio/aac", 16 * 1024 * 1024],
	["audio/amr", 16 * 1024 * 1024],
	["audio/mpeg", 16 * 1024 * 1024],
	["audio/mp4", 16 * 1024 * 1024],
	["audio/ogg", 16 * 1024 * 1024],
	["video/mp4", 16 * 1024 * 1024],
	["video/3gpp", 16 * 1024 * 1024],
	["application/pdf", 25 * 1024 * 1024],
	["text/plain", 25 * 1024 * 1024],
	["application/msword", 25 * 1024 * 1024],
	[
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		25 * 1024 * 1024,
	],
	["application/vnd.ms-excel", 25 * 1024 * 1024],
	[
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		25 * 1024 * 1024,
	],
	["application/vnd.ms-powerpoint", 25 * 1024 * 1024],
	[
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		25 * 1024 * 1024,
	],
]);

const MIME_BY_EXTENSION: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".aac": "audio/aac",
	".amr": "audio/amr",
	".mp3": "audio/mpeg",
	".m4a": "audio/mp4",
	".ogg": "audio/ogg",
	".mp4": "video/mp4",
	".3gp": "video/3gpp",
	".pdf": "application/pdf",
	".txt": "text/plain",
	".doc": "application/msword",
	".docx":
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".ppt": "application/vnd.ms-powerpoint",
	".pptx":
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const UPLOAD_ERRORS: Record<string, string> = {
	invalid_media_file: "Escolha um arquivo aceito para o WhatsApp.",
	media_size_invalid: "O arquivo ultrapassa o limite deste tipo de mídia.",
	library_media_kind_invalid: "Este tipo de arquivo não pode ser enviado.",
	library_mime_invalid: "O formato do arquivo não é aceito pelo WhatsApp.",
	library_title_required: "Informe um nome para o arquivo.",
	library_mime_type_invalid: "O formato do arquivo não é aceito pelo WhatsApp.",
	library_original_size_too_large:
		"O arquivo ultrapassa o limite deste tipo de mídia.",
	library_signed_upload_failed: "Não foi possível preparar o envio do arquivo.",
	media_send_uncertain:
		"O WhatsApp não confirmou o resultado. Confira a conversa antes de tentar enviar novamente.",
	meta_send_uncertain:
		"O WhatsApp não confirmou o resultado. Confira a conversa antes de tentar enviar novamente.",
	service_window_closed:
		"A janela de atendimento encerrou. Aguarde uma resposta do cliente ou use um modelo aprovado.",
	human_send_not_homologated:
		"O envio manual ainda não está liberado para este número.",
	meta_transport_not_configured: "O envio de mídia não está configurado.",
	meta_canary_destination_blocked:
		"Este destinatário não está liberado para o envio de homologação.",
	media_provider_unavailable:
		"O serviço de mídia está temporariamente indisponível.",
	rate_limited:
		"O limite de envios foi atingido. Aguarde um pouco e tente novamente.",
	meta_media_content_mismatch:
		"O conteúdo do arquivo não corresponde ao formato selecionado.",
	media_mime_not_allowed: "Este formato não pode ser enviado pelo WhatsApp.",
	library_upload_expired:
		"A preparação expirou. Selecione o arquivo novamente.",
	library_storage_object_missing:
		"O arquivo não chegou ao armazenamento. Selecione-o novamente.",
	library_upload_incomplete:
		"O arquivo não foi concluído. Tente prepará-lo novamente.",
	library_stored_size_mismatch:
		"O tamanho do arquivo não foi confirmado. Selecione-o novamente.",
	library_storage_mime_mismatch:
		"O formato armazenado não corresponde ao arquivo selecionado.",
	library_thumbnail_missing:
		"Não foi possível gerar a miniatura da imagem. Tente novamente.",
	library_upload_not_pending:
		"Este upload expirou. Selecione o arquivo novamente.",
	not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
	not_authorized: "Seu perfil não pode enviar mídia.",
	not_configured: "A conexão do atendimento não está configurada.",
	unavailable: "Não foi possível concluir esta ação. Tente novamente.",
	invalid_response:
		"O serviço retornou uma resposta inválida. Tente novamente.",
};

function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mediaType(file: File): { mimeType: string; maxBytes: number } | null {
	const browserMime = file.type.trim().toLowerCase().split(";")[0] ?? "";
	const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/u)?.[0] ?? "";
	const mimeType = OUTBOUND_MIME_LIMITS.has(browserMime)
		? browserMime
		: MIME_BY_EXTENSION[extension];
	const maxBytes = mimeType ? OUTBOUND_MIME_LIMITS.get(mimeType) : undefined;
	return maxBytes ? { mimeType, maxBytes } : null;
}

async function createImageThumbnail(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file, {
		imageOrientation: "from-image",
	});
	const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	const context = canvas.getContext("2d");
	if (!context) {
		bitmap.close();
		throw new Error("thumbnail_unavailable");
	}
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/jpeg", 0.82),
	);
	if (!blob) throw new Error("thumbnail_unavailable");
	return blob;
}

export function MessageComposer({
	accountId,
	conversationId,
	canSendInteractive,
	search,
	idempotencyKey,
	quickReplies,
	libraryItems,
	libraryUnavailable,
}: {
	accountId: string;
	conversationId: string;
	canSendInteractive: boolean;
	search: string;
	idempotencyKey: string;
	quickReplies: AttendanceQuickReply[];
	libraryItems: AttendanceLibraryItem[];
	libraryUnavailable: boolean;
}) {
	const router = useRouter();
	const fileInput = useRef<HTMLInputElement>(null);
	const busyRef = useRef(false);
	const [message, setMessage] = useState("");
	const [quickReplyId, setQuickReplyId] = useState("");
	const [selectedItemId, setSelectedItemId] = useState("");
	const [uploadedItem, setUploadedItem] =
		useState<AttendanceLibraryItem | null>(null);
	const [caption, setCaption] = useState("");
	const [busy, setBusy] = useState(false);
	const [mediaNotice, setMediaNotice] = useState("");
	const [uncertain, setUncertain] = useState(false);
	const availableItems = uploadedItem
		? [
				uploadedItem,
				...libraryItems.filter((item) => item.id !== uploadedItem.id),
			]
		: libraryItems;
	const selectedItem = availableItems.find(
		(item) => item.id === selectedItemId,
	);

	function applyQuickReply(id: string) {
		setQuickReplyId("");
		const item = quickReplies.find((reply) => reply.id === id);
		if (item)
			setMessage((current) =>
				current ? `${current}\n${item.content}` : item.content,
			);
	}

	async function prepareUpload() {
		if (busyRef.current || uncertain) return;
		const file = fileInput.current?.files?.[0];
		if (!file) {
			setMediaNotice("Escolha um arquivo para continuar.");
			return;
		}
		const resolved = mediaType(file);
		if (!resolved) {
			setMediaNotice(
				"Formato não aceito. Use imagem, áudio, vídeo ou documento compatível com o WhatsApp.",
			);
			return;
		}
		if (file.size < 1 || file.size > resolved.maxBytes) {
			setMediaNotice(
				`Este arquivo pode ter até ${formatBytes(resolved.maxBytes)}.`,
			);
			return;
		}

		busyRef.current = true;
		setBusy(true);
		setMediaNotice("Preparando arquivo…");
		setUncertain(false);
		try {
			const prepared = await prepareAttendanceMediaUpload({
				title: file.name.slice(0, 120),
				filename: file.name,
				mimeType: resolved.mimeType,
				sizeBytes: file.size,
			});
			if (!prepared.ok) {
				setMediaNotice(
					UPLOAD_ERRORS[prepared.error] ?? UPLOAD_ERRORS.unavailable,
				);
				return;
			}

			setMediaNotice("Enviando arquivo ao armazenamento seguro…");
			const supabase = createClient();
			if (prepared.upload.thumbnail) {
				const thumbnail = await createImageThumbnail(file);
				const { error: thumbnailError } = await supabase.storage
					.from(LIBRARY_BUCKET)
					.uploadToSignedUrl(
						prepared.upload.thumbnail.path,
						prepared.upload.thumbnail.token,
						thumbnail,
						{ contentType: "image/jpeg", upsert: false },
					);
				if (thumbnailError) {
					setMediaNotice(UPLOAD_ERRORS.library_thumbnail_missing);
					return;
				}
			}
			const { error } = await supabase.storage
				.from(LIBRARY_BUCKET)
				.uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
					contentType: prepared.upload.mimeType,
					upsert: false,
				});
			if (error) {
				setMediaNotice(
					"Não foi possível armazenar o arquivo. Selecione-o novamente e tente outra vez.",
				);
				return;
			}

			setMediaNotice("Concluindo arquivo…");
			const completed = await completeAttendanceMediaUpload({
				itemId: prepared.upload.itemId,
				sizeBytes: file.size,
			});
			if (!completed.ok) {
				setMediaNotice(
					UPLOAD_ERRORS[completed.error] ?? UPLOAD_ERRORS.unavailable,
				);
				return;
			}

			const item: AttendanceLibraryItem = {
				id: prepared.upload.itemId,
				title: file.name.slice(0, 120),
				mediaKind: prepared.upload.mediaKind,
				mimeType: prepared.upload.mimeType,
				filename: file.name.slice(0, 180),
				sizeBytes: file.size,
				createdAt: new Date().toISOString(),
			};
			setUploadedItem(item);
			setSelectedItemId(item.id);
			setMediaNotice(
				"Arquivo pronto. Revise a seleção e clique em Enviar mídia.",
			);
			if (fileInput.current) fileInput.current.value = "";
		} catch {
			setMediaNotice(UPLOAD_ERRORS.unavailable);
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}

	async function sendMedia() {
		if (!selectedItem || busyRef.current || uncertain) return;
		busyRef.current = true;
		setBusy(true);
		setMediaNotice("Enviando mídia…");
		try {
			const result = await sendAttendanceMedia({
				conversationId,
				itemId: selectedItem.id,
				caption,
				idempotencyKey: crypto.randomUUID(),
			});
			if (!result.ok) {
				const message =
					UPLOAD_ERRORS[result.error] ?? UPLOAD_ERRORS.unavailable;
				const sendUncertain =
					result.error === "meta_send_uncertain" ||
					result.error === "media_send_uncertain";
				setUncertain(sendUncertain);
				setMediaNotice(message);
				return;
			}
			setMediaNotice("Mídia enviada ao WhatsApp.");
			setCaption("");
			setSelectedItemId("");
			router.refresh();
		} catch {
			setUncertain(true);
			setMediaNotice(UPLOAD_ERRORS.meta_send_uncertain);
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	}

	return (
		<div className="inbox-message-composer">
			{quickReplies.length > 0 && (
				<div className="inbox-quick-reply">
					<label className="inbox-compose-label" htmlFor="quick-reply">
						Resposta rápida
					</label>
					<select
						id="quick-reply"
						value={quickReplyId}
						onChange={(event) => applyQuickReply(event.target.value)}
					>
						<option value="">Inserir mensagem salva…</option>
						{quickReplies.map((reply) => (
							<option key={reply.id} value={reply.id}>
								{reply.title}
							</option>
						))}
					</select>
				</div>
			)}
			<form action={sendAttendanceText} className="inbox-compose-form">
				<input name="account_id" type="hidden" value={accountId} />
				<input name="conversation_id" type="hidden" value={conversationId} />
				<input name="search" type="hidden" value={search} />
				<input name="idempotency_key" type="hidden" value={idempotencyKey} />
				<label className="inbox-compose-label" htmlFor="message-text">
					Mensagem
				</label>
				<div className="inbox-compose-row">
					<textarea
						id="message-text"
						maxLength={4000}
						name="text"
						onChange={(event) => setMessage(event.target.value)}
						placeholder="Escreva uma mensagem…"
						required
						rows={2}
						value={message}
					/>
					<button
						aria-label="Enviar mensagem"
						className="inbox-send-button"
						type="submit"
					>
						<Send aria-hidden="true" size={17} />
					</button>
				</div>
				<p>O gateway confere a janela e a autorização antes de enviar.</p>
			</form>
			<InteractiveMessageComposer
				conversationId={conversationId}
				enabled={canSendInteractive}
			/>
			<div className="inbox-media-compose">
				<div className="inbox-media-compose-heading">
					<strong>Anexar mídia</strong>
					{libraryItems.length > 0 && (
						<span>{libraryItems.length} arquivos salvos</span>
					)}
				</div>
				{libraryItems.length > 0 && (
					<label className="inbox-media-library-field">
						<span>Usar arquivo salvo</span>
						<select
							value={selectedItemId}
							disabled={busy || uncertain}
							onChange={(event) => {
								setSelectedItemId(event.target.value);
								setMediaNotice("");
								setUncertain(false);
							}}
						>
							<option value="">Selecionar arquivo…</option>
							{availableItems.map((item) => (
								<option key={item.id} value={item.id}>
									{item.title} · {formatBytes(item.sizeBytes)}
								</option>
							))}
						</select>
					</label>
				)}
				<label className="inbox-media-file-field">
					<span>Enviar novo arquivo</span>
					<input
						accept=".jpg,.jpeg,.png,.aac,.amr,.mp3,.m4a,.ogg,.mp4,.3gp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
						disabled={busy || uncertain}
						ref={fileInput}
						type="file"
					/>
				</label>
				<div className="inbox-media-compose-actions">
					<button
						className="inbox-media-prepare"
						disabled={busy || uncertain}
						onClick={prepareUpload}
						type="button"
					>
						<Upload aria-hidden="true" size={14} />
						Preparar arquivo
					</button>
					{selectedItem && (
						<button
							className="inbox-media-send"
							disabled={busy || uncertain}
							onClick={sendMedia}
							type="button"
						>
							Enviar mídia
						</button>
					)}
				</div>
				{selectedItem && (
					<label className="inbox-media-caption">
						<span>Legenda (opcional)</span>
						<textarea
							maxLength={1024}
							rows={2}
							value={caption}
							disabled={busy || uncertain}
							onChange={(event) => setCaption(event.target.value)}
						/>
					</label>
				)}
				{libraryUnavailable && (
					<p className="inbox-media-library-note">
						A lista de arquivos salvos não carregou; ainda é possível enviar um
						novo arquivo.
					</p>
				)}
				{mediaNotice && (
					<p className="inbox-media-status" role="status">
						{mediaNotice}
					</p>
				)}
				{uncertain && (
					<button
						className="inbox-media-prepare"
						onClick={() => {
							setUncertain(false);
							setMediaNotice(
								"Conversa conferida. Se necessário, clique novamente em Enviar mídia.",
							);
						}}
						type="button"
					>
						Já conferi a conversa
					</button>
				)}
			</div>
		</div>
	);
}

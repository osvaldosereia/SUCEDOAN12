// biome-ignore-all lint/a11y/useMediaCaption: The current media gateway does not provide transcripts or caption files.
"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { loadAttendanceMedia } from "./media-actions";

type LoadResult = Awaited<ReturnType<typeof loadAttendanceMedia>>;

const MEDIA_ERRORS: Record<string, string> = {
	not_configured: "A conexão do atendimento não está configurada.",
	not_authenticated: "Entre novamente para visualizar esta mídia.",
	not_authorized: "Seu perfil não pode acessar esta mídia.",
	media_too_large: "Este arquivo ultrapassa o limite de 20 MB.",
	media_unavailable: "Esta mídia não está disponível para visualização.",
	invalid_message_id: "Não foi possível localizar esta mídia.",
	unavailable: "Não foi possível carregar esta mídia. Tente novamente.",
};

export function MessageMedia({
	messageId,
	messageType,
}: {
	messageId: string;
	messageType: string;
}) {
	const [result, setResult] = useState<LoadResult | null>(null);
	const [isPending, startTransition] = useTransition();
	const media = result?.ok ? result.media : null;
	const mediaExpired = media
		? Date.parse(media.expiresAt) <= Date.now()
		: false;

	function load() {
		if (isPending) return;
		setResult(null);
		startTransition(async () => {
			setResult(await loadAttendanceMedia(messageId));
		});
	}

	return (
		<div className="inbox-message-media">
			{media && !mediaExpired ? (
				<>
					{media.mimeType.startsWith("image/") ? (
						<Image
							alt={
								messageType === "sticker"
									? "Figurinha recebida"
									: "Imagem recebida"
							}
							className="inbox-message-image"
							height={480}
							loading="lazy"
							referrerPolicy="no-referrer"
							src={media.url}
							unoptimized
							width={640}
						/>
					) : media.mimeType.startsWith("audio/") ? (
						<audio
							aria-label="Áudio recebido"
							controls
							preload="metadata"
							src={media.url}
						>
							Seu navegador não reproduz este áudio.
						</audio>
					) : media.mimeType.startsWith("video/") ? (
						<video
							aria-label="Vídeo recebido"
							className="inbox-message-video"
							controls
							preload="metadata"
							src={media.url}
						>
							Seu navegador não reproduz este vídeo.
						</video>
					) : (
						<a href={media.url} rel="noreferrer" target="_blank">
							Abrir {media.filename ?? "arquivo recebido"}
						</a>
					)}
					<button
						className="inbox-message-media-refresh"
						onClick={load}
						type="button"
					>
						Atualizar mídia
					</button>
				</>
			) : (
				<>
					<button
						className="inbox-message-media-load"
						disabled={isPending}
						onClick={load}
						type="button"
					>
						{isPending
							? "Carregando mídia…"
							: mediaExpired
								? "Atualizar mídia"
								: "Carregar mídia"}
					</button>
					{result && !result.ok && (
						<p className="inbox-message-media-error" role="status">
							{MEDIA_ERRORS[result.error] ?? MEDIA_ERRORS.media_unavailable}
						</p>
					)}
				</>
			)}
		</div>
	);
}

"use client";

import { useState } from "react";
import { enableBrowserProductForWhatsapp } from "@/lib/supabase/browser-admin-basket-molds";

const errorMessages: Record<string, string> = {
	not_configured: "A conexão do catálogo ainda não está configurada.",
	not_authenticated: "Entre novamente para alterar o canal.",
	not_authorized: "Esta conta não pode alterar a disponibilidade no WhatsApp.",
	invalid_input: "Atualize a página e tente novamente.",
	not_found: "O produto não foi encontrado. Reabra o cadastro.",
	conflict: "Outra pessoa alterou este canal. Atualize a página e confira.",
	product_inactive:
		"Ative o produto no cadastro antes de habilitá-lo no WhatsApp.",
	flow_name_invalid:
		"Ajuste o nome do produto para usar no Flow e tente novamente.",
	flow_image_invalid:
		"Cadastre uma foto com endereço HTTPS antes de habilitar o Flow.",
	flow_price_invalid:
		"Corrija o preço do produto antes de habilitá-lo no Flow.",
	unavailable:
		"Não foi possível salvar agora. Confira o produto antes de tentar novamente.",
};

export function BasketProductWhatsappEnableAction({
	productId,
	productName,
}: {
	productId: string;
	productName: string;
}) {
	const [pending, setPending] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [message, setMessage] = useState("");
	const [success, setSuccess] = useState(false);

	async function enable() {
		if (pending || !confirming) return;
		setPending(true);
		setMessage("");
		setSuccess(false);
		const result = await enableBrowserProductForWhatsapp(productId);
		setPending(false);
		setSuccess(result.ok);
		if (result.ok) setConfirming(false);
		setMessage(
			result.ok
				? "Produto habilitado para uso no WhatsApp. Atualize a cesta para conferir."
				: (errorMessages[result.error] ?? errorMessages.unavailable),
		);
	}

	return (
		<div className="basket-mold-quick-enable">
			{!confirming && !success && (
				<>
					<button
						disabled={pending}
						onClick={() => {
							setMessage("");
							setConfirming(true);
						}}
						type="button"
					>
						Habilitar no WhatsApp
					</button>
					<p>
						{productName} poderá aparecer nas opções de Flow de todas as cestas
						onde está associado.
					</p>
				</>
			)}
			{confirming && (
				<fieldset
					aria-live="polite"
					className="basket-mold-quick-enable__confirmation"
					disabled={pending}
				>
					<legend>Confirme a disponibilidade do produto</legend>
					<p>
						Habilitar {productName} pode disponibilizá-lo em todas as cestas
						onde já está associado. Deseja continuar?
					</p>
					<div className="basket-mold-quick-enable__confirmation-actions">
						<button
							onClick={() => {
								setConfirming(false);
								setMessage("");
							}}
							type="button"
						>
							Cancelar
						</button>
						<button onClick={enable} type="button">
							{pending ? "Habilitando…" : "Habilitar produto"}
						</button>
					</div>
				</fieldset>
			)}
			{message && (
				<span
					aria-live="polite"
					className={`basket-mold-quick-enable__message basket-mold-quick-enable__message--${success ? "success" : "error"}`}
					role="status"
				>
					{message}
				</span>
			)}
		</div>
	);
}

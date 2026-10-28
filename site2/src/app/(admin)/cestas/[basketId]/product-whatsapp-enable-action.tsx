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
	const [message, setMessage] = useState("");
	const [success, setSuccess] = useState(false);

	async function enable() {
		if (pending) return;
		setPending(true);
		setMessage("");
		setSuccess(false);
		const result = await enableBrowserProductForWhatsapp(productId);
		setPending(false);
		setSuccess(result.ok);
		setMessage(
			result.ok
				? "Produto habilitado para uso no WhatsApp. Atualize a cesta para conferir."
				: (errorMessages[result.error] ?? errorMessages.unavailable),
		);
	}

	return (
		<div className="basket-mold-quick-enable">
			<button disabled={pending} onClick={enable} type="button">
				{pending ? "Habilitando…" : "Habilitar no WhatsApp"}
			</button>
			<p>
				Ao habilitar {productName}, ele poderá aparecer nas opções de Flow de
				todas as cestas onde está associado.
			</p>
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

"use client";

import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
	BasketMoldEditor,
	BasketMoldResult,
} from "@/lib/supabase/admin-basket-molds";
import { getBrowserAdminBasketMoldEditor } from "@/lib/supabase/browser-admin-basket-molds";
import { BasketMoldEditorClient } from "../[basketId]/mold-editor";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function EditarCestaPage() {
	const [result, setResult] = useState<BasketMoldResult<{
		editor: BasketMoldEditor;
		revision: string;
	}> | null>(null);
	useEffect(() => {
		const basketId =
			new URLSearchParams(window.location.search).get("id") ?? "";
		if (!UUID.test(basketId)) {
			setResult({ ok: false, error: "not_found" });
			return;
		}
		let current = true;
		void getBrowserAdminBasketMoldEditor(basketId).then((value) => {
			if (current) setResult(value);
		});
		return () => {
			current = false;
		};
	}, []);

	if (result?.ok) {
		return (
			<BasketMoldEditorClient
				initialEditor={result.data.editor}
				initialRevision={result.data.revision}
			/>
		);
	}
	if (result && !result.ok && result.error === "not_found") {
		return (
			<div className="page-stack" id="admin-basket-mold-editor-page">
				<Link className="basket-mold-back" href="/cestas">
					<ArrowLeft aria-hidden="true" size={16} /> Voltar às cestas
				</Link>
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<strong>Esta cesta não existe mais ou o link está incorreto.</strong>
				</section>
			</div>
		);
	}
	if (result && !result.ok) {
		const message =
			result.error === "not_authenticated"
				? "Sua sessão expirou. Entre novamente para editar esta cesta."
				: result.error === "not_authorized"
					? "Esta conta não tem acesso às cestas."
					: "Não foi possível carregar esta cesta agora. Tente novamente.";
		return (
			<div className="page-stack" id="admin-basket-mold-editor-page">
				<Link className="basket-mold-back" href="/cestas">
					<ArrowLeft aria-hidden="true" size={16} /> Voltar às cestas
				</Link>
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<strong>{message}</strong>
				</section>
			</div>
		);
	}
	return (
		<div className="page-stack" role="status">
			Carregando molde da cesta…
		</div>
	);
}

import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminBasketMoldEditor } from "@/lib/supabase/admin-basket-molds";
import { BasketMoldEditorClient } from "./mold-editor";

const errorCopy: Record<string, string> = {
	not_configured: "O acesso ao Supabase ainda não está configurado.",
	not_authenticated: "Entre novamente para consultar este molde.",
	not_authorized: "Esta conta não tem acesso às cestas.",
	unavailable: "Não foi possível carregar este molde agora. Tente novamente.",
};

export default async function BasketMoldPage({
	params,
}: {
	params: Promise<{ basketId: string }>;
}) {
	const { basketId } = await params;
	const result = await getAdminBasketMoldEditor(basketId);
	if (!result.ok && result.error === "not_found") notFound();

	if (!result.ok) {
		return (
			<div className="page-stack" id="admin-basket-mold-editor-page">
				<Link className="basket-mold-back" href="/cestas">
					<ArrowLeft aria-hidden="true" size={16} /> Voltar às cestas
				</Link>
				<section className="catalog-message" role="status">
					<AlertCircle aria-hidden="true" size={20} />
					<strong>{errorCopy[result.error] ?? errorCopy.unavailable}</strong>
				</section>
			</div>
		);
	}
	if (!result.data.editor.moldConfigured) {
		return (
			<div className="page-stack" id="admin-basket-mold-editor-page">
				<Link className="basket-mold-back" href="/cestas">
					<ArrowLeft aria-hidden="true" size={16} /> Voltar às cestas
				</Link>
				<section className="basket-mold-note" role="status">
					<AlertCircle aria-hidden="true" size={18} />
					<p>
						Este modelo ainda não tem etapas configuradas. A edição de
						alternativas fica disponível depois que as posições e quantidades
						forem cadastradas.
					</p>
				</section>
			</div>
		);
	}

	return (
		<BasketMoldEditorClient
			initialEditor={result.data.editor}
			initialRevision={result.data.revision}
		/>
	);
}

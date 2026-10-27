import { ShoppingBasket } from "lucide-react";
import { SectionPage } from "@/components/section-page";

export default function CestasPage() {
	return (
		<SectionPage
			description="Monte cestas com opções de produtos, quantidades e valor calculado no servidor."
			emptyDescription="Os modelos e as alternativas aparecem quando o catálogo atualizado estiver disponível. Cada opção enviada no Flow precisa ter foto aprovada."
			emptyTitle="Prepare o catálogo para montar uma cesta"
			eyebrow="CADASTROS"
			icon={ShoppingBasket}
			nextStep="Verificar produtos e conexões"
			title="Cestas básicas"
		/>
	);
}

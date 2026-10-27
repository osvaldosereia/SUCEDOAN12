import { Package } from "lucide-react";
import { SectionPage } from "@/components/section-page";

export default function ProdutosPage() {
	return (
		<SectionPage
			description="Organize produtos, fotos, disponibilidade e vínculo com o Catálogo Meta."
			emptyDescription="Os produtos e as fotos ainda estão sendo atualizados na base de origem. Nenhuma lista ou contagem fictícia será exibida."
			emptyTitle="Aguardando a carga dos produtos"
			eyebrow="CADASTROS"
			icon={Package}
			nextStep="Verificar o estado das conexões"
			title="Produtos"
		/>
	);
}

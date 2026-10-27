import { Users } from "lucide-react";
import { SectionPage } from "@/components/section-page";

export default function ClientesPage() {
	return (
		<SectionPage
			description="Veja contatos, endereços confirmados e o histórico de pedidos de cada cliente."
			emptyDescription="O cadastro só será associado automaticamente quando a identidade do WhatsApp estiver comprovada. Nomes parecidos não serão mesclados."
			emptyTitle="Os clientes aparecerão com as primeiras conversas"
			eyebrow="CADASTROS"
			icon={Users}
			nextStep="Preparar os canais"
			title="Clientes"
		/>
	);
}

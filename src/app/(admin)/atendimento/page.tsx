import { MessageCircle } from "lucide-react";
import { SectionPage } from "@/components/section-page";

export default function AtendimentoPage() {
	return (
		<SectionPage
			description="Converse com os clientes dos dois números em uma caixa de entrada simples."
			emptyDescription="A lista de conversas será carregada depois que os canais Meta forem validados e ligados ao Admin."
			emptyTitle="Conecte os canais para receber conversas"
			eyebrow="ROTINA"
			icon={MessageCircle}
			nextStep="Ver configurações de conexão"
			title="Atendimento"
		/>
	);
}

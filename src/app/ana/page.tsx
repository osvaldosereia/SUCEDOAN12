import { Bot } from "lucide-react";
import { SectionPage } from "@/components/section-page";

export default function AnaPage() {
	return (
		<SectionPage
			description="Configure o tom, as informações aprovadas e quando a ANA deve chamar uma pessoa."
			emptyDescription="A assistente não será ativada antes de definir respostas permitidas, limites e a transferência para atendimento humano."
			emptyTitle="Configure a ANA antes de ativar"
			eyebrow="ASSISTENTE"
			icon={Bot}
			nextStep="Ver configuração de integrações"
			title="Atendente virtual ANA"
		/>
	);
}

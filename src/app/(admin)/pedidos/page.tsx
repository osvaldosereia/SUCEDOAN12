import { ClipboardList } from "lucide-react";
import { SectionPage } from "@/components/section-page";

export default function PedidosPage() {
	return (
		<SectionPage
			description="Acompanhe cada pedido de NOVO até ENTREGUE, com os dados importantes à vista."
			emptyDescription="Pedidos confirmados pelo cliente aparecerão aqui. Cada cesta do Flow e cada carrinho do Catálogo será um pedido separado."
			emptyTitle="Nenhum pedido recebido ainda"
			eyebrow="ROTINA"
			icon={ClipboardList}
			nextStep="Preparar os canais"
			title="Pedidos"
		/>
	);
}

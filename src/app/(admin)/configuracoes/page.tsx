import {
	Blocks,
	MessageCircle,
	PlugZap,
	ShieldCheck,
	Store,
} from "lucide-react";

const integrations = [
	{
		title: "Supabase",
		icon: Blocks,
		description:
			"Banco de dados, login da equipe, fotos dos produtos e funções privadas.",
		status: "Aguardando configuração",
	},
	{
		title: "WhatsApp da Meta",
		icon: MessageCircle,
		description:
			"Dois números oficiais. Cada WABA e cada Flow será validado separadamente.",
		status: "Aguardando validação",
	},
	{
		title: "Bling",
		icon: PlugZap,
		description:
			"Conexão OAuth em leitura primeiro; envio de pedidos só depois da homologação.",
		status: "Aguardando validação",
	},
];

export default function ConfiguracoesPage() {
	return (
		<div className="page-stack">
			<section className="page-heading">
				<div>
					<p className="eyebrow">SISTEMA</p>
					<h1>Configurações</h1>
					<p className="page-description">
						Acompanhe conexões e informações necessárias para operar o Admin.
					</p>
				</div>
			</section>

			<section className="section-block" aria-labelledby="connections-heading">
				<div className="section-heading">
					<div>
						<h2 id="connections-heading">Conexões do sistema</h2>
						<p>Segredos nunca aparecem nesta tela.</p>
					</div>
				</div>
				<div className="integration-grid">
					{integrations.map((integration) => {
						const Icon = integration.icon;

						return (
							<article className="integration-card" key={integration.title}>
								<div className="integration-card__top">
									<div className="integration-card__title">
										<span className="integration-card__icon" aria-hidden="true">
											<Icon size={18} />
										</span>
										{integration.title}
									</div>
									<span className="integration-card__status">
										{integration.status}
									</span>
								</div>
								<p>{integration.description}</p>
							</article>
						);
					})}
				</div>
			</section>

			<section className="section-block" aria-labelledby="company-heading">
				<div className="section-heading">
					<div>
						<h2 id="company-heading">Dados da operação</h2>
						<p>
							As políticas serão configuradas antes do atendimento automático.
						</p>
					</div>
				</div>
				<article className="empty-panel">
					<div className="empty-panel__content">
						<div className="empty-panel__icon" aria-hidden="true">
							<Store size={21} strokeWidth={1.8} />
						</div>
						<h2>Informações da loja ainda não configuradas</h2>
						<p>
							Horário humano, regiões de entrega, formas de pagamento e regras
							comerciais serão preenchidos antes de ativar a ANA.
						</p>
						<span className="empty-panel__hint">
							<ShieldCheck aria-hidden="true" size={14} />
							Nenhuma integração de produção foi acionada
						</span>
					</div>
				</article>
			</section>
		</div>
	);
}

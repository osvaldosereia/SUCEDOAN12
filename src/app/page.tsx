import {
	ArrowRight,
	Check,
	CircleDashed,
	ClipboardList,
	Image,
	MessageCircle,
	PackageCheck,
	PlugZap,
} from "lucide-react";
import Link from "next/link";

const setupSteps = [
	{
		number: "01",
		title: "Confirmar catálogo e fotos",
		description:
			"Os produtos e as imagens entram quando a atualização do cadastro terminar.",
		icon: Image,
		status: "Aguardando catálogo",
	},
	{
		number: "02",
		title: "Conectar os dois números",
		description:
			"Cada linha do WhatsApp será validada separadamente com a Meta.",
		icon: MessageCircle,
		status: "Integração pendente",
	},
	{
		number: "03",
		title: "Validar o Bling",
		description:
			"A conexão começa em leitura; pedidos e notas ficam protegidos até a homologação.",
		icon: PlugZap,
		status: "Integração pendente",
	},
];

const overviewItems = [
	{
		label: "Conversas abertas",
		note: "Aguardando conexão dos canais",
		icon: MessageCircle,
	},
	{
		label: "Pedidos em separação",
		note: "Aguardando o primeiro pedido",
		icon: ClipboardList,
	},
	{
		label: "Produtos com foto",
		note: "Aguardando a carga do catálogo",
		icon: PackageCheck,
	},
];

export default function Home() {
	return (
		<div className="page-stack">
			<section className="page-heading">
				<div>
					<p className="eyebrow">PAINEL DA OPERAÇÃO</p>
					<h1>Visão geral</h1>
					<p className="page-description">
						O essencial para acompanhar o atendimento e os pedidos da Dona
						Antônia.
					</p>
				</div>
				<span className="environment-tag">
					<CircleDashed aria-hidden="true" size={15} />
					Preparação local
				</span>
			</section>

			<section className="welcome-card" aria-labelledby="welcome-heading">
				<div className="welcome-card__copy">
					<div className="welcome-card__icon" aria-hidden="true">
						<Check size={20} />
					</div>
					<div>
						<p className="eyebrow">PRIMEIRO ACESSO</p>
						<h2 id="welcome-heading">Vamos preparar seu Admin</h2>
						<p>
							A estrutura está organizada. Antes de receber dados reais, vamos
							validar o catálogo, os canais Meta e o Bling com segurança.
						</p>
					</div>
				</div>
				<Link className="button button--primary" href="/configuracoes">
					Ver configurações
					<ArrowRight aria-hidden="true" size={16} />
				</Link>
			</section>

			<section className="section-block" aria-labelledby="setup-heading">
				<div className="section-heading">
					<div>
						<h2 id="setup-heading">Primeiros passos</h2>
						<p>O que falta para começar a operação pelo painel.</p>
					</div>
					<span className="section-count">3 etapas</span>
				</div>

				<div className="setup-list">
					{setupSteps.map((step) => {
						const Icon = step.icon;

						return (
							<article className="setup-step" key={step.number}>
								<span className="setup-step__number">{step.number}</span>
								<div className="setup-step__icon" aria-hidden="true">
									<Icon size={19} />
								</div>
								<div className="setup-step__copy">
									<h3>{step.title}</h3>
									<p>{step.description}</p>
								</div>
								<span className="status-label">
									<span aria-hidden="true" className="status-dot" />
									{step.status}
								</span>
							</article>
						);
					})}
				</div>
			</section>

			<section className="section-block" aria-labelledby="overview-heading">
				<div className="section-heading">
					<div>
						<h2 id="overview-heading">Resumo da operação</h2>
						<p>Os números reais aparecem depois da conexão com o Supabase.</p>
					</div>
				</div>
				<div className="overview-grid">
					{overviewItems.map((item) => {
						const Icon = item.icon;

						return (
							<article className="overview-card" key={item.label}>
								<div className="overview-card__top">
									<span>{item.label}</span>
									<Icon aria-hidden="true" size={18} />
								</div>
								<p className="overview-card__value">—</p>
								<p className="overview-card__note">{item.note}</p>
							</article>
						);
					})}
				</div>
			</section>
		</div>
	);
}

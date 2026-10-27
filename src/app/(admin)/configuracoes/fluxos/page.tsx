import { ArrowLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { FlowSetupPanel } from "@/app/(admin)/configuracoes/fluxos/flow-setup-panel";
import { getAttendanceAccounts } from "@/lib/supabase/admin-attendance";

function maskedLastFour(phone: string): string {
	const digits = phone.replace(/\D/gu, "");
	return digits.length >= 4
		? `•••• ${digits.slice(-4)}`
		: "Número não identificado";
}

export default async function WhatsAppFlowSettingsPage() {
	const result = await getAttendanceAccounts().catch(() => null);
	const accounts = result?.ok ? result.data : null;

	return (
		<div className="page-stack">
			<section className="page-heading">
				<div>
					<Link className="settings-quick-replies-link" href="/configuracoes">
						<ArrowLeft aria-hidden="true" size={15} />
						Configurações
					</Link>
					<p className="eyebrow">SISTEMA · WHATSAPP</p>
					<h1>Flows de cesta</h1>
					<p className="page-description">
						Confira a chave e conecte o Flow publicado de cada número.
					</p>
				</div>
			</section>

			<section className="section-block" aria-labelledby="flow-setup-heading">
				<div className="section-heading">
					<div>
						<h2 id="flow-setup-heading">Configuração por número</h2>
						<p>
							Cada número usa sua chave e seu próprio Flow. O envio só fica
							ativo quando você habilita o Flow vinculado.
						</p>
					</div>
				</div>

				{accounts === null ? (
					<article className="empty-panel">
						<div className="empty-panel__content">
							<div className="empty-panel__icon" aria-hidden="true">
								<MessageCircle size={21} />
							</div>
							<h2>Não foi possível consultar os números</h2>
							<p>Volte às Configurações e tente novamente.</p>
						</div>
					</article>
				) : accounts.length === 0 ? (
					<article className="empty-panel">
						<div className="empty-panel__content">
							<h2>Nenhum número configurado</h2>
							<p>
								Cadastre os dois canais oficiais antes de configurar os Flows.
							</p>
						</div>
					</article>
				) : (
					<div className="flow-setup-list">
						{accounts.map((account) => (
							<FlowSetupPanel
								accountId={account.id}
								key={account.id}
								label={account.name}
								phone={maskedLastFour(account.phone)}
							/>
						))}
					</div>
				)}
			</section>

			<aside className="flow-setup-note">
				<strong>O que esta tela faz</strong>
				<p>
					Consulta a Meta e o estado salvo no Supabase. Não publica Flow, envia
					mensagem ao cliente nem altera chave já registrada. A ativação libera
					o botão de envio no Atendimento.
				</p>
			</aside>
		</div>
	);
}

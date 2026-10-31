"use client";

import {
	ArrowRight,
	Check,
	ClipboardList,
	Image,
	MessageCircle,
	PackageCheck,
	PlugZap,
	Truck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAttendanceAccounts } from "@/lib/supabase/browser-admin-attendance";
import { getBrowserAdminBasketMoldPhotoAudit } from "@/lib/supabase/browser-admin-basket-molds";
import { getBlingIntegrationReadiness } from "@/lib/supabase/browser-admin-integrations";
import { getBrowserAdminOrderBoard } from "@/lib/supabase/browser-admin-orders";

function countText(value: number | null | undefined): string {
	return typeof value === "number"
		? new Intl.NumberFormat("pt-BR").format(value)
		: "—";
}

type HomeSnapshot = {
	orderResult: Awaited<ReturnType<typeof getBrowserAdminOrderBoard>> | null;
	photoAuditResult: Awaited<
		ReturnType<typeof getBrowserAdminBasketMoldPhotoAudit>
	> | null;
	accountResult: Awaited<ReturnType<typeof getAttendanceAccounts>> | null;
	blingResult: Awaited<ReturnType<typeof getBlingIntegrationReadiness>> | null;
};

export default function Home() {
	const [snapshot, setSnapshot] = useState<HomeSnapshot>({
		orderResult: null,
		photoAuditResult: null,
		accountResult: null,
		blingResult: null,
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;

		void Promise.all([
			getBrowserAdminOrderBoard({ lane: "new", query: "", offset: 0 }).catch(
				() => null,
			),
			getBrowserAdminBasketMoldPhotoAudit().catch(() => null),
			getAttendanceAccounts().catch(() => null),
			getBlingIntegrationReadiness().catch(() => null),
		]).then(([orderResult, photoAuditResult, accountResult, blingResult]) => {
			if (!active) return;
			setSnapshot({
				orderResult,
				photoAuditResult,
				accountResult,
				blingResult,
			});
			setLoading(false);
		});

		return () => {
			active = false;
		};
	}, []);

	const { orderResult, photoAuditResult, accountResult, blingResult } =
		snapshot;

	const orderCounts = orderResult?.counts ?? null;
	const photoAudit =
		photoAuditResult?.ok === true ? photoAuditResult.data : null;
	const accountCount =
		accountResult?.ok === true ? accountResult.data.length : null;
	const blingReadiness =
		blingResult?.ok === true ? blingResult.readiness : null;

	const photoSetup = !photoAudit
		? {
				description: loading
					? "Conferindo as fotos das cestas…"
					: "Não foi possível consultar as fotos das cestas agora.",
				status: loading ? "Consultando…" : "Consulta indisponível",
				href: null,
			}
		: photoAudit.configuredBasketCount === 0 || photoAudit.positionCount === 0
			? {
					description:
						"Não há alternativas ativas em moldes configurados. Revise os modelos de cesta.",
					status: "Sem alternativas ativas",
					href: "/cestas",
				}
			: photoAudit.unverifiedWhatsappOptions > 0
				? {
						description: `O status WhatsApp de ${photoAudit.unverifiedWhatsappOptions} alternativa(s) ativa(s) ainda não foi confirmado. A leitura do Admin precisa ser atualizada antes de liberar o Flow.`,
						status: "Status WhatsApp não verificado",
						href: "/cestas",
					}
				: photoAudit.positionsWithoutActiveOption > 0 ||
						photoAudit.activeOptionsWithoutPhoto > 0
					? {
							description: `${[
								photoAudit.positionsWithoutActiveOption > 0
									? `${photoAudit.positionsWithoutActiveOption} etapa(s) estão sem alternativa habilitada para WhatsApp.`
									: null,
								photoAudit.activeOptionsWithoutPhoto > 0
									? `${photoAudit.activeOptionsWithoutPhoto} alternativa(s) ativa(s) estão sem foto HTTPS.`
									: null,
							]
								.filter(Boolean)
								.join(" ")} Complete a configuração em Cestas básicas.`,
							status: "Revisar catálogo",
							href: "/cestas",
						}
					: {
							description: `${photoAudit.activeOptionsWithPhoto} alternativas ativas nos moldes têm URL HTTPS de foto. O envio ainda confere WhatsApp/preço, e a Meta precisa validar a renderização.`,
							status: "Cadastro conferido · Meta pendente",
							href: null,
						};

	const channelSetup =
		accountCount === null
			? {
					description: loading
						? "Consultando os canais cadastrados…"
						: "Não foi possível consultar os canais cadastrados agora.",
					status: loading ? "Consultando…" : "Consulta indisponível",
					href: "/configuracoes/fluxos",
				}
			: {
					description: `${accountCount} ${accountCount === 1 ? "canal cadastrado" : "canais cadastrados"}. A saúde e o Flow devem ser validados por WABA.`,
					status:
						accountCount === 0
							? "Nenhum canal cadastrado"
							: `${accountCount} número(s) · validação pendente`,
					href: accountCount === 0 ? "/configuracoes" : "/configuracoes/fluxos",
				};

	const blingStatus = loading
		? "Consultando…"
		: blingReadiness?.hubEnabled === true
			? "Gateway habilitado"
			: blingReadiness?.hubEnabled === false
				? "Gateway pausado"
				: "Consulta indisponível";

	const setupSteps = [
		{
			number: "01",
			title: "Conferir fotos das cestas",
			description: photoSetup.description,
			icon: Image,
			status: photoSetup.status,
			href: photoSetup.href,
		},
		{
			number: "02",
			title: "Preparar os Flows dos números WhatsApp",
			description: channelSetup.description,
			icon: MessageCircle,
			status: channelSetup.status,
			href: channelSetup.href,
			actionLabel: "Configurar Flows de cesta",
		},
		{
			number: "03",
			title: "Validar o Bling",
			description: blingReadiness
				? "O estado exibido é de configuração e histórico; confirme a leitura OAuth atual em Configurações antes de operar."
				: "Não foi possível consultar a configuração do Bling agora.",
			icon: PlugZap,
			status: blingStatus,
		},
	];

	const overviewItems = [
		{
			label: "Pedidos novos",
			count: orderCounts?.new,
			note: orderCounts
				? "Aguardando início da produção"
				: "Contagem indisponível agora",
			icon: ClipboardList,
			lane: "new",
		},
		{
			label: "Em produção",
			count: orderCounts?.separate,
			note: orderCounts
				? "Pedidos em separação"
				: "Contagem indisponível agora",
			icon: PackageCheck,
			lane: "separate",
		},
		{
			label: "Em expedição",
			count: orderCounts?.ready,
			note: orderCounts
				? "Aguardando saída ou conclusão da entrega"
				: "Contagem indisponível agora",
			icon: Truck,
			lane: "ready",
		},
	];

	return (
		<div className="page-stack">
			<section className="page-heading">
				<div>
					<p className="eyebrow">PAINEL DA OPERAÇÃO</p>
					<h1>Visão geral</h1>
					<p className="page-description">
						Acompanhe os pedidos e veja o que falta validar antes da operação.
					</p>
				</div>
			</section>

			<section className="welcome-card" aria-labelledby="welcome-heading">
				<div className="welcome-card__copy">
					<div className="welcome-card__icon" aria-hidden="true">
						<Check size={20} />
					</div>
					<div>
						<p className="eyebrow">CONFIGURAÇÃO DA OPERAÇÃO</p>
						<h2 id="welcome-heading">Revise as conexões antes de ativar</h2>
						<p>
							As contagens de pedidos vêm do Admin. Fotos cadastradas e números
							configurados ainda precisam de validação nos serviços
							correspondentes.
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
						<p>O que falta conferir antes de atender clientes.</p>
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
									{step.href ? (
										<Link className="setup-step__action" href={step.href}>
											{step.actionLabel ?? "Abrir cestas básicas"}
											<ArrowRight aria-hidden="true" size={14} />
										</Link>
									) : null}
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
						<h2 id="overview-heading">Pedidos por etapa</h2>
						<p>Abra uma etapa para ver e tratar os pedidos correspondentes.</p>
					</div>
				</div>
				<div className="overview-grid">
					{overviewItems.map((item) => {
						const Icon = item.icon;

						return (
							<Link
								className="overview-card overview-card--link"
								href={`/pedidos?tab=${item.lane}`}
								key={item.label}
							>
								<div className="overview-card__top">
									<span>{item.label}</span>
									<Icon aria-hidden="true" size={18} />
								</div>
								<p className="overview-card__value">{countText(item.count)}</p>
								<p className="overview-card__note">{item.note}</p>
							</Link>
						);
					})}
				</div>
			</section>
		</div>
	);
}

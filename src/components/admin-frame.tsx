"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { navigationGroups, navigationItems } from "@/lib/admin-navigation";

type AdminFrameProps = {
	children: ReactNode;
};

export function AdminFrame({ children }: AdminFrameProps) {
	const pathname = usePathname();
	const [menuOpen, setMenuOpen] = useState(false);
	const currentPage =
		navigationItems.find((item) => item.href === pathname)?.label ??
		"Visão geral";

	return (
		<div className={`app-shell${menuOpen ? " nav-open" : ""}`}>
			{menuOpen && (
				<button
					aria-label="Fechar menu"
					className="nav-backdrop"
					onClick={() => setMenuOpen(false)}
					type="button"
				/>
			)}

			<aside aria-label="Menu principal" className="sidebar">
				<Link
					aria-label="Dona Antônia, ir para visão geral"
					className="brand"
					href="/"
					onClick={() => setMenuOpen(false)}
				>
					<span aria-hidden="true" className="brand__mark">
						DA
					</span>
					<span>
						<span className="brand__name">Dona Antônia</span>
						<span className="brand__caption">ADMIN DE ATENDIMENTO</span>
					</span>
				</Link>

				<nav aria-label="Navegação do Admin" className="nav-groups">
					{navigationGroups.map((group) => (
						<div className="nav-group" key={group.label}>
							<p className="nav-group__label">{group.label}</p>
							<ul className="nav-list">
								{group.items.map((item) => {
									const Icon = item.icon;
									const isActive =
										pathname === item.href ||
										(item.href !== "/" && pathname.startsWith(item.href));

									return (
										<li key={item.href}>
											<Link
												aria-current={isActive ? "page" : undefined}
												className="nav-link"
												href={item.href}
												onClick={() => setMenuOpen(false)}
											>
												<span aria-hidden="true" className="nav-link__icon">
													<Icon size={18} strokeWidth={1.8} />
												</span>
												{item.label}
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>

				<div className="sidebar-footer">
					<span aria-hidden="true" className="sidebar-footer__avatar">
						DA
					</span>
					<span>
						<span className="sidebar-footer__label">Equipe da loja</span>
						<span className="sidebar-footer__caption">
							Acesso administrativo
						</span>
					</span>
				</div>
			</aside>

			<div className="app-main">
				<header className="topbar">
					<div className="topbar__left">
						<button
							aria-expanded={menuOpen}
							aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
							className="menu-toggle"
							onClick={() => setMenuOpen((open) => !open)}
							type="button"
						>
							{menuOpen ? <X size={18} /> : <Menu size={18} />}
						</button>
						<nav aria-label="Localização atual" className="breadcrumb">
							Dona Antônia <span aria-hidden="true">/</span>{" "}
							<strong>{currentPage}</strong>
						</nav>
					</div>

					<div className="topbar__right">
						<div className="channel-status">
							<span aria-hidden="true" className="channel-status__dot" />
							<span className="channel-status__text">
								2 números em preparação
							</span>
						</div>
						<div className="account-chip">
							<span aria-hidden="true" className="account-avatar">
								DA
							</span>
							<span>Equipe</span>
						</div>
					</div>
				</header>

				<main className="content-area">
					<div className="content-inner">{children}</div>
				</main>
			</div>
		</div>
	);
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "Admin Dona Antônia",
		template: "%s | Admin Dona Antônia",
	},
	description: "Atendimento, cestas, produtos e pedidos da Dona Antônia.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="pt-BR">
			<body>{children}</body>
		</html>
	);
}

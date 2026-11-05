"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AdminFrame } from "@/components/admin-frame";
import { createClient } from "@/lib/supabase/client";

export function AdminSessionGate({ children }: { children: ReactNode }) {
	const router = useRouter();
	const [ready, setReady] = useState(false);
	const [authenticated, setAuthenticated] = useState(false);

	useEffect(() => {
		let active = true;

		try {
			const supabase = createClient();
			const {
				data: { subscription },
			} = supabase.auth.onAuthStateChange((_event, session) => {
				if (!active) return;
				setAuthenticated(Boolean(session));
				setReady(true);
				if (!session) router.replace("/login");
			});

			void supabase.auth.getSession().then(({ data, error }) => {
				if (!active) return;
				const hasSession = !error && Boolean(data.session);
				setAuthenticated(hasSession);
				setReady(true);
				if (!hasSession) router.replace("/login");
			});

			return () => {
				active = false;
				subscription.unsubscribe();
			};
		} catch {
			setReady(true);
			setAuthenticated(false);
			router.replace("/login");
			return () => {
				active = false;
			};
		}
	}, [router]);

	if (!ready || !authenticated) {
		return (
			<main className="login-page" role="status">
				<section className="login-card">
					<div aria-hidden="true" className="login-brand-mark">
						DA
					</div>
					<p className="eyebrow">DONA ANTÔNIA · EQUIPE</p>
					<h1>Verificando acesso</h1>
					<p className="login-description">
						Aguarde enquanto confirmamos sua sessão.
					</p>
				</section>
			</main>
		);
	}

	return <AdminFrame>{children}</AdminFrame>;
}

import { SignInForm } from "@/app/(auth)/login/sign-in-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export default function LoginPage() {
	return (
		<main className="login-page">
			<section aria-labelledby="login-heading" className="login-card">
				<div aria-hidden="true" className="login-brand-mark">
					DA
				</div>
				<p className="eyebrow">DONA ANTÔNIA · EQUIPE</p>
				<h1 id="login-heading">Acesse seu Admin</h1>
				<p className="login-description">
					Entre para acompanhar conversas, clientes e pedidos da loja.
				</p>
				<SignInForm configured={hasSupabaseConfig} />
			</section>
			<p className="login-footer">Atendimento e pedidos em um só lugar.</p>
		</main>
	);
}

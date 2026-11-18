"use client";

import { ArrowRight, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SignInFormProps = {
	configured: boolean;
};

export function SignInForm({ configured }: SignInFormProps) {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setErrorMessage("");

		try {
			const supabase = createClient();
			const { error } = await supabase.auth.signInWithPassword({
				email: email.trim(),
				password,
			});

			if (error) {
				setErrorMessage(
					"Não foi possível entrar. Confira os dados e tente novamente.",
				);
				return;
			}

			router.replace("/");
			router.refresh();
		} catch {
			setErrorMessage(
				"A conexão não está disponível. Tente novamente mais tarde.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form className="login-form" onSubmit={handleSubmit}>
			{!configured && (
				<p className="login-notice" role="status">
					A conexão de acesso ainda está sendo preparada.
				</p>
			)}
			<label className="login-field" htmlFor="email">
				<span>E-mail</span>
				<input
					autoComplete="username"
					disabled={!configured || submitting}
					id="email"
					name="email"
					onChange={(event) => setEmail(event.target.value)}
					required
					type="email"
					value={email}
				/>
			</label>
			<label className="login-field" htmlFor="password">
				<span>Senha</span>
				<input
					autoComplete="current-password"
					disabled={!configured || submitting}
					id="password"
					name="password"
					onChange={(event) => setPassword(event.target.value)}
					required
					type="password"
					value={password}
				/>
			</label>
			{errorMessage && (
				<p className="login-error" role="alert">
					{errorMessage}
				</p>
			)}
			<button
				className="button button--primary login-submit"
				disabled={!configured || submitting}
				type="submit"
			>
				{!configured ? <LockKeyhole size={16} /> : null}
				{submitting ? "Entrando…" : "Entrar no Admin"}
				{configured && !submitting ? <ArrowRight size={16} /> : null}
			</button>
			<p className="login-help">
				Acesso somente para funcionários cadastrados. Não existe cadastro
				público.
			</p>
		</form>
	);
}

"use client";

import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BrowserCatalogMapping } from "@/lib/supabase/browser-admin-catalog";
import { createClient } from "@/lib/supabase/client";

type VerifyGroup = {
	key: string;
	accountId: string;
	accountName: string;
	accountPhone: string | null;
	catalogId: string;
};

type Cursor = { updatedAt: string; id: string };
type Notice = { kind: "success" | "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCursor(value: unknown): Cursor | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.updated_at !== "string" ||
		!Number.isFinite(Date.parse(value.updated_at)) ||
		typeof value.id !== "string" ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
			value.id,
		)
	) {
		return null;
	}
	return { updatedAt: value.updated_at, id: value.id };
}

function errorMessage(code: unknown): string {
	switch (code) {
		case "catalog_not_linked_to_waba":
			return "Este catálogo não está conectado ao número de WhatsApp selecionado.";
		case "catalog_link_ambiguous":
			return "A Meta retornou mais de um vínculo para este catálogo. Os produtos continuam em revisão.";
		case "verification_snapshot_changed":
			return "Um vínculo mudou durante a conferência. Atualize a página e tente novamente.";
		case "meta_account_not_configured":
			return "A conexão segura da Meta ainda não está configurada para este número.";
		case "whatsapp_account_unavailable":
			return "O número do WhatsApp não está ativo no cadastro.";
		default:
			return "Não foi possível conferir o catálogo agora. Tente novamente mais tarde.";
	}
}

function makeGroups(mappings: BrowserCatalogMapping[]): VerifyGroup[] {
	const groups = new Map<string, VerifyGroup>();
	for (const mapping of mappings) {
		if (mapping.status !== "needs_review" || !mapping.productEligible) continue;
		const key = `${mapping.accountId}:${mapping.catalogId}`;
		const group = groups.get(key);
		if (group) continue;
		groups.set(key, {
			key,
			accountId: mapping.accountId,
			accountName: mapping.accountName,
			accountPhone: mapping.accountPhone,
			catalogId: mapping.catalogId,
		});
	}
	return [...groups.values()];
}

export function VerifyCatalogLinks({
	mappings,
}: {
	mappings: BrowserCatalogMapping[];
}) {
	const groups = makeGroups(mappings);
	const router = useRouter();
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [cursors, setCursors] = useState<Record<string, Cursor>>({});
	const [notices, setNotices] = useState<Record<string, Notice>>({});
	if (groups.length === 0) return null;

	async function verify(group: VerifyGroup) {
		setBusyKey(group.key);
		setNotices((current) => {
			const next = { ...current };
			delete next[group.key];
			return next;
		});
		try {
			const client = createClient();
			const cursor = cursors[group.key];
			const { data, error } = await client.functions.invoke(
				"meta-catalog-link-verify-v1",
				{
					body: {
						whatsapp_account_id: group.accountId,
						catalog_id: group.catalogId,
						after_updated_at: cursor?.updatedAt ?? null,
						after_id: cursor?.id ?? null,
					},
				},
			);
			if (error || !isRecord(data) || data.ok !== true) {
				setNotices((current) => ({
					...current,
					[group.key]: {
						kind: "error",
						message: errorMessage(isRecord(data) ? data.error : null),
					},
				}));
				return;
			}

			const checked = data.checked;
			const activated = data.activated;
			const missing = data.missing;
			const duplicate = data.duplicate;
			if (
				![checked, activated, missing, duplicate].every(
					(value) => Number.isInteger(value) && Number(value) >= 0,
				) ||
				typeof data.has_more !== "boolean"
			) {
				setNotices((current) => ({
					...current,
					[group.key]: {
						kind: "error",
						message:
							"A Meta retornou uma resposta incompleta. Os vínculos seguem em revisão.",
					},
				}));
				return;
			}

			const nextCursor = data.has_more ? readCursor(data.next_cursor) : null;
			if (data.has_more && !nextCursor) {
				setNotices((current) => ({
					...current,
					[group.key]: {
						kind: "error",
						message:
							"A Meta retornou um marcador de continuação inválido. Os vínculos seguem em revisão.",
					},
				}));
				return;
			}
			const checkedCount = Number(checked);
			const activatedCount = Number(activated);
			const missingCount = Number(missing);
			const duplicateCount = Number(duplicate);

			setCursors((current) => {
				const next = { ...current };
				if (nextCursor) next[group.key] = nextCursor;
				else delete next[group.key];
				return next;
			});
			const summary =
				checkedCount === 0
					? "Não há vínculos elegíveis neste lote."
					: `${activatedCount} de ${checkedCount} vínculo(s) conferido(s) e liberado(s).`;
			const unresolved = [
				missingCount > 0 ? `${missingCount} ID(s) não encontrado(s)` : "",
				duplicateCount > 0 ? `${duplicateCount} ID(s) duplicado(s)` : "",
			]
				.filter(Boolean)
				.join("; ");
			const continuation = data.has_more
				? " Há mais vínculos; continue pelo próximo lote."
				: "";
			setNotices((current) => ({
				...current,
				[group.key]: {
					kind: "success",
					message: [summary, unresolved, continuation]
						.filter(Boolean)
						.join(" "),
				},
			}));
			if (activatedCount > 0) router.refresh();
		} catch {
			setNotices((current) => ({
				...current,
				[group.key]: {
					kind: "error",
					message: "A conexão não respondeu. Os vínculos continuam em revisão.",
				},
			}));
		} finally {
			setBusyKey(null);
		}
	}

	return (
		<section
			aria-label="Conferência do Catálogo Meta"
			className="meta-catalog-verification-list"
		>
			<div className="meta-catalog-verification-heading">
				<div>
					<strong>Conferir vínculos com a Meta</strong>
					<p>
						A consulta é feita no catálogo conectado ao número. Só IDs exatos e
						únicos são liberados para pedidos.
					</p>
				</div>
			</div>
			{groups.map((group) => {
				const notice = notices[group.key];
				const busy = busyKey === group.key;
				return (
					<div className="meta-catalog-verification-item" key={group.key}>
						<div className="meta-catalog-verification-copy">
							<strong>
								{group.accountName}
								{group.accountPhone ? ` · ${group.accountPhone}` : ""}
							</strong>
							<span>
								Catálogo {group.catalogId} · com vínculos aguardando conferência
							</span>
							{notice && (
								<p
									aria-live="polite"
									className={`meta-catalog-verification-result meta-catalog-verification-result--${notice.kind}`}
								>
									{notice.kind === "success" ? (
										<CheckCircle2 aria-hidden="true" size={15} />
									) : (
										<AlertCircle aria-hidden="true" size={15} />
									)}
									{notice.message}
								</p>
							)}
						</div>
						<button
							className="catalog-submit"
							disabled={busy || busyKey !== null}
							onClick={() => void verify(group)}
							type="button"
						>
							{busy ? <LoaderCircle aria-hidden="true" size={15} /> : null}
							{busy
								? "Conferindo…"
								: cursors[group.key]
									? "Conferir próximo lote"
									: "Conferir agora"}
						</button>
					</div>
				);
			})}
		</section>
	);
}

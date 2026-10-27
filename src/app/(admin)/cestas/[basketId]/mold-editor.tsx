"use client";

import {
	AlertCircle,
	ArrowLeft,
	Check,
	ImageOff,
	Plus,
	Save,
	Search,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import type {
	BasketMoldEditor,
	BasketMoldProductCandidate,
	BasketMoldProductOption,
} from "@/lib/supabase/admin-basket-molds";
import {
	saveBasketMoldOptionsAction,
	searchBasketMoldProductsAction,
	validateBasketMoldProductAction,
} from "../actions";

type DraftOption = BasketMoldProductOption & { priceCents: number | null };
type DraftPosition = Omit<BasketMoldEditor["positions"][number], "options"> & {
	options: DraftOption[];
};

const currency = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const MAX_FLOW_OPTIONS_PER_POSITION = 8;

const errorCopy: Record<string, string> = {
	not_configured: "O acesso ao Supabase ainda não está configurado.",
	not_authenticated: "Sua sessão expirou. Entre novamente e tente de novo.",
	not_authorized: "Sua conta não tem permissão para alterar as cestas.",
	invalid_input:
		"Revise as alternativas. Há produto repetido ou informação inválida.",
	conflict: "O molde mudou em outra sessão. Atualize a página antes de salvar.",
	product_not_ready:
		"Toda opção ativa do Flow precisa estar habilitada para WhatsApp e ter nome, foto HTTPS e preço válidos. Corrija o produto ou retire-o desta etapa.",
	empty_flow_options:
		"A etapa precisa manter ao menos uma alternativa válida para o Flow.",
	too_many_flow_options:
		"O Flow aceita até oito alternativas válidas por etapa. Retire opções antes de salvar.",
	unavailable:
		"Não foi possível salvar agora. Suas alterações continuam nesta tela.",
	not_found: "Este molde não existe mais.",
};

function draftFromEditor(editor: BasketMoldEditor): DraftPosition[] {
	return editor.positions.map((position) => ({
		...position,
		options: position.options.map((option) => ({
			...option,
			priceCents: null,
		})),
	}));
}

function errorMessage(error: string): string {
	return errorCopy[error] ?? errorCopy.unavailable;
}

export function BasketMoldEditorClient({
	initialEditor,
	initialRevision,
}: {
	initialEditor: BasketMoldEditor;
	initialRevision: string;
}) {
	const [editor, setEditor] = useState(initialEditor);
	const [revision, setRevision] = useState(initialRevision);
	const [positions, setPositions] = useState(() =>
		draftFromEditor(initialEditor),
	);
	const [searchPositionId, setSearchPositionId] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [candidates, setCandidates] = useState<BasketMoldProductCandidate[]>(
		[],
	);
	const [message, setMessage] = useState<{
		kind: "success" | "error";
		text: string;
	} | null>(null);
	const [searching, setSearching] = useState(false);
	const [addingId, setAddingId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const changed = positions.some((position) => {
		const original = editor.positions.find((item) => item.id === position.id);
		return (
			!original ||
			JSON.stringify(position.options.map((option) => option.productId)) !==
				JSON.stringify(original.options.map((option) => option.productId))
		);
	});
	const canSave =
		changed &&
		!searching &&
		addingId === null &&
		positions.every((position) => position.options.length > 0);

	async function searchProducts(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (query.trim().length < 2) {
			setMessage({ kind: "error", text: "Digite pelo menos dois caracteres." });
			return;
		}
		setSearching(true);
		setMessage(null);
		const result = await searchBasketMoldProductsAction(query.trim());
		setSearching(false);
		if (!result.ok) {
			setCandidates([]);
			setMessage({ kind: "error", text: errorMessage(result.error) });
			return;
		}
		setCandidates(result.data);
		if (!result.data.length) {
			setMessage({
				kind: "error",
				text: "Nenhum produto com foto HTTPS encontrado.",
			});
		}
	}

	async function addProduct(candidate: BasketMoldProductCandidate) {
		if (!searchPositionId || !candidate.active) return;
		const position = positions.find((item) => item.id === searchPositionId);
		if (!position) return;
		if (position.options.some((option) => option.productId === candidate.id)) {
			setMessage({ kind: "error", text: "Este produto já está nesta etapa." });
			return;
		}
		const activeFlowOptionCount = position.options.filter(
			(option) => option.active && option.whatsappActive !== false,
		).length;
		if (activeFlowOptionCount >= MAX_FLOW_OPTIONS_PER_POSITION) {
			setMessage({
				kind: "error",
				text: `O Flow aceita até ${MAX_FLOW_OPTIONS_PER_POSITION} alternativas ativas por etapa. Retire uma antes de adicionar outra.`,
			});
			return;
		}
		if (position.options.length >= 40) {
			setMessage({
				kind: "error",
				text: "Esta etapa já atingiu o limite de alternativas.",
			});
			return;
		}

		setAddingId(candidate.id);
		setMessage(null);
		const validation = await validateBasketMoldProductAction(candidate.id);
		setAddingId(null);
		if (!validation.ok) {
			setMessage({ kind: "error", text: errorMessage(validation.error) });
			return;
		}

		setPositions((current) =>
			current.map((item) =>
				item.id === searchPositionId
					? {
							...item,
							options: [
								...item.options,
								{
									productId: validation.data.id,
									name: validation.data.name,
									sku: validation.data.sku,
									imageUrl: validation.data.imageUrl,
									active: validation.data.active,
									whatsappActive: true,
									sortOrder: item.options.length,
									priceCents: validation.data.priceCents,
								},
							],
						}
					: item,
			),
		);
		setMessage({
			kind: "success",
			text: `${validation.data.name} adicionado à etapa.`,
		});
		setCandidates((current) =>
			current.filter((item) => item.id !== candidate.id),
		);
	}

	function removeProduct(positionId: string, productId: string) {
		setPositions((current) =>
			current.map((position) =>
				position.id === positionId
					? {
							...position,
							options: position.options.filter(
								(option) => option.productId !== productId,
							),
						}
					: position,
			),
		);
		setMessage(null);
	}

	async function save() {
		setSaving(true);
		setMessage(null);
		const result = await saveBasketMoldOptionsAction({
			basketId: editor.basketId,
			revision,
			positions: positions.map((position) => ({
				positionId: position.id,
				productIds: position.options.map((option) => option.productId),
			})),
		});
		setSaving(false);
		if (!result.ok) {
			setMessage({ kind: "error", text: errorMessage(result.error) });
			return;
		}
		setEditor(result.data.editor);
		setRevision(result.data.revision);
		setPositions(draftFromEditor(result.data.editor));
		setSearchPositionId(null);
		setCandidates([]);
		setMessage({ kind: "success", text: "Alternativas salvas no molde." });
	}

	return (
		<div className="page-stack" id="admin-basket-mold-editor-page">
			<Link className="basket-mold-back" href="/cestas">
				<ArrowLeft aria-hidden="true" size={16} /> Voltar às cestas
			</Link>

			<section className="page-heading">
				<div>
					<p className="eyebrow">CADASTROS / CESTAS</p>
					<h1>{editor.name}</h1>
					<p className="page-description">
						Inclua ou retire as alternativas de cada etapa. A ordem atual é
						mantida.
					</p>
				</div>
				<button
					className="catalog-submit basket-mold-save"
					disabled={!canSave || saving}
					onClick={save}
					type="button"
				>
					<Save aria-hidden="true" size={16} />
					{saving ? "Salvando…" : "Salvar alterações"}
				</button>
			</section>

			<section
				className="basket-mold-internal"
				aria-label="Ajustes internos da cesta"
			>
				<div>
					<span>Ajuste interno da cesta</span>
					<strong>{currency.format(editor.hiddenAdjustmentCents / 100)}</strong>
				</div>
				<div>
					<span>Ajuste condicional</span>
					<strong>
						{editor.conditionalHiddenEnabled
							? `${currency.format(editor.conditionalHiddenAdjustmentCents / 100)} · ${editor.conditionalHiddenProductName ?? "produto não identificado"}`
							: "Desativado"}
					</strong>
				</div>
				<p>
					Valores internos da equipe. Não aparecem como itens separados na
					confirmação do cliente.
				</p>
			</section>

			<div className="basket-mold-note" role="note">
				<AlertCircle aria-hidden="true" size={18} />
				<p>
					O Flow exige produtos ativos, habilitados para WhatsApp, com foto
					HTTPS e preço válido. A publicação e a renderização ainda precisam ser
					validadas pela Meta nos dois números.
				</p>
			</div>

			{message && (
				<div
					className={`basket-mold-feedback basket-mold-feedback--${message.kind}`}
					role="status"
				>
					{message.kind === "success" ? (
						<Check aria-hidden="true" size={17} />
					) : (
						<AlertCircle aria-hidden="true" size={17} />
					)}
					<span>{message.text}</span>
					{message.kind === "error" && message.text === errorCopy.conflict && (
						<button
							className="basket-mold-reload"
							onClick={() => window.location.reload()}
							type="button"
						>
							Atualizar página
						</button>
					)}
				</div>
			)}

			<section aria-label="Etapas da cesta" className="basket-mold-positions">
				{positions.map((position, index) => (
					<article className="basket-mold-position" key={position.id}>
						<header className="basket-mold-position__header">
							<span className="basket-mold-position__number">{index + 1}</span>
							<div>
								<h2>{position.label}</h2>
								<p>Quantidade da composição: {position.quantity}</p>
							</div>
							<span className="basket-mold-count">
								{position.options.length} alternativa(s)
							</span>
						</header>
						{!position.options.some(
							(option) =>
								option.active &&
								option.whatsappActive &&
								option.imageUrl !== null,
						) && (
							<p className="basket-mold-empty-position" role="status">
								Nenhuma alternativa está pronta para o Flow. Inclua um produto
								ativo, habilitado para WhatsApp e com foto HTTPS antes de
								liberar esta etapa.
							</p>
						)}

						{position.options.length ? (
							<ul className="basket-mold-options">
								{position.options.map((option) => (
									<li className="basket-mold-option" key={option.productId}>
										<div className="basket-mold-option__image">
											{option.imageUrl ? (
												// biome-ignore lint/performance/noImgElement: HTTPS catalog image is provided by the authenticated catalog gateway.
												<img alt="" loading="lazy" src={option.imageUrl} />
											) : (
												<ImageOff aria-hidden="true" size={18} />
											)}
										</div>
										<div className="basket-mold-option__copy">
											<strong>{option.name}</strong>
											<span>
												{option.sku ? `SKU ${option.sku}` : "SKU não informado"}
												{option.priceCents !== null
													? ` · ${currency.format(option.priceCents / 100)}`
													: ""}
											</span>
											<span
												className={
													option.active
														? "basket-mold-active"
														: "basket-mold-inactive"
												}
											>
												{option.active
													? "Ativo no cadastro"
													: "Inativo no cadastro"}
											</span>
											<span
												className={
													option.whatsappActive === null
														? "basket-mold-unverified"
														: option.whatsappActive
															? "basket-mold-active"
															: "basket-mold-inactive"
												}
											>
												{option.whatsappActive === null
													? "Status WhatsApp não verificado"
													: option.whatsappActive
														? "Habilitado no WhatsApp"
														: "Desabilitado no WhatsApp"}
											</span>
										</div>
										<button
											aria-label={`Remover ${option.name} de ${position.label}`}
											className="basket-mold-remove"
											disabled={saving}
											onClick={() =>
												removeProduct(position.id, option.productId)
											}
											type="button"
										>
											<Trash2 aria-hidden="true" size={16} />
											Remover
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="basket-mold-empty-position">
								Esta etapa está sem alternativas. Adicione pelo menos um produto
								antes de salvar.
							</p>
						)}

						{searchPositionId === position.id ? (
							<div className="basket-mold-search-panel">
								<form className="basket-mold-search" onSubmit={searchProducts}>
									<label className="customer-field">
										<span>Buscar produto pelo nome, SKU ou GTIN</span>
										<input
											autoComplete="off"
											disabled={saving}
											maxLength={80}
											value={query}
											onChange={(event) => setQuery(event.target.value)}
											placeholder="Ex.: arroz"
										/>
									</label>
									<button
										className="catalog-submit"
										disabled={searching || saving}
										type="submit"
									>
										<Search aria-hidden="true" size={16} />
										{searching ? "Buscando…" : "Buscar"}
									</button>
									<button
										className="basket-mold-cancel"
										disabled={saving}
										onClick={() => {
											setSearchPositionId(null);
											setCandidates([]);
											setMessage(null);
										}}
										type="button"
									>
										Cancelar
									</button>
								</form>
								{candidates.length > 0 && (
									<ul
										aria-label="Produtos encontrados"
										className="basket-mold-candidates"
									>
										{candidates.map((candidate) => {
											const alreadyAdded = position.options.some(
												(option) => option.productId === candidate.id,
											);
											return (
												<li
													className="basket-mold-candidate"
													key={candidate.id}
												>
													{/* biome-ignore lint/performance/noImgElement: HTTPS catalog image is provided by the authenticated catalog gateway. */}
													<img alt="" loading="lazy" src={candidate.imageUrl} />
													<div>
														<strong>{candidate.name}</strong>
														<small>
															{candidate.sku
																? `SKU ${candidate.sku}`
																: "SKU não informado"}
														</small>
													</div>
													<button
														disabled={
															!candidate.active ||
															alreadyAdded ||
															addingId !== null ||
															saving
														}
														onClick={() => void addProduct(candidate)}
														type="button"
													>
														{addingId === candidate.id
															? "Conferindo…"
															: alreadyAdded
																? "Já adicionado"
																: candidate.active
																	? "Adicionar"
																	: "Produto inativo"}
													</button>
												</li>
											);
										})}
									</ul>
								)}
							</div>
						) : (
							<button
								className="basket-mold-add"
								disabled={saving}
								onClick={() => {
									setSearchPositionId(position.id);
									setQuery("");
									setCandidates([]);
									setMessage(null);
								}}
								type="button"
							>
								<Plus aria-hidden="true" size={16} /> Adicionar alternativa
							</button>
						)}
					</article>
				))}
			</section>

			<div className="basket-mold-footer">
				<p>
					{positions.length} etapas · {editor.publicCompositionCount}{" "}
					composição(ões) pública(s) · as fotos e os preços são confirmados no
					cadastro do produto.
				</p>
				<button
					className="catalog-submit basket-mold-save"
					disabled={!canSave || saving}
					onClick={save}
					type="button"
				>
					<Save aria-hidden="true" size={16} />
					{saving ? "Salvando…" : "Salvar alterações"}
				</button>
			</div>
		</div>
	);
}

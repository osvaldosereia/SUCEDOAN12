"use client";

import {
	AlertCircle,
	ArrowDown,
	ArrowLeft,
	ArrowUp,
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
import { BasketProductWhatsappEnableAction } from "./product-whatsapp-enable-action";

type DraftOption = BasketMoldProductOption & { priceCents: number | null };
type DraftPosition = Omit<BasketMoldEditor["positions"][number], "options"> & {
	options: DraftOption[];
};

const currency = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});
const MAX_FLOW_OPTIONS_PER_POSITION = 8;
const MAX_FLOW_POSITIONS = 80;
const MAX_HIDDEN_ADJUSTMENT_CENTS = 999_999_999;

const errorCopy: Record<string, string> = {
	not_configured: "O acesso ao Supabase ainda não está configurado.",
	not_authenticated: "Sua sessão expirou. Entre novamente e tente de novo.",
	not_authorized: "Sua conta não tem permissão para alterar as cestas.",
	invalid_input:
		"Revise as etapas e alternativas. Há produto repetido ou informação inválida.",
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

function formatCentsInput(cents: number): string {
	const absolute = Math.abs(cents);
	return (
		(cents < 0 ? "-" : "") +
		Math.floor(absolute / 100) +
		"," +
		String(absolute % 100).padStart(2, "0")
	);
}

function parseCentsInput(value: string): number | null {
	const cleaned = value.trim().replace(/\s/g, "");
	let normalized = cleaned;
	if (cleaned.includes(",")) {
		if (!/^(?:\d+,\d{1,2}|\d{1,3}(?:\.\d{3})+,\d{1,2})$/.test(cleaned)) {
			return null;
		}
		normalized = cleaned.replaceAll(".", "").replace(",", ".");
	} else if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
		return null;
	}
	const [whole, fraction = ""] = normalized.split(".");
	const cents = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
	return Number.isSafeInteger(cents) && cents <= MAX_HIDDEN_ADJUSTMENT_CENTS
		? cents
		: null;
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
	const [basketName, setBasketName] = useState(initialEditor.name);
	const [hiddenAdjustmentInput, setHiddenAdjustmentInput] = useState(() =>
		formatCentsInput(initialEditor.hiddenAdjustmentCents),
	);
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

	const hiddenAdjustmentCents = parseCentsInput(hiddenAdjustmentInput);
	const changed =
		basketName.trim() !== editor.name ||
		hiddenAdjustmentCents !== editor.hiddenAdjustmentCents ||
		JSON.stringify(
			positions.map((position) => [
				position.id,
				position.label,
				position.options.map((option) => option.productId),
			]),
		) !==
			JSON.stringify(
				editor.positions.map((position) => [
					position.id,
					position.label,
					position.options.map((option) => option.productId),
				]),
			);
	const canSave =
		changed &&
		basketName.trim().length > 0 &&
		Array.from(basketName.trim()).length <= 180 &&
		hiddenAdjustmentCents !== null &&
		!searching &&
		addingId === null &&
		positions.every(
			(position) =>
				position.label.trim().length > 0 &&
				Array.from(position.label.trim()).length <= 100 &&
				position.options.length > 0,
		);

	function addPosition() {
		const id = crypto.randomUUID();
		setPositions((current) => [
			...current,
			{
				id,
				label: "Novo produto",
				quantity: 1,
				sortOrder: current.length,
				options: [],
			},
		]);
		setSearchPositionId(id);
		setQuery("");
		setCandidates([]);
		setMessage(null);
	}

	function removePosition(positionId: string) {
		setPositions((current) =>
			current.filter((position) => position.id !== positionId),
		);
		if (searchPositionId === positionId) {
			setSearchPositionId(null);
			setCandidates([]);
		}
		setMessage(null);
	}

	function movePosition(index: number, offset: -1 | 1) {
		setPositions((current) => {
			const target = index + offset;
			if (target < 0 || target >= current.length) return current;
			const next = [...current];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});
		setMessage(null);
	}

	function moveOption(positionId: string, productId: string, offset: -1 | 1) {
		setPositions((current) =>
			current.map((position) => {
				if (position.id !== positionId) return position;
				const index = position.options.findIndex(
					(option) => option.productId === productId,
				);
				const target = index + offset;
				if (index < 0 || target < 0 || target >= position.options.length) {
					return position;
				}
				const options = [...position.options];
				[options[index], options[target]] = [options[target], options[index]];
				return { ...position, options };
			}),
		);
		setMessage(null);
	}

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
		if (!basketName.trim() || hiddenAdjustmentCents === null) {
			setMessage({
				kind: "error",
				text: "Confira o nome da cesta e o acréscimo interno em reais.",
			});
			return;
		}
		setSaving(true);
		setMessage(null);
		const result = await saveBasketMoldOptionsAction({
			basketId: editor.basketId,
			revision,
			name: basketName.trim(),
			hiddenAdjustmentCents,
			positions: positions.map((position) => ({
				positionId: position.id,
				label: position.label.trim(),
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
		setBasketName(result.data.editor.name);
		setHiddenAdjustmentInput(
			formatCentsInput(result.data.editor.hiddenAdjustmentCents),
		);
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
					<h1>{basketName.trim() || "Cesta sem nome"}</h1>
					<p className="page-description">
						Ajuste o nome, as etapas e as alternativas que o cliente verá no
						Flow.
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
				aria-label="Configuração da cesta"
			>
				<label className="basket-mold-setting">
					<span>Nome da cesta</span>
					<input
						maxLength={180}
						value={basketName}
						onChange={(event) => setBasketName(event.target.value)}
					/>
				</label>
				<label className="basket-mold-setting">
					<span>Acréscimo interno da cesta</span>
					<div className="basket-mold-money-input">
						<span aria-hidden="true">R$</span>
						<input
							aria-label="Acréscimo interno da cesta em reais"
							inputMode="decimal"
							maxLength={18}
							placeholder="0,00"
							value={hiddenAdjustmentInput}
							onChange={(event) => setHiddenAdjustmentInput(event.target.value)}
						/>
					</div>
					{hiddenAdjustmentCents === null && (
						<small>
							Informe um valor não negativo com até duas casas decimais.
						</small>
					)}
				</label>
				<div>
					<span>Ajuste condicional</span>
					<strong>
						{editor.conditionalHiddenEnabled
							? `${currency.format(editor.conditionalHiddenAdjustmentCents / 100)} · ${editor.conditionalHiddenProductName ?? "produto não identificado"}`
							: "Desativado"}
					</strong>
				</div>
				<p>
					O acréscimo é interno e não aparece separado na confirmação. O cliente
					seleciona de 0 a 6 unidades de cada produto no Flow. Depois de alterar
					a cesta, reinicie um Flow que já esteja aberto para usar as novas
					opções.
				</p>
			</section>

			<div className="basket-mold-note" role="note">
				<AlertCircle aria-hidden="true" size={18} />
				<p>
					O Flow exige produtos ativos, habilitados para WhatsApp, com foto
					HTTPS e preço válido. Preços e fotos vêm do cadastro do produto. A
					publicação e a renderização ainda precisam ser validadas pela Meta nos
					dois números.
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
				<button
					className="basket-mold-add basket-mold-add-step"
					disabled={saving || positions.length >= MAX_FLOW_POSITIONS}
					onClick={addPosition}
					type="button"
				>
					<Plus aria-hidden="true" size={16} /> Adicionar etapa de produto
				</button>
				{positions.map((position, index) => (
					<article className="basket-mold-position" key={position.id}>
						<header className="basket-mold-position__header">
							<span className="basket-mold-position__number">{index + 1}</span>
							<div className="basket-mold-step-label">
								<label className="basket-mold-setting">
									<span>Nome desta etapa do Flow</span>
									<input
										maxLength={100}
										value={position.label}
										onChange={(event) => {
											const value = event.target.value;
											setPositions((current) =>
												current.map((item) =>
													item.id === position.id
														? { ...item, label: value }
														: item,
												),
											);
										}}
									/>
								</label>
								<p>O cliente escolhe a quantidade de 0 a 6.</p>
							</div>
							<span className="basket-mold-count">
								{position.options.length} alternativa(s)
							</span>
							<div className="basket-mold-order-actions">
								<button
									aria-label={`Mover etapa ${position.label} para cima`}
									className="basket-mold-order-button"
									disabled={saving || index === 0}
									onClick={() => movePosition(index, -1)}
									title="Mover etapa para cima"
									type="button"
								>
									<ArrowUp aria-hidden="true" size={15} />
								</button>
								<button
									aria-label={`Mover etapa ${position.label} para baixo`}
									className="basket-mold-order-button"
									disabled={saving || index === positions.length - 1}
									onClick={() => movePosition(index, 1)}
									title="Mover etapa para baixo"
									type="button"
								>
									<ArrowDown aria-hidden="true" size={15} />
								</button>
								<button
									aria-label={`Remover etapa ${position.label}`}
									className="basket-mold-order-button basket-mold-remove-step"
									disabled={saving || positions.length <= 1}
									onClick={() => removePosition(position.id)}
									title="Remover etapa"
									type="button"
								>
									<Trash2 aria-hidden="true" size={14} />
								</button>
							</div>
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
								{position.options.map((option, optionIndex) => (
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
											<div className="basket-mold-order-actions">
												<button
													aria-label={`Mover ${option.name} para cima`}
													className="basket-mold-order-button"
													disabled={saving || optionIndex === 0}
													onClick={() =>
														moveOption(position.id, option.productId, -1)
													}
													title="Mover alternativa para cima"
													type="button"
												>
													<ArrowUp aria-hidden="true" size={15} />
												</button>
												<button
													aria-label={`Mover ${option.name} para baixo`}
													className="basket-mold-order-button"
													disabled={
														saving ||
														optionIndex === position.options.length - 1
													}
													onClick={() =>
														moveOption(position.id, option.productId, 1)
													}
													title="Mover alternativa para baixo"
													type="button"
												>
													<ArrowDown aria-hidden="true" size={15} />
												</button>
											</div>
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
											{option.whatsappActive !== true && (
												<Link
													className="basket-mold-product-link"
													href={`/produtos/${option.productId}`}
												>
													Editar cadastro do produto
												</Link>
											)}
											{option.active &&
												option.whatsappActive === false &&
												option.imageUrl !== null &&
												option.priceCents !== null &&
												option.priceCents > 0 && (
													<BasketProductWhatsappEnableAction
														productId={option.productId}
														productName={option.name}
													/>
												)}
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
					{positions.length} etapas · limite de 80. O cliente escolhe de 0 a 6
					unidades por produto. Fotos e preços vêm do cadastro do produto.
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

import React, { useMemo, useState } from 'react';
import { formatBRL } from '../../../core/money';
import type { Product, ProductType } from '../../../core/model';
import type { ExtraGroup } from '../../../core/extras';

interface Props {
  products: readonly Product[];
  types: readonly ProductType[];
  groups: readonly ExtraGroup[];
  onChangeGroups: (groups: ExtraGroup[]) => void;
  onChangeTypes: (types: ProductType[]) => void;
}

export function ExtraAdmin({ products, types, groups, onChangeGroups, onChangeTypes }: Props) {
  const [selectedId, setSelectedId] = useState<string>(groups[0]?.typeId ?? '');
  const [newName, setNewName] = useState('');
  const [linkId, setLinkId] = useState('');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');
  const activeGroups = useMemo(() => [...groups].sort((a, b) => a.order - b.order), [groups]);
  const current = types.find((type) => type.id === selectedId);
  const candidates = types.filter((type) => !groups.some((g) => g.typeId === type.id));
  const filtered = products.filter((product) =>
    (product.name + ' ' + product.sku + ' ' + (product.gtin ?? ''))
      .toLocaleLowerCase('pt-BR')
      .includes(search.toLocaleLowerCase('pt-BR')),
  );

  const createGroup = () => {
    const name = newName.trim();
    if (!name) {
      setFeedback('Informe o nome do tipo extra.');
      return;
    }
    if (
      types.some((type) => type.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))
    ) {
      setFeedback('Este tipo já existe. Use Vincular tipo existente.');
      return;
    }
    const id = 'extra-local-' + (types.length + 1);
    const group: ExtraGroup = { typeId: id, order: groups.length + 1, active: true };
    onChangeTypes([...types, { id, name, order: types.length + 1, productSkus: [] }]);
    onChangeGroups([...groups, group]);
    setSelectedId(id);
    setNewName('');
    setFeedback('Grupo criado somente na prévia.');
  };
  const linkGroup = () => {
    if (!linkId || groups.some((g) => g.typeId === linkId)) return;
    onChangeGroups([...groups, { typeId: linkId, order: groups.length + 1, active: true }]);
    setSelectedId(linkId);
    setLinkId('');
    setFeedback('Tipo vinculado à etapa de extras.');
  };
  const move = (id: string, delta: number) => {
    const ordered = [...activeGroups];
    const pos = ordered.findIndex((group) => group.typeId === id);
    const destination = pos + delta;
    if (pos < 0 || destination < 0 || destination >= ordered.length) return;
    const [item] = ordered.splice(pos, 1);
    if (!item) return;
    ordered.splice(destination, 0, item);
    onChangeGroups(ordered.map((group, index) => ({ ...group, order: index + 1 })));
  };
  const changeMembership = (sku: string) => {
    onChangeTypes(
      types.map((type) => {
        if (type.id !== selectedId) return type;
        const exists = type.productSkus.includes(sku);
        return {
          ...type,
          productSkus: exists
            ? type.productSkus.filter((id) => id !== sku)
            : [...type.productSkus, sku],
        };
      }),
    );
  };
  const toggleGroup = (id: string) => {
    onChangeGroups(
      groups.map((group) => (group.typeId === id ? { ...group, active: !group.active } : group)),
    );
  };
  const remove = (id: string) => {
    const remaining = activeGroups.filter((group) => group.typeId !== id);
    onChangeGroups(remaining.map((group, index) => ({ ...group, order: index + 1 })));
    if (id === selectedId) setSelectedId(remaining[0]?.typeId ?? '');
    setFeedback('Grupo retirado dos extras; produtos e tipos permanecem cadastrados.');
  };

  return (
    <div className="extra-admin">
      <div className="admin-grid">
        <section className="panel">
          <h2>Grupos exibidos na etapa de extras</h2>
          <p>
            Comuns às cinco cestas e sempre com quantidade inicial zero. Reordene ou desative um
            grupo sem apagar seus produtos.
          </p>
          <div className="type-list">
            {activeGroups.map((group) => {
              const type = types.find((entry) => entry.id === group.typeId);
              return (
                <div
                  className={'extra-admin-group ' + (group.typeId === selectedId ? 'current' : '')}
                  key={group.typeId}
                >
                  <button
                    type="button"
                    className="extra-group-name"
                    onClick={() => setSelectedId(group.typeId)}
                  >
                    <b>{type?.name ?? 'Tipo não encontrado'}</b>
                    <small>{type?.productSkus.length ?? 0} produtos</small>
                  </button>
                  <div className="extra-group-actions">
                    <button
                      type="button"
                      aria-label={'Mover ' + type?.name + ' para cima'}
                      disabled={group.order === 1}
                      onClick={() => move(group.typeId, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={'Mover ' + type?.name + ' para baixo'}
                      disabled={group.order === activeGroups.length}
                      onClick={() => move(group.typeId, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={
                        (group.active ? 'Desativar ' : 'Ativar ') + (type?.name ?? 'grupo')
                      }
                      onClick={() => toggleGroup(group.typeId)}
                    >
                      {group.active ? 'Ativo' : 'Inativo'}
                    </button>
                    <button
                      type="button"
                      aria-label={'Retirar ' + type?.name + ' dos extras'}
                      onClick={() => remove(group.typeId)}
                    >
                      Retirar
                    </button>
                  </div>
                </div>
              );
            })}
            {!groups.length && (
              <div className="notice muted">Crie um grupo extra para começar.</div>
            )}
          </div>
          <div className="admin-form-block">
            <h3>Novo tipo de produto extra</h3>
            <div className="form-row">
              <input
                className="input"
                aria-label="Nome do tipo extra"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createGroup();
                }}
                placeholder="Ex.: Biscoitos"
              />
              <button type="button" className="secondary-button" onClick={createGroup}>
                Criar
              </button>
            </div>
          </div>
          <div className="admin-form-block">
            <h3>Ou reutilize um tipo já cadastrado</h3>
            <div className="form-row">
              <select
                className="input"
                aria-label="Selecionar tipo existente"
                value={linkId}
                onChange={(event) => setLinkId(event.target.value)}
              >
                <option value="">Selecione...</option>
                {candidates.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                disabled={!linkId}
                onClick={linkGroup}
              >
                Vincular
              </button>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Produtos permitidos — {current?.name ?? 'Selecione um grupo'}</h2>
          <p>
            Cadastre cada sabor ou aroma como SKU independente. Marque quais produtos serão exibidos
            no carrossel deste grupo extra.
          </p>
          <input
            className="input"
            value={search}
            aria-label="Buscar produtos para extras"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nome, SKU ou EAN"
          />
          <div className="option-checks" role="group" aria-label="Produtos do tipo extra">
            {filtered.map((product) => (
              <label className="check-row" key={product.sku}>
                <input
                  type="checkbox"
                  disabled={!current}
                  checked={current?.productSkus.includes(product.sku) ?? false}
                  onChange={() => changeMembership(product.sku)}
                />
                <span>
                  <b>{product.name}</b>
                  <small>
                    {product.sku} · {formatBRL(product.priceCents)}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <p className="below-note">
            Somente SKUs ativos, com preço e estoque suficiente aparecerão na loja real.
          </p>
        </section>
      </div>
      {feedback && (
        <div className="notice muted" role="status">
          {feedback}
        </div>
      )}
    </div>
  );
}

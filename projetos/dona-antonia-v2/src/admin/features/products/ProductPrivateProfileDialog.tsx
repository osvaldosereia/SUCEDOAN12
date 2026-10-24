import { useState, type FormEvent } from 'react';
import type {
  AdminProduct,
  ProductPrivateProfile,
  ProductPrivateProfileDraft,
} from '../../../application/admin-products';

type ProfilePatch = {
  -readonly [Key in keyof ProductPrivateProfileDraft]?: ProductPrivateProfileDraft[Key];
};

const FIELDS: ReadonlyArray<keyof ProductPrivateProfileDraft> = [
  'originCode',
  'ncm',
  'cest',
  'packagingGtin',
  'unitsPerCase',
  'supplierName',
  'supplierCode',
  'purchaseCostExact',
];

function valueOf(profile: ProductPrivateProfile, field: keyof ProductPrivateProfileDraft): string {
  const value = profile[field];
  return value === null ? '' : String(value);
}

export function ProductPrivateProfileDialog({
  product,
  profile,
  saving,
  onClose,
  onSave,
}: {
  product: AdminProduct;
  profile: ProductPrivateProfile;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: ProfilePatch, profile: ProductPrivateProfile) => Promise<void>;
}) {
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = new FormData(event.currentTarget);
    const patch: ProfilePatch = {};
    for (const field of FIELDS) {
      const next = String(values.get(field) ?? '').trim();
      if (next !== valueOf(profile, field)) {
        if (field === 'unitsPerCase') {
          if (next && (!/^\d+$/.test(next) || Number(next) < 1)) {
            setError('Unidades por caixa deve ser um inteiro maior que zero.');
            return;
          }
          patch[field] = next ? Number(next) : null;
        } else {
          if (field === 'originCode' && next && !/^[0-8]$/.test(next)) {
            setError('O código de origem deve ser um dígito de 0 a 8.');
            return;
          }
          if (field === 'ncm' && next && !/^\d{8}$/.test(next)) {
            setError('O NCM deve conter oito dígitos.');
            return;
          }
          if (field === 'cest' && next && !/^\d{7}$/.test(next)) {
            setError('O CEST deve conter sete dígitos.');
            return;
          }
          if (field === 'packagingGtin' && next && !/^\d{8,14}$/.test(next)) {
            setError('O GTIN da embalagem deve conter de 8 a 14 dígitos.');
            return;
          }
          if (field === 'purchaseCostExact' && next && !/^\d{1,8}(?:[.,]\d{1,4})?$/.test(next)) {
            setError('Informe o custo com até quatro casas decimais.');
            return;
          }
          patch[field] = next ? next.replace(',', '.') : null;
        }
      }
    }
    if (!Object.keys(patch).length) {
      onClose();
      return;
    }
    try {
      await onSave(patch, profile);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar a ficha.');
    }
  }

  return (
    <div
      className="da-product-modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="da-product-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="da-product-private-heading"
      >
        <form onSubmit={(event) => void submit(event)}>
          <header>
            <div>
              <p className="da-page-kicker">DADOS RESTRITOS / ADMINISTRADOR</p>
              <h2 id="da-product-private-heading">Fiscal e fornecedor</h2>
              <p>
                {product.name} · SKU {product.sku}
              </p>
            </div>
            <button
              type="button"
              className="da-product-close"
              aria-label="Fechar"
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <div className="da-product-form-grid">
            <label>
              Código de origem
              <input
                name="originCode"
                maxLength={1}
                inputMode="numeric"
                defaultValue={profile.originCode ?? ''}
              />
            </label>
            <label>
              NCM
              <input
                name="ncm"
                maxLength={8}
                inputMode="numeric"
                defaultValue={profile.ncm ?? ''}
              />
            </label>
            <label>
              CEST
              <input
                name="cest"
                maxLength={7}
                inputMode="numeric"
                defaultValue={profile.cest ?? ''}
              />
            </label>
            <label>
              GTIN da embalagem
              <input
                name="packagingGtin"
                maxLength={14}
                inputMode="numeric"
                defaultValue={profile.packagingGtin ?? ''}
              />
            </label>
            <label>
              Unidades por caixa
              <input
                name="unitsPerCase"
                type="number"
                min="1"
                step="1"
                defaultValue={profile.unitsPerCase ?? ''}
              />
            </label>
            <label>
              Fornecedor
              <input
                name="supplierName"
                maxLength={240}
                defaultValue={profile.supplierName ?? ''}
              />
            </label>
            <label>
              Código do fornecedor
              <input
                name="supplierCode"
                maxLength={120}
                defaultValue={profile.supplierCode ?? ''}
              />
            </label>
            <label>
              Custo de compra (R$)
              <input
                name="purchaseCostExact"
                inputMode="decimal"
                placeholder="0,0000"
                defaultValue={profile.purchaseCostExact ?? ''}
              />
            </label>
          </div>
          {error && (
            <p className="da-product-form-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <button
              type="button"
              className="da-button-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button type="submit" className="da-button-primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar ficha'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

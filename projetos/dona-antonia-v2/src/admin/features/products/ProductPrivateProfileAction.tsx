import { useState } from 'react';
import type { AdminProductsRepository, AdminProduct } from '../../../application/admin-products';
import { ProductPrivateProfileDialog } from './ProductPrivateProfileDialog';

export function ProductPrivateProfileAction({
  product,
  repository,
  onSaved,
}: {
  product: AdminProduct;
  repository: AdminProductsRepository;
  onSaved: (message: string) => void;
}) {
  const [profile, setProfile] = useState<Awaited<
    ReturnType<AdminProductsRepository['getPrivateProfile']>
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function open() {
    setLoading(true);
    setError('');
    try {
      setProfile(await repository.getPrivateProfile(product.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a ficha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="da-button-secondary"
        onClick={() => void open()}
        disabled={loading}
      >
        {loading ? 'Carregando…' : 'Fiscal / fornecedor'}
      </button>
      {error && <span role="alert">{error}</span>}
      {profile && (
        <ProductPrivateProfileDialog
          product={product}
          profile={profile}
          saving={saving}
          onClose={() => setProfile(null)}
          onSave={async (patch, current) => {
            setSaving(true);
            try {
              await repository.savePrivateProfile({
                productId: product.id,
                expectedRevision: current.revision,
                patch,
                requestId: crypto.randomUUID(),
              });
              setProfile(null);
              onSaved('Ficha fiscal e de fornecedor salva.');
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </>
  );
}

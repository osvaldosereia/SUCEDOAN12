export function CatalogStatus({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div className="catalog-status" role="status" aria-live="polite">
        <span className="catalog-status-spinner" aria-hidden="true" />
        <strong>Carregando catálogo</strong>
        <span>Estamos buscando preços e disponibilidade atualizados.</span>
      </div>
    );
  if (error || empty)
    return (
      <div className="catalog-status catalog-status-error" role="alert">
        <strong>{error || 'Catálogo ainda não disponível.'}</strong>
        <span>Os dados demonstrativos não serão usados para confirmar uma compra.</span>
        <button type="button" className="secondary-button" onClick={onRetry}>
          Tentar novamente
        </button>
      </div>
    );
  return null;
}

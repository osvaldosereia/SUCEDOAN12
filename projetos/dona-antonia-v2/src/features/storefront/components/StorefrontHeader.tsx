export function StorefrontHeader() {
  return (
    <>
      <div className="store-shipping-strip">
        <div className="container">
          <span>Entrega em Cuiabá e Várzea Grande</span>
          <span>Pagamento na entrega</span>
        </div>
      </div>
      <header className="topbar">
        <div className="container topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              DA
            </span>
            <span>
              Dona Antônia<small>Cestas básicas personalizáveis</small>
            </span>
          </div>
          <div className="store-header-assurance">
            <span>Escolha sua cesta</span>
            <span aria-hidden="true">•</span>
            <span>Troque as marcas</span>
            <span aria-hidden="true">•</span>
            <span>Receba em casa</span>
          </div>
        </div>
      </header>
    </>
  );
}

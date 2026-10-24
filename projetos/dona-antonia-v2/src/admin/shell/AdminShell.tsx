import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_GROUPS, ADMIN_SECTIONS } from '../navigation';
import type { AdminIconName } from './AdminIcon';
import { AdminIcon } from './AdminIcon';
import type { AvailableAdminSection } from '../navigation';
import type { Product } from '../../core/model';
import type { StaffSession } from '../../application/authentication-contracts';

interface Props {
  section: AvailableAdminSection;
  onNavigate: (id: AvailableAdminSection) => void;
  products: readonly Product[];
  onProductSearch: (value: string) => void;
  children: React.ReactNode;
  allowedSections: readonly AvailableAdminSection[];
  staffSession: StaffSession | null;
  onSignOut?: () => void;
}
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function AdminShell({
  section,
  onNavigate,
  products,
  onProductSearch,
  children,
  allowedSections,
  staffSession,
  onSignOut,
}: Props) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const current = ADMIN_SECTIONS.find((item) => item.id === section)!;
  const route = useCallback(
    (id: AvailableAdminSection) => {
      onNavigate(id);
      setMobileMenu(false);
      setSearchOpen(false);
      setQuery('');
    },
    [onNavigate],
  );

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        setMobileMenu(false);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setMobileMenu(false);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const q = normalize(query.trim());
  const allowedSet = new Set(allowedSections);
  const foundSections = ADMIN_SECTIONS.filter(
    (item) =>
      item.available &&
      allowedSet.has(item.id as AvailableAdminSection) &&
      (!q || normalize(item.label).includes(q)),
  );
  const foundProducts =
    q.length >= 2
      ? products
          .filter((item) =>
            normalize(item.name + ' ' + item.sku + ' ' + (item.gtin ?? '')).includes(q),
          )
          .slice(0, 6)
      : [];
  const showSidebar = mobileMenu ? ' da-drawer-open' : '';
  return (
    <div className={'da-admin-shell' + (collapsed ? ' da-nav-collapsed' : '') + showSidebar}>
      {mobileMenu && (
        <button
          type="button"
          className="da-drawer-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside id="da-admin-navigation" className="da-side" aria-label="Menu principal">
        <div className="da-side-brand">
          <div className="da-brand-symbol">DA</div>
          <div className="da-brand-text">
            <b>Dona Antônia</b>
            <small>Administração</small>
          </div>
          <button
            type="button"
            className="da-collapse-button"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={() => setCollapsed((v) => !v)}
          >
            <AdminIcon name="chevrons" size={17} />
          </button>
          <button
            type="button"
            className="da-close-drawer"
            aria-label="Fechar menu"
            onClick={() => setMobileMenu(false)}
          >
            <AdminIcon name="close" />
          </button>
        </div>
        <div className="da-side-search">
          <button
            type="button"
            className="da-global-search"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar no administrador"
          >
            <AdminIcon name="search" size={17} />
            <span>Buscar</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>
        <div className="da-side-scroll">
          <nav aria-label="Seções do administrador">
            {ADMIN_GROUPS.map((group) => (
              <section key={group.id} className="da-nav-group" aria-label={group.label}>
                <p className="da-nav-group-title">{group.label}</p>
                {ADMIN_SECTIONS.filter(
                  (item) =>
                    item.group === group.id &&
                    (!item.available || allowedSet.has(item.id as AvailableAdminSection)),
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    className={
                      'da-nav-item' +
                      (section === item.id ? ' is-active' : '') +
                      (!item.available ? ' is-planned' : '')
                    }
                    aria-current={section === item.id ? 'page' : undefined}
                    disabled={!item.available}
                    onClick={() => {
                      if (item.available) route(item.id as AvailableAdminSection);
                    }}
                  >
                    <AdminIcon name={item.icon as AdminIconName} />
                    <span className="da-nav-label">{item.label}</span>
                    {!item.available && (
                      <span className="da-planned-label" aria-hidden="true">
                        Em breve
                      </span>
                    )}
                  </button>
                ))}
              </section>
            ))}
          </nav>
        </div>
        <div className="da-side-footer">
          <span className="da-status-dot" />
          <span className="da-footer-copy">
            <b>Ambiente de prévia</b>
            <small>Sem conexão ou publicação</small>
          </span>
        </div>
      </aside>
      <div className="da-main-column">
        <header className="da-toolbar">
          <div className="da-toolbar-start">
            <button
              type="button"
              className="da-open-drawer"
              aria-label="Abrir menu"
              aria-expanded={mobileMenu}
              aria-controls="da-admin-navigation"
              onClick={() => setMobileMenu(true)}
            >
              <AdminIcon name="menu" />
            </button>
            <span className="da-toolbar-brand">
              Dona Antônia <span>Admin</span>
            </span>
            <span className="da-breadcrumb">
              {current.group === 'catalog'
                ? 'Catálogo e vitrine'
                : current.group === 'operation'
                  ? 'Operação'
                  : current.group === 'management'
                    ? 'Gestão'
                    : 'Sistema'}{' '}
              <AdminIcon name="chevron" size={14} /> <b>{current.label}</b>
            </span>
          </div>
          <div className="da-toolbar-end">
            <button
              type="button"
              className="da-mobile-search"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar no administrador"
            >
              <AdminIcon name="search" size={18} />
            </button>
            {staffSession ? (
              <div className="da-staff-account">
                <span title={staffSession.identity.email}>{staffSession.identity.email}</span>
                <button type="button" onClick={onSignOut}>
                  Sair
                </button>
              </div>
            ) : (
              <span className="da-preview-chip">Prévia</span>
            )}
          </div>
        </header>
        <main className="da-content" id="main-content">
          <div className="da-page-head">
            <div>
              <p className="da-page-kicker">DONA ANTÔNIA / {current.label.toUpperCase()}</p>
              <h1>{current.title}</h1>
              <p>{current.description}</p>
            </div>
            <span className="da-local-badge">Dados demonstrativos</span>
          </div>
          {children}
        </main>
      </div>
      {searchOpen && (
        <div
          className="da-search-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <section
            className="da-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="da-search-heading"
          >
            <div className="da-search-top">
              <AdminIcon name="search" size={20} />
              <label id="da-search-heading" className="sr-only" htmlFor="da-global-query">
                Buscar no administrador
              </label>
              <input
                id="da-global-query"
                ref={searchInput}
                autoComplete="off"
                placeholder="Busque uma seção ou produto..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="button" aria-label="Fechar busca" onClick={() => setSearchOpen(false)}>
                <AdminIcon name="close" size={18} />
              </button>
            </div>
            <div className="da-search-results">
              {!!foundSections.length && <p className="da-search-subhead">SEÇÕES</p>}
              {foundSections.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => route(item.id as AvailableAdminSection)}
                >
                  <AdminIcon name={item.icon as AdminIconName} size={18} />
                  <span>{item.label}</span>
                  <AdminIcon name="arrow" size={16} />
                </button>
              ))}
              {!!foundProducts.length && <p className="da-search-subhead">PRODUTOS</p>}
              {foundProducts.map((product) => (
                <button
                  type="button"
                  key={product.sku}
                  onClick={() => {
                    onProductSearch(product.name);
                    route('produtos');
                  }}
                >
                  <AdminIcon name="package" size={18} />
                  <span>
                    {product.name}
                    <small>{product.sku}</small>
                  </span>
                  <AdminIcon name="arrow" size={16} />
                </button>
              ))}
              {!foundSections.length && !foundProducts.length && (
                <p className="da-no-results">Nenhum resultado para “{query}”.</p>
              )}
            </div>
            <div className="da-search-hint">
              Pressione Esc para fechar · Pesquisa demonstrativa local
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

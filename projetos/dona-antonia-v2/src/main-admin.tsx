import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Product } from './core/model';
import type { OperationalOrder } from './core/orders';
import { DEMO_ORDERS } from './data/demo-orders';
import { useAdminSectionRoute } from './admin/routing/useAdminSectionRoute';
import { AdminShell } from './admin/shell/AdminShell';
const HomeDashboard = React.lazy(() =>
  import('./admin/features/home/HomeDashboard').then((m) => ({ default: m.HomeDashboard })),
);
const ProductsPanel = React.lazy(() =>
  import('./admin/features/products/ProductsPanel').then((m) => ({ default: m.ProductsPanel })),
);
const PersistentProductsPanel = React.lazy(() =>
  import('./admin/features/products/PersistentProductsPanel').then((m) => ({
    default: m.PersistentProductsPanel,
  })),
);
const ProductTypesPanel = React.lazy(() =>
  import('./admin/features/product-types/ProductTypesPanel').then((m) => ({
    default: m.ProductTypesPanel,
  })),
);
const BasketCompositionPanel = React.lazy(() =>
  import('./admin/features/baskets/BasketCompositionPanel').then((m) => ({
    default: m.BasketCompositionPanel,
  })),
);
const OrdersPanel = React.lazy(() =>
  import('./admin/features/orders/OrdersPanel').then((m) => ({ default: m.OrdersPanel })),
);
const PersistentOrdersPanel = React.lazy(() =>
  import('./admin/features/orders/PersistentOrdersPanel').then((m) => ({
    default: m.PersistentOrdersPanel,
  })),
);
const ExtraAdmin = React.lazy(() =>
  import('./admin/features/extras/ExtraAdmin').then((m) => ({ default: m.ExtraAdmin })),
);
const PersistentInboxPanel = React.lazy(() =>
  import('./admin/features/inbox/PersistentInboxPanel').then((m) => ({
    default: m.PersistentInboxPanel,
  })),
);
const CustomersPanel = React.lazy(() =>
  import('./admin/features/customers/CustomersPanel').then((m) => ({
    default: m.CustomersPanel,
  })),
);
const ReportsPanel = React.lazy(() =>
  import('./admin/features/reports/ReportsPanel').then((m) => ({
    default: m.ReportsPanel,
  })),
);
import './admin.css';
import { AdminAuthGate } from './admin/auth/AdminAuthGate';
import type { StaffSession } from './application/authentication-contracts';
import { canManagePrivatePricing, getAllowedAdminSections } from './admin/access';
import { createSupabaseBrowserClient, readSupabaseBrowserConfig } from './platform/supabase/client';
import { createStaffAuthentication } from './platform/supabase/staff-authentication';
import type { AdminProductsRepository } from './application/admin-products';
import { createSupabaseAdminProductsRepository } from './platform/supabase/admin-products';
import { createSupabaseAdminBasketConfigurationRepository } from './platform/supabase/admin-basket-configuration';
import { useBasketConfigurationAdmin } from './admin/features/baskets/useBasketConfigurationAdmin';
import type { AdminOrdersRepository } from './application/admin-orders';
import { createSupabaseAdminOrdersRepository } from './platform/supabase/admin-orders';
import { createSupabaseAdminInboxRepository } from './platform/supabase/admin-inbox';
import type { CustomerRepository } from './application/customers';
import { createSupabaseCustomerRepository } from './platform/supabase/customers';

function Admin({
  staffSession,
  onSignOut,
  productRepository,
  basketConfigurationRepository,
  ordersRepository,
  inboxRepository,
  customerRepository,
  demoMode,
}: {
  staffSession: StaffSession | null;
  onSignOut: () => Promise<void>;
  productRepository: AdminProductsRepository | null;
  basketConfigurationRepository: ReturnType<
    typeof createSupabaseAdminBasketConfigurationRepository
  > | null;
  ordersRepository: AdminOrdersRepository | null;
  inboxRepository: ReturnType<typeof createSupabaseAdminInboxRepository> | null;
  customerRepository: CustomerRepository | null;
  demoMode: boolean;
}) {
  const [tab, setTab] = useAdminSectionRoute();
  const allowedSections = staffSession
    ? getAllowedAdminSections(staffSession.role)
    : getAllowedAdminSections('ADMIN');
  const allowedSectionSet = new Set(allowedSections);
  const activeTab = allowedSectionSet.has(tab) ? tab : (allowedSections[0] ?? 'inicio');
  const navigateAllowed = (section: (typeof allowedSections)[number]) => {
    if (allowedSectionSet.has(section)) setTab(section);
  };
  const [orders, setOrders] = useState<OperationalOrder[]>(
    DEMO_ORDERS.map((order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item })),
    })),
  );
  const updateOrder = (id: string, change: (order: OperationalOrder) => OperationalOrder) => {
    setOrders((current) => current.map((order) => (order.id === id ? change(order) : order)));
  };
  const {
    products,
    setProducts,
    types,
    templates,
    extraGroups,
    privateBasketAdjustments,
    selectedTypeId,
    setSelectedTypeId,
    selectedBasketId,
    setSelectedBasketId,
    newTypeName,
    setNewTypeName,
    filter,
    setFilter,
    notice,
    setNotice,
    selectedType,
    selectedBasket,
    filteredProducts,
    ready: basketConfigurationReady,
    addType,
    toggleOption,
    reorderType,
    toggleTypeActive,
    renameType,
    setQuantity,
    setPrivateFee,
    createBasket,
    updateBasket,
    moveBasket,
    changeExtras,
    changeTypes,
  } = useBasketConfigurationAdmin(basketConfigurationRepository, productRepository);
  const changeProduct = (sku: string, patch: Partial<Product>) => {
    setProducts((current) =>
      current.map((item) => (item.sku === sku ? { ...item, ...patch } : item)),
    );
    setNotice('Alteração simulada; não foi salva no banco.');
  };
  return (
    <AdminShell
      section={activeTab}
      onNavigate={navigateAllowed}
      products={products}
      onProductSearch={setFilter}
      allowedSections={allowedSections}
      staffSession={staffSession}
      dataStatus={
        basketConfigurationRepository && ['tipos', 'cestas', 'extras'].includes(activeTab)
          ? 'Configuração V2'
          : activeTab === 'produtos' && productRepository
            ? 'Catálogo V2'
            : undefined
      }
      onSignOut={onSignOut}
    >
      {notice && (
        <div className="notice muted" role="status">
          {notice}
        </div>
      )}
      <React.Suspense
        fallback={
          <div className="notice muted" role="status">
            Carregando seção...
          </div>
        }
      >
        {activeTab === 'inicio' && (
          <HomeDashboard
            products={products}
            types={types}
            baskets={templates}
            extras={extraGroups}
            onNavigate={navigateAllowed}
          />
        )}
        {activeTab === 'pedidos' && ordersRepository && !demoMode && (
          <PersistentOrdersPanel repository={ordersRepository} />
        )}
        {activeTab === 'pedidos' && (!ordersRepository || demoMode) && (
          <OrdersPanel orders={orders} onUpdate={updateOrder} />
        )}
        {activeTab === 'atendimento' && inboxRepository && !demoMode && (
          <PersistentInboxPanel repository={inboxRepository} />
        )}
        {activeTab === 'atendimento' && (!inboxRepository || demoMode) && (
          <div className="notice muted">
            O Inbox V2 exige a conexão isolada do Supabase e não envia mensagens externas.
          </div>
        )}
        {activeTab === 'clientes' && customerRepository && !demoMode && (
          <CustomersPanel repository={customerRepository} />
        )}
        {activeTab === 'clientes' && (!customerRepository || demoMode) && (
          <div className="notice muted">
            O cadastro de clientes V2 exige a conexão isolada do Supabase.
          </div>
        )}
        {activeTab === 'relatorios' && customerRepository && !demoMode && (
          <ReportsPanel repository={customerRepository} />
        )}
        {activeTab === 'relatorios' && (!customerRepository || demoMode) && (
          <div className="notice muted">Os relatórios V2 exigem a conexão isolada do Supabase.</div>
        )}
        {activeTab === 'produtos' && productRepository && (
          <PersistentProductsPanel
            repository={productRepository}
            canManagePrivate={staffSession ? canManagePrivatePricing(staffSession.role) : false}
          />
        )}
        {activeTab === 'produtos' && !productRepository && (
          <ProductsPanel
            products={products}
            filteredProducts={filteredProducts}
            filter={filter}
            setFilter={setFilter}
            changeProduct={changeProduct}
          />
        )}
        {activeTab === 'tipos' && basketConfigurationReady && (
          <ProductTypesPanel
            types={types}
            selectedTypeId={selectedTypeId}
            setSelectedTypeId={setSelectedTypeId}
            newTypeName={newTypeName}
            setNewTypeName={setNewTypeName}
            addType={addType}
            selectedType={selectedType}
            filteredProducts={filteredProducts}
            filter={filter}
            setFilter={setFilter}
            toggleOption={toggleOption}
            onReorder={reorderType}
            onToggleActive={toggleTypeActive}
            onRename={renameType}
          />
        )}
        {activeTab === 'cestas' && basketConfigurationReady && (
          <BasketCompositionPanel
            templates={templates}
            selectedBasketId={selectedBasketId}
            setSelectedBasketId={setSelectedBasketId}
            selectedBasket={selectedBasket}
            types={types}
            setQuantity={setQuantity}
            privateFeeCents={privateBasketAdjustments[selectedBasketId] ?? 0}
            canManagePrivatePricing={
              staffSession ? canManagePrivatePricing(staffSession.role) : true
            }
            onPrivateFeeChange={setPrivateFee}
            onCreateBasket={createBasket}
            onUpdateBasket={updateBasket}
            onMoveBasket={moveBasket}
          />
        )}
        {activeTab === 'extras' && basketConfigurationReady && (
          <ExtraAdmin
            products={products}
            types={types}
            groups={extraGroups}
            onChangeGroups={changeExtras}
            onChangeTypes={changeTypes}
          />
        )}
      </React.Suspense>
    </AdminShell>
  );
}
const supabaseConfig = readSupabaseBrowserConfig(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
const supabaseClient = supabaseConfig ? createSupabaseBrowserClient(supabaseConfig) : null;
const authentication = supabaseClient ? createStaffAuthentication(supabaseClient) : null;
const adminProductsRepository = supabaseClient
  ? createSupabaseAdminProductsRepository(supabaseClient)
  : null;
const adminBasketConfigurationRepository = supabaseClient
  ? createSupabaseAdminBasketConfigurationRepository(supabaseClient)
  : null;
const adminOrdersRepository = supabaseClient
  ? createSupabaseAdminOrdersRepository(supabaseClient)
  : null;
const inboxRepo = supabaseClient ? createSupabaseAdminInboxRepository(supabaseClient) : null;
const customersRepo = supabaseClient ? createSupabaseCustomerRepository(supabaseClient) : null;
const demoMode = import.meta.env.DEV && import.meta.env.VITE_DA_DEMO_MODE === 'true';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminAuthGate
      provider={authentication}
      demoMode={import.meta.env.DEV && import.meta.env.VITE_DA_DEMO_MODE === 'true'}
    >
      {(staffSession, signOut) => (
        <Admin
          staffSession={staffSession}
          onSignOut={signOut}
          productRepository={adminProductsRepository}
          basketConfigurationRepository={adminBasketConfigurationRepository}
          ordersRepository={adminOrdersRepository}
          inboxRepository={inboxRepo}
          customerRepository={customersRepo}
          demoMode={demoMode}
        />
      )}
    </AdminAuthGate>
  </React.StrictMode>,
);

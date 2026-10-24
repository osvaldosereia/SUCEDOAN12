import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BasketId, BasketTemplate, Product, ProductType } from './core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from './data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from './data/demo-extra';
import type { ExtraGroup } from './core/extras';
import type {OperationalOrder} from './core/orders';
import {DEMO_ORDERS} from './data/demo-orders';
import {useAdminSectionRoute} from './admin/routing/useAdminSectionRoute';
import { AdminShell } from './admin/shell/AdminShell';
/** Cada sessão tem bundle próprio: não baixar módulos que o operador não abriu. */
const HomeDashboard=React.lazy(()=>import('./admin/features/home/HomeDashboard').then(m=>({default:m.HomeDashboard})));
const ProductsPanel=React.lazy(()=>import('./admin/features/products/ProductsPanel').then(m=>({default:m.ProductsPanel})));
const ProductTypesPanel=React.lazy(()=>import('./admin/features/product-types/ProductTypesPanel').then(m=>({default:m.ProductTypesPanel})));
const BasketCompositionPanel=React.lazy(()=>import('./admin/features/baskets/BasketCompositionPanel').then(m=>({default:m.BasketCompositionPanel})));
const OrdersPanel=React.lazy(()=>import('./admin/features/orders/OrdersPanel').then(m=>({default:m.OrdersPanel})));
const ExtraAdmin=React.lazy(()=>import('./admin/features/extras/ExtraAdmin').then(m=>({default:m.ExtraAdmin})));
import './admin.css';

function Admin() {
  const [tab,setTab] = useAdminSectionRoute();
  const [orders,setOrders] = useState<OperationalOrder[]>(DEMO_ORDERS.map(order=>({
    ...order,items:order.items.map(item=>({...item}))
  })));
  const updateOrder=(id:string,change:(order:OperationalOrder)=>OperationalOrder)=>{
    setOrders(current=>current.map(order=>order.id===id?change(order):order));
  };
  const [products,setProducts] = useState<Product[]>([...DEMO_PRODUCTS,...DEMO_EXTRA_PRODUCTS].map((product)=>({...product})));
  const [types,setTypes] = useState<ProductType[]>([...DEMO_TYPES,...DEMO_EXTRA_TYPES].map((type)=>({...type, productSkus:[...type.productSkus]})));
  const [templates,setTemplates] = useState<BasketTemplate[]>(DEMO_TEMPLATES.map((basket)=>({...basket,lines:[...basket.lines]})));
  const [extraGroups,setExtraGroups] = useState<ExtraGroup[]>(DEMO_EXTRA_GROUPS.map((group)=>({...group})));
  const [privateBasketAdjustments,setPrivateBasketAdjustments] = useState<Record<BasketId,number>>({
    economica:0,mini:0,pequena:0,media:0,grande:0
  });
  const [selectedTypeId,setSelectedTypeId] = useState('arroz');
  const [selectedBasketId,setSelectedBasketId] = useState<BasketId>('mini');
  const [newTypeName,setNewTypeName] = useState('');
  const [filter,setFilter] = useState('');
  const [notice,setNotice] = useState('');
  const selectedType = types.find((type)=>type.id===selectedTypeId);
  const selectedBasket = templates.find((template)=>template.id===selectedBasketId)!;
  const filteredProducts = useMemo(()=>products.filter((product)=>
    (product.name+' '+product.sku+' '+(product.gtin||'')).toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR'))
  ),[products,filter]);
  const changeProduct = (sku:string, patch:Partial<Product>) => {
    setProducts((current)=>current.map((item)=>item.sku===sku?{...item,...patch}:item));
    setNotice('Alteração simulada; não foi salva no banco.');
  };
  const addType = () => {
    const name=newTypeName.trim();
    if (!name || types.some((item)=>item.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))) {
      setNotice('Informe um nome novo para o tipo.'); return;
    }
    const id='tipo-'+(Math.max(0,...types.map((item)=>Number(item.id.replace('tipo-',''))||0))+1);
    setTypes((current)=>[...current,{id,name,productSkus:[],order:current.length+1}]);
    setSelectedTypeId(id);setNewTypeName('');setNotice('Tipo criado na prévia.');
  };
  const toggleOption = (sku:string) => {
    setTypes((current)=>current.map((type)=>{
      if (type.id!==selectedTypeId) return type;
      const selected = type.productSkus.includes(sku);
      return {...type,productSkus:selected?type.productSkus.filter((item)=>item!==sku):[...type.productSkus,sku]};
    }));
  };
  const setQuantity = (typeId:string, quantity:number) => {
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 999) return;
    setTemplates((current)=>current.map((basket)=>{
      if (basket.id!==selectedBasketId) return basket;
      const isListed=basket.lines.some((line)=>line.typeId===typeId);
      const lines=isListed ? basket.lines.filter((line)=>line.typeId!==typeId) : [...basket.lines];
      if (quantity>0) {
        const previous=basket.lines.find((line)=>line.typeId===typeId);
        lines.push({typeId,defaultQuantity:quantity,order:previous?.order??types.find((type)=>type.id===typeId)?.order??99});
      }
      return {...basket,lines:lines.sort((a,b)=>a.order-b.order)};
    }));
  };
  return <AdminShell section={tab} onNavigate={setTab} products={products} onProductSearch={setFilter}>
    {notice&&<div className="notice muted" role="status">{notice}</div>}
    <React.Suspense fallback={<div className="notice muted" role="status">Carregando seção...</div>}>
      {tab==='inicio' && <HomeDashboard products={products} types={types} baskets={templates} extras={extraGroups} onNavigate={setTab}/>}
      {tab==='pedidos'&&<OrdersPanel orders={orders} onUpdate={updateOrder}/>}
      {tab==='produtos' && <ProductsPanel
        products={products} filteredProducts={filteredProducts} filter={filter}
        setFilter={setFilter} changeProduct={changeProduct}/>}
      {tab==='tipos' && <ProductTypesPanel
        types={types} selectedTypeId={selectedTypeId} setSelectedTypeId={setSelectedTypeId}
        newTypeName={newTypeName} setNewTypeName={setNewTypeName} addType={addType}
        selectedType={selectedType} filteredProducts={filteredProducts}
        filter={filter} setFilter={setFilter} toggleOption={toggleOption}/>}
      {tab==='cestas' && <BasketCompositionPanel
        templates={templates} selectedBasketId={selectedBasketId} setSelectedBasketId={setSelectedBasketId}
        selectedBasket={selectedBasket} types={types} setQuantity={setQuantity}
        privateFeeCents={privateBasketAdjustments[selectedBasketId]}
        onPrivateFeeChange={(feeCents)=>setPrivateBasketAdjustments(current=>({...current,[selectedBasketId]:feeCents}))}/>}
      {tab==='extras'&&<ExtraAdmin
        products={products} types={types} groups={extraGroups}
        onChangeGroups={setExtraGroups} onChangeTypes={setTypes}/>}

    </React.Suspense>
  </AdminShell>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Admin/></React.StrictMode>);

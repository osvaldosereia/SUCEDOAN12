import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BasketId, BasketTemplate, Product, ProductType } from './core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from './data/demo';
import { DEMO_EXTRA_GROUPS, DEMO_EXTRA_PRODUCTS, DEMO_EXTRA_TYPES } from './data/demo-extra';
import type { ExtraGroup } from './core/extras';
import { ExtraAdmin } from './admin/features/extras/ExtraAdmin';
import { ProductsPanel } from './admin/features/products/ProductsPanel';
import { ProductTypesPanel } from './admin/features/product-types/ProductTypesPanel';
import { BasketCompositionPanel } from './admin/features/baskets/BasketCompositionPanel';
import './styles.css';

type Tab = 'produtos' | 'tipos' | 'cestas' | 'extras';
function Admin() {
  const [tab,setTab] = useState<Tab>('tipos');
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
  const [notice,setNotice] = useState('Todas as alterações desta prévia são temporárias e não afetam o Bling.');
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
  return <div className="admin-page">
    <aside className="admin-sidebar"><a className="brand" href="/admin/"><span className="brand-mark">DA</span><span>Dona Antônia<small>Admin V2 · Prévia</small></span></a>
      <nav aria-label="Módulos do painel">
        <button className={tab==='produtos'?'active':''} onClick={()=>setTab('produtos')}>Produtos</button>
        <button className={tab==='tipos'?'active':''} onClick={()=>setTab('tipos')}>Tipos de produto</button>
        <button className={tab==='cestas'?'active':''} onClick={()=>setTab('cestas')}>Composição das cestas</button>
        <button className={tab==='extras'?'active':''} onClick={()=>setTab('extras')}>Produtos extras</button>
      </nav>
      <p className="sidebar-note">Dados demonstrativos. Este painel não possui autenticação nem persistência; não publicar.</p>
    </aside>
    <main className="admin-main">
      <header className="admin-header"><div><p className="eyebrow">NOVO SISTEMA · HOMOLOGAÇÃO</p>
        <h1>{tab==='produtos'?'Cadastro de produtos':tab==='tipos'?'Tipos de produto':tab==='extras'?'Produtos extras':'Cestas básicas'}</h1>
        <p>Cadastro simples, independente e compatível com os SKUs do Bling.</p></div>
        <span className="pill">Não publicado</span>
      </header>
      <div className="notice muted" role="status">{notice}</div>
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
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Admin/></React.StrictMode>);

import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { formatBRL } from './core/money';
import { validateBasketTemplate } from './core/basket';
import { CATEGORIES } from './core/model';
import type { BasketId, BasketTemplate, Product, ProductType } from './core/model';
import { DEMO_PRODUCTS, DEMO_TEMPLATES, DEMO_TYPES } from './data/demo';
import './styles.css';

type Tab = 'produtos' | 'tipos' | 'cestas';
function Admin() {
  const [tab,setTab] = useState<Tab>('tipos');
  const [products,setProducts] = useState<Product[]>(DEMO_PRODUCTS.map((product)=>({...product})));
  const [types,setTypes] = useState<ProductType[]>(DEMO_TYPES.map((type)=>({...type, productSkus:[...type.productSkus]})));
  const [templates,setTemplates] = useState<BasketTemplate[]>(DEMO_TEMPLATES.map((basket)=>({...basket,lines:[...basket.lines]})));
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
      </nav>
      <p className="sidebar-note">Dados demonstrativos. Este painel não possui autenticação nem persistência; não publicar.</p>
    </aside>
    <main className="admin-main">
      <header className="admin-header"><div><p className="eyebrow">NOVO SISTEMA · HOMOLOGAÇÃO</p>
        <h1>{tab==='produtos'?'Cadastro de produtos':tab==='tipos'?'Tipos de produto':'Cestas básicas'}</h1>
        <p>Cadastro simples, independente e compatível com os SKUs do Bling.</p></div>
        <span className="pill">Não publicado</span>
      </header>
      <div className="notice muted" role="status">{notice}</div>
      {tab==='produtos' && <section className="panel">
        <div className="panel-heading"><div><h2>Produtos cadastrados</h2><p>Cada sabor e apresentação possui SKU próprio; filtro por nome, EAN ou código.</p></div>
          <span className="pill">{products.length} itens de exemplo</span></div>
        <input className="input" aria-label="Buscar produtos" value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Buscar produto, código ou EAN..." />
        <div className="scroll-table"><table><thead><tr><th>Produto</th><th>SKU / EAN</th><th>Categoria</th><th>Preço</th><th>Estoque simulado</th><th>Ativo no exemplo</th></tr></thead><tbody>
          {filteredProducts.map((item)=><tr key={item.sku}>
            <td><b>{item.name}</b><small>{item.brand}</small></td>
            <td><code>{item.sku}</code><small>{item.gtin||'Sem GTIN'}</small></td>
            <td>{item.category}</td><td>{formatBRL(item.priceCents)}</td>
            <td><input className="small-input" type="number" min="0" aria-label={'Estoque '+item.name} value={item.stock} onChange={(e)=>changeProduct(item.sku,{stock:Math.max(0,Math.trunc(Number(e.target.value)||0))})}/></td>
            <td><input type="checkbox" aria-label={'Ativar '+item.name} checked={item.active} onChange={(e)=>changeProduct(item.sku,{active:e.target.checked})}/></td>
          </tr>)}
        </tbody></table></div>
        <p className="below-note">Categorias reconhecidas: {CATEGORIES.join(' · ')}</p>
      </section>}
      {tab==='tipos' && <div className="admin-grid">
        <section className="panel"><h2>Tipos cadastrados</h2><p>Arroz, feijão e outros grupos de escolha para as cestas.</p>
          <div className="type-list">{types.map((type)=><button key={type.id} className={'type-row '+(type.id===selectedTypeId?'active':'')}
          onClick={()=>setSelectedTypeId(type.id)}><b>{type.name}</b><small>{type.productSkus.length} produtos</small></button>)}</div>
          <div className="form-row"><input className="input" placeholder="Novo tipo, ex.: Farinha" aria-label="Nome do novo tipo" value={newTypeName}
            onChange={(e)=>setNewTypeName(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')addType();}}/>
            <button className="secondary-button" onClick={addType}>Adicionar</button></div>
        </section>
        <section className="panel"><h2>Produtos permitidos: {selectedType?.name}</h2><p>Marque os SKUs reais que o cliente poderá escolher neste tipo. Produtos inativos não serão vendidos.</p>
          <input className="input" placeholder="Filtrar por nome ou EAN" aria-label="Buscar produtos para o tipo" value={filter} onChange={(e)=>setFilter(e.target.value)}/>
          <div className="option-checks">{filteredProducts.map((product)=><label className="check-row" key={product.sku}>
            <input type="checkbox" checked={selectedType?.productSkus.includes(product.sku)??false} onChange={()=>toggleOption(product.sku)}/>
            <span><b>{product.name}</b><small>{product.sku} · {formatBRL(product.priceCents)}</small></span>
          </label>)}</div>
        </section>
      </div>}
      {tab==='cestas' && <div className="admin-grid">
        <section className="panel"><h2>Tamanhos de cesta</h2><p>Os cinco tamanhos existem separadamente. Cada um possui suas próprias quantidades por tipo.</p>
          <div className="type-list">{templates.map((basket)=><button key={basket.id} className={'type-row '+(basket.id===selectedBasketId?'active':'')}
            onClick={()=>setSelectedBasketId(basket.id)}><b>{basket.name}</b><small>{basket.lines.length} tipos incluídos</small></button>)}</div>
        </section>
        <section className="panel"><h2>Composição: {selectedBasket.name}</h2><p>Informe a quantidade inicial de cada tipo. Zero significa que o tipo não faz parte deste tamanho.</p>
          {types.map((type)=>{
            const value=selectedBasket.lines.find((line)=>line.typeId===type.id)?.defaultQuantity??0;
            return <div className="quantity-row" key={type.id}><div><b>{type.name}</b><small>{type.productSkus.length} opções de marcas</small></div>
              <input className="small-input" type="number" min="0" max="999" aria-label={'Quantidade de '+type.name}
                value={value} onChange={(e)=>setQuantity(type.id,Number(e.target.value)||0)}/>
            </div>;
          })}
          <div className="notice">{validateBasketTemplate(selectedBasket,types).length===0?'Estrutura válida para prévia.':'Revise a configuração: há tipos inválidos ou duplicados.'}</div>
        </section>
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Admin/></React.StrictMode>);

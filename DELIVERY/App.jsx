import React, { useState, useEffect } from 'react';
import { 
  Save, Truck, Package, ShoppingCart, Users, MapPin, 
  Printer, Share2, Download, Upload, Trash2, Plus, 
  Minus, CheckCircle, Search, Navigation, Edit2, 
  ArrowUp, ArrowDown, History, MessageCircle, XCircle,
  AlertTriangle, FileText, Banknote, List, Tag, Percent
} from 'lucide-react';

// --- UTILS & DATA LAYER ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const useStickyState = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    const stickyValue = window.localStorage.getItem(key);
    return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
};

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('pt-BR');
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
};

// --- COMPONENTES PRINCIPAIS ---

export default function App() {
  // --- STATE (DB) ---
  const [clients, setClients] = useStickyState('db_clients_v3', []);
  const [products, setProducts] = useStickyState('db_products_v3', []);
  const [sales, setSales] = useStickyState('db_sales_v3', []);
  const [companyPhone, setCompanyPhone] = useStickyState('db_config_phone', '');
  
  // --- UI STATE ---
  const [viewMode, setViewMode] = useState('dashboard');
  const [driverData, setDriverData] = useState(null);

  // Verifica Link de Entregador
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#driver=')) {
      try {
        const encoded = hash.replace('#driver=', '');
        const decoded = JSON.parse(atob(decodeURIComponent(encoded)));
        setDriverData(decoded);
        setViewMode('driver');
      } catch (e) {
        console.error("Link inválido");
      }
    }
  }, []);

  // --- ACTIONS ---

  const handleBackup = () => {
    const data = { clients, products, sales, companyPhone, version: '3.1', exportedAt: new Date() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_logistica_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  const handleRestore = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (confirm("ATENÇÃO: Isso substituirá todos os dados atuais. Continuar?")) {
          setClients(data.clients || []);
          setProducts(data.products || []);
          setSales(data.sales || []);
          setCompanyPhone(data.companyPhone || '');
        }
      } catch (err) {
        alert("Erro ao ler backup.");
      }
    };
    reader.readAsText(file);
  };

  if (viewMode === 'driver') {
    return <DriverView data={driverData} onExit={() => {
      window.location.hash = '';
      setViewMode('dashboard');
    }} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 text-gray-800 font-sans overflow-hidden text-sm">
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-2 flex justify-between items-center shadow-lg z-20 shrink-0 h-14">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-500 text-slate-900 p-1 rounded font-bold">LOG</div>
          <h1 className="font-bold tracking-wider text-sm md:text-base hidden sm:block">SISTEMA INTEGRADO <span className="text-yellow-400 font-light">V3.1</span></h1>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative group">
            <input 
               placeholder="Zap da Empresa..." 
               className="text-black text-xs p-1.5 rounded w-32 md:w-40 focus:outline-none focus:ring-2 focus:ring-yellow-500"
               value={companyPhone}
               onChange={e => setCompanyPhone(e.target.value)}
            />
            <div className="absolute right-0 top-8 bg-black text-xs p-2 rounded hidden group-hover:block w-48 z-50">
              Número que receberá as confirmações de entrega do motoboy.
            </div>
          </div>
          
          <label className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded cursor-pointer text-xs transition border border-slate-600">
            <Upload size={14} /> <span className="hidden sm:inline">Importar</span>
            <input type="file" className="hidden" accept=".json" onChange={handleRestore} />
          </label>
          <button onClick={handleBackup} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-xs transition border border-emerald-400 font-bold shadow-sm">
            <Download size={14} /> <span className="hidden sm:inline">Backup</span>
          </button>
        </div>
      </header>

      {/* 5 COLUMNS GRID */}
      <div className="flex-1 overflow-hidden grid grid-cols-5 divide-x divide-gray-300">
        <Column title="CADASTROS" icon={<Save size={16}/>}>
          <RegistryPanel clients={clients} setClients={setClients} products={products} setProducts={setProducts} />
        </Column>

        <Column title="CAIXA / VENDA" icon={<ShoppingCart size={16}/>}>
          <POSPanel clients={clients} products={products} setProducts={setProducts} sales={sales} setSales={setSales} />
        </Column>

        <Column title="EXPEDIÇÃO" icon={<Package size={16}/>}>
          <ExpeditionPanel sales={sales} setSales={setSales} clients={clients} products={products} setProducts={setProducts} />
        </Column>

        <Column title="LOGÍSTICA" icon={<MapPin size={16}/>}>
          <LogisticsPanel sales={sales} setSales={setSales} clients={clients} companyPhone={companyPhone} />
        </Column>

        <Column title="GESTÃO" icon={<Users size={16}/>}>
          <CRMPanel sales={sales} clients={clients} products={products} />
        </Column>
      </div>
    </div>
  );
}

const Column = ({ title, icon, children }) => (
  <div className="bg-white flex flex-col min-w-0">
    <div className="bg-slate-100 p-2 border-b border-gray-200 font-bold flex items-center gap-2 text-slate-700 text-xs uppercase tracking-wide shadow-sm sticky top-0 z-10">
      {icon} {title}
    </div>
    <div className="flex-1 overflow-y-auto p-2 scrollbar-thin bg-white">
      {children}
    </div>
  </div>
);

// --- COLUNA 1: CADASTROS ---
function RegistryPanel({ clients, setClients, products, setProducts }) {
  const [tab, setTab] = useState('products');
  
  // States para Edição
  const [editingClientId, setEditingClientId] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);

  const [cForm, setCForm] = useState({ name: '', phone: '', address: '', city: 'Cuiabá', district: '', route: '', mapLink: '', photoLink: '' });
  const [pForm, setPForm] = useState({ name: '', category: 'geral', ncm: '', barcode: '', cost: '', price: '', stock: 0, isCombo: false, comboItems: [] });
  
  // Modals
  const [stockModal, setStockModal] = useState(null); 
  const [historyModal, setHistoryModal] = useState(null);

  // --- CLIENT ACTIONS ---

  const loadClientForEdit = (client) => {
    setCForm(client);
    setEditingClientId(client.id);
    setTab('clients');
  };

  const saveClient = () => {
    if (!cForm.name) return alert('Nome obrigatório');
    
    if (editingClientId) {
      // Update existing
      setClients(clients.map(c => c.id === editingClientId ? { ...cForm, id: editingClientId } : c));
      setEditingClientId(null);
      alert('Cliente Atualizado!');
    } else {
      // Create new
      setClients([...clients, { ...cForm, id: generateId() }]);
      alert('Cliente Cadastrado!');
    }
    // Reset form but keep city default
    setCForm({ name: '', phone: '', address: '', city: 'Cuiabá', district: '', route: '', mapLink: '', photoLink: '' });
  };

  const deleteClient = (id) => {
    if(confirm("Tem certeza que deseja apagar este cliente?")) {
      setClients(clients.filter(c => c.id !== id));
    }
  };

  // --- PRODUCT ACTIONS ---

  const loadProductForEdit = (product) => {
    setPForm(product);
    setEditingProductId(product.id);
    setTab('products');
  };

  const saveProduct = () => {
    if (!pForm.name) return alert('Nome obrigatório');

    if (editingProductId) {
      // Update existing (preserve stock history)
      setProducts(products.map(p => p.id === editingProductId ? { ...pForm, id: editingProductId, stock: p.stock, stockHistory: p.stockHistory } : p));
      setEditingProductId(null);
      alert('Produto Atualizado!');
    } else {
      // Create new
      const newProd = { 
        ...pForm, 
        id: generateId(), 
        stockHistory: [{ date: new Date().toISOString(), type: 'INITIAL', qty: Number(pForm.stock) }] 
      };
      setProducts([...products, newProd]);
      alert('Produto Cadastrado!');
    }
    setPForm({ name: '', category: 'geral', ncm: '', barcode: '', cost: '', price: '', stock: 0, isCombo: false, comboItems: [] });
  };

  const deleteProduct = (id) => {
    if(confirm("Tem certeza? Isso remove o produto de novas vendas.")) {
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const handleStockMove = () => {
    if (!stockModal || stockModal.qty <= 0) return;
    const { product, type, qty } = stockModal;
    
    const updatedProducts = products.map(p => {
      if (p.id === product.id) {
        const newStock = type === 'IN' ? p.stock + qty : p.stock - qty;
        const newHistory = [...(p.stockHistory || []), { date: new Date().toISOString(), type, qty }];
        return { ...p, stock: newStock, stockHistory: newHistory };
      }
      return p;
    });
    setProducts(updatedProducts);
    setStockModal(null);
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex bg-gray-200 p-1 rounded gap-1">
        <button onClick={() => setTab('clients')} className={`flex-1 py-1 text-xs font-bold rounded ${tab === 'clients' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>CLIENTES</button>
        <button onClick={() => setTab('products')} className={`flex-1 py-1 text-xs font-bold rounded ${tab === 'products' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>PRODUTOS</button>
      </div>

      {tab === 'clients' ? (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className={`p-2 rounded border space-y-2 ${editingClientId ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50'}`}>
            {editingClientId && <div className="text-xs font-bold text-yellow-700 uppercase mb-1">Editando Cliente</div>}
            <input className="input-field" placeholder="Nome do Cliente" value={cForm.name} onChange={e => setCForm({...cForm, name: e.target.value})} />
            <input className="input-field" placeholder="WhatsApp (apenas números)" value={cForm.phone} onChange={e => setCForm({...cForm, phone: e.target.value})} />
            <input className="input-field" placeholder="Endereço Completo" value={cForm.address} onChange={e => setCForm({...cForm, address: e.target.value})} />
            <div className="flex gap-1">
               <input className="input-field w-1/2" placeholder="Bairro" value={cForm.district} onChange={e => setCForm({...cForm, district: e.target.value})} />
               <select className="input-field w-1/2" value={cForm.city} onChange={e => setCForm({...cForm, city: e.target.value})}>
                 <option value="Cuiabá">Cuiabá</option>
                 <option value="Várzea Grande">Várzea Grande</option>
               </select>
            </div>
            <div className="flex gap-1">
               <input className="input-field w-1/3" placeholder="Rota" value={cForm.route} onChange={e => setCForm({...cForm, route: e.target.value})} />
               <input className="input-field w-2/3" placeholder="Link Maps" value={cForm.mapLink} onChange={e => setCForm({...cForm, mapLink: e.target.value})} />
            </div>
            <div className="flex gap-2">
              {editingClientId && <button onClick={() => {setEditingClientId(null); setCForm({ name: '', phone: '', address: '', city: 'Cuiabá', district: '', route: '', mapLink: '', photoLink: '' })}} className="w-1/3 bg-gray-400 text-white rounded text-xs font-bold">CANCELAR</button>}
              <button onClick={saveClient} className="btn-primary flex-1">{editingClientId ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR'}</button>
            </div>
          </div>
          
          <div className="mt-4">
            <h3 className="font-bold text-xs text-gray-500 mb-2 border-b">CLIENTES RECENTES</h3>
            {clients.slice().reverse().slice(0, 10).map(c => (
              <div key={c.id} className="text-xs p-2 border-b hover:bg-gray-50 flex justify-between items-center group">
                <div className="truncate flex-1">
                   <div className="font-bold">{c.name}</div>
                   <div className="text-gray-500">{c.district} • {c.city}</div>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                   <button onClick={() => loadClientForEdit(c)} className="text-blue-400 hover:text-blue-600"><Edit2 size={14}/></button>
                   <button onClick={() => deleteClient(c.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className={`p-2 rounded border space-y-2 ${editingProductId ? 'bg-yellow-50 border-yellow-300' : 'bg-gray-50'}`}>
            {editingProductId && <div className="text-xs font-bold text-yellow-700 uppercase mb-1">Editando Produto</div>}
            <input className="input-field" placeholder="Nome do Produto" value={pForm.name} onChange={e => setPForm({...pForm, name: e.target.value})} />
            <div className="flex gap-1">
               <select className="input-field w-1/2" value={pForm.category} onChange={e => setPForm({...pForm, category: e.target.value})}>
                  <option value="geral">Geral</option>
                  <option value="bebida">Bebida</option>
                  <option value="lanche">Lanche</option>
                  <option value="sobremesa">Sobremesa</option>
                  <option value="combo">Combo</option>
               </select>
               <input className="input-field w-1/2" placeholder="NCM" value={pForm.ncm} onChange={e => setPForm({...pForm, ncm: e.target.value})} />
            </div>
            
            <div className="flex gap-1">
               <div className="w-1/2">
                 <label className="text-[10px] font-bold text-gray-500">CUSTO</label>
                 <input className="input-field" type="number" value={pForm.cost} onChange={e => setPForm({...pForm, cost: e.target.value})} />
               </div>
               <div className="w-1/2">
                 <label className="text-[10px] font-bold text-gray-500">VENDA</label>
                 <input className="input-field font-bold text-green-700" type="number" value={pForm.price} onChange={e => setPForm({...pForm, price: e.target.value})} />
               </div>
            </div>

            {!pForm.isCombo && !editingProductId && (
              <div className="bg-white p-2 rounded border border-gray-200">
                 <label className="text-[10px] font-bold text-blue-800">ESTOQUE INICIAL</label>
                 <input className="input-field" type="number" value={pForm.stock} onChange={e => setPForm({...pForm, stock: Number(e.target.value)})} />
              </div>
            )}
            
            <div className="flex items-center gap-2 mt-2">
              <input type="checkbox" id="isCombo" checked={pForm.isCombo} onChange={e => setPForm({...pForm, isCombo: e.target.checked})} />
              <label htmlFor="isCombo" className="text-xs font-bold">É um Combo? (Kit)</label>
            </div>

            {pForm.isCombo && (
              <div className="bg-yellow-50 p-2 border border-yellow-200 rounded text-xs space-y-2">
                <p className="font-bold text-yellow-800">Composição do Combo:</p>
                <div className="max-h-32 overflow-y-auto">
                  {products.filter(p => !p.isCombo).map(p => (
                    <div key={p.id} className="flex justify-between items-center py-1 border-b border-yellow-100">
                      <span>{p.name}</span>
                      <input 
                        type="number" 
                        className="w-12 border rounded text-center text-xs" 
                        placeholder="0"
                        onChange={(e) => {
                           const qty = Number(e.target.value);
                           const existing = pForm.comboItems.filter(i => i.id !== p.id);
                           if (qty > 0) setPForm({...pForm, comboItems: [...existing, {id: p.id, qty}]});
                           else setPForm({...pForm, comboItems: existing});
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              {editingProductId && <button onClick={() => {setEditingProductId(null); setPForm({ name: '', category: 'geral', ncm: '', barcode: '', cost: '', price: '', stock: 0, isCombo: false, comboItems: [] })}} className="w-1/3 bg-gray-400 text-white rounded text-xs font-bold">CANCELAR</button>}
              <button onClick={saveProduct} className="btn-primary flex-1">{editingProductId ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR'}</button>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="font-bold text-xs text-gray-500 mb-2 border-b">GERENCIAR ESTOQUE</h3>
            {products.map(p => (
              <div key={p.id} className="flex justify-between items-center text-xs py-2 border-b group hover:bg-gray-50 px-1">
                <div className="flex-1 cursor-pointer" onClick={() => setHistoryModal(p)}>
                  <div className="font-bold flex items-center gap-1">
                    {p.name} 
                    {p.isCombo && <span className="bg-yellow-100 text-yellow-800 text-[9px] px-1 rounded">KIT</span>}
                  </div>
                  <div className="text-[10px] text-gray-500 flex items-center gap-1">
                     Estoque: {p.stock} • {formatCurrency(p.price)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    {!p.isCombo && (
                      <div className="flex bg-gray-100 rounded border border-gray-300">
                        <button onClick={() => setStockModal({product: p, type: 'IN', qty: 0})} className="text-green-700 p-1 hover:bg-green-200 rounded-l transition" title="Entrada"><Plus size={14}/></button>
                        <div className="w-px bg-gray-300"></div>
                        <button onClick={() => setStockModal({product: p, type: 'OUT', qty: 0})} className="text-red-700 p-1 hover:bg-red-200 rounded-r transition" title="Saída"><Minus size={14}/></button>
                      </div>
                    )}
                    <button onClick={() => loadProductForEdit(p)} className="text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100"><Edit2 size={14}/></button>
                    <button onClick={() => deleteProduct(p.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button>
                </div>
              </div>
            ))}
          </div>

          {/* Stock Modal */}
          {stockModal && (
            <div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center p-4">
              <h3 className="font-bold mb-2">Movimentação: {stockModal.product.name}</h3>
              <div className={`text-sm font-bold mb-4 ${stockModal.type === 'IN' ? 'text-green-600' : 'text-red-600'}`}>
                {stockModal.type === 'IN' ? 'ENTRADA DE ESTOQUE' : 'SAÍDA DE ESTOQUE'}
              </div>
              <input 
                autoFocus
                type="number" 
                className="text-2xl text-center w-24 border-b-2 border-gray-300 focus:outline-none mb-4" 
                value={stockModal.qty || ''}
                placeholder="0"
                onChange={e => setStockModal({...stockModal, qty: Number(e.target.value)})}
              />
              <div className="flex gap-2 w-full">
                <button onClick={() => setStockModal(null)} className="flex-1 bg-gray-200 py-2 rounded">Cancelar</button>
                <button onClick={handleStockMove} className={`flex-1 py-2 rounded text-white font-bold ${stockModal.type === 'IN' ? 'bg-green-600' : 'bg-red-600'}`}>Confirmar</button>
              </div>
            </div>
          )}

          {/* History Modal */}
          {historyModal && (
            <div className="absolute inset-0 bg-white/95 z-20 flex flex-col p-4 animate-in fade-in">
               <div className="flex justify-between items-center mb-4 border-b pb-2">
                 <h3 className="font-bold">Histórico: {historyModal.name}</h3>
                 <button onClick={() => setHistoryModal(null)}><XCircle className="text-gray-500"/></button>
               </div>
               <div className="flex-1 overflow-y-auto space-y-2">
                 {historyModal.stockHistory?.slice().reverse().map((h, i) => (
                   <div key={i} className="text-xs border-b pb-1 flex justify-between">
                     <span className="text-gray-500">{formatDateTime(h.date)}</span>
                     <span className={`font-bold ${h.type === 'INITIAL' || h.type === 'IN' || h.type === 'CANCEL_RETURN' ? 'text-green-600' : 'text-red-600'}`}>
                       {h.type} ({h.qty})
                     </span>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- COLUNA 2: POS ---
function POSPanel({ clients, products, setProducts, sales, setSales }) {
  const [selectedClient, setSelectedClient] = useState('');
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState('Pix');
  const [changeFor, setChangeFor] = useState(''); 
  const [obs, setObs] = useState(''); 
  const [searchProd, setSearchProd] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todas');
  const [discount, setDiscount] = useState('');

  // Editing logic
  const [editingItem, setEditingItem] = useState(null); 

  const categories = ['todas', ...new Set(products.map(p => p.category))];

  const addToCart = (product) => {
    if (!product.isCombo && product.stock <= 0) {
      if (!confirm("Produto sem estoque! Adicionar mesmo assim?")) return;
    }
    setCart([...cart, { ...product, tempId: generateId(), originalPrice: product.price }]);
  };

  const updateCartItemPrice = () => {
    if (!editingItem) return;
    setCart(cart.map(i => i.tempId === editingItem.tempId ? { ...i, price: editingItem.price } : i));
    setEditingItem(null);
  };

  const removeFromCart = (tempId) => {
    setCart(cart.filter(item => item.tempId !== tempId));
  };

  const subTotal = cart.reduce((acc, item) => acc + Number(item.price), 0);
  const total = subTotal - (Number(discount) || 0);

  const finalizeSale = () => {
    if (!selectedClient) return alert('Selecione um cliente');
    if (cart.length === 0) return alert('Carrinho vazio');

    // Stock deduction
    const newProducts = [...products];
    cart.forEach(cartItem => {
      const dbProd = newProducts.find(p => p.id === cartItem.id);
      if (dbProd) {
        if (dbProd.isCombo) {
          dbProd.comboItems?.forEach(ing => {
             const dbIng = newProducts.find(p => p.id === ing.id);
             if (dbIng) {
               dbIng.stock -= ing.qty;
               dbIng.stockHistory.push({ date: new Date().toISOString(), type: 'SALE_COMBO', qty: ing.qty, ref: cartItem.name });
             }
          });
        } else {
          dbProd.stock -= 1;
          dbProd.stockHistory.push({ date: new Date().toISOString(), type: 'SALE', qty: 1 });
        }
      }
    });
    setProducts(newProducts);

    const newSale = {
      id: generateId(),
      clientId: selectedClient,
      items: cart,
      subTotal,
      discount: Number(discount) || 0,
      total,
      payMethod,
      changeFor: payMethod === 'Dinheiro' ? changeFor : null,
      obs,
      date: new Date().toISOString(),
      status: 'Pendente',
      printedLabel: false,
      printedList: false,
      routeId: null
    };

    setSales([...sales, newSale]);
    setCart([]);
    setSelectedClient('');
    setObs('');
    setChangeFor('');
    setDiscount('');
    alert('Venda Realizada!');
  };

  const filteredProducts = products.filter(p => 
    (selectedCategory === 'todas' || p.category === selectedCategory) &&
    p.name.toLowerCase().includes(searchProd.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full space-y-3 pb-12 relative">
      {/* Client Search */}
      <div className="bg-blue-50 p-2 rounded border border-blue-100">
        <label className="text-[10px] font-bold text-blue-800 uppercase flex items-center gap-1"><Users size={10}/> 1. Identificar Cliente</label>
        <select 
          className="input-field mt-1 bg-white"
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
        >
          <option value="">Selecione...</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name} - {c.district} ({c.city})</option>)}
        </select>
      </div>

      {/* Product Search & List */}
      <div className="flex-1 flex flex-col min-h-0 bg-white border rounded">
        <div className="p-2 border-b bg-gray-50 space-y-2">
          {/* Category Filter */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {categories.map(cat => (
              <button 
                key={cat} 
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full whitespace-nowrap ${selectedCategory === cat ? 'bg-slate-800 text-white' : 'bg-gray-200 text-gray-600'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          
          <div className="relative">
             <Search size={14} className="absolute left-2 top-2 text-gray-400" />
             <input 
               className="w-full pl-8 pr-2 py-1 text-sm border rounded focus:outline-none focus:border-blue-500" 
               placeholder="Buscar Produto..." 
               value={searchProd}
               onChange={e => setSearchProd(e.target.value)}
             />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {filteredProducts.map(p => (
            <div key={p.id} onClick={() => addToCart(p)} className="p-2 border-b hover:bg-blue-50 cursor-pointer flex justify-between items-center group">
              <div>
                <div className="font-bold text-xs group-hover:text-blue-700">{p.name}</div>
                <div className="text-[10px] text-gray-400">Estoque: {p.stock}</div>
              </div>
              <div className="font-bold text-xs text-green-700">{formatCurrency(p.price)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart & Total */}
      <div className="bg-slate-800 text-white p-3 rounded shadow-lg flex flex-col gap-2">
        <div className="flex justify-between items-center border-b border-gray-600 pb-1">
          <span className="font-bold text-xs">CARRINHO ({cart.length})</span>
          <span className="font-bold text-lg text-green-400">{formatCurrency(total)}</span>
        </div>
        
        <div className="max-h-24 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-gray-600">
          {cart.map(item => (
            <div key={item.tempId} className="flex justify-between items-center text-xs bg-slate-700 p-1 rounded">
              <span className="truncate w-1/2">{item.name}</span>
              <div className="flex items-center gap-2">
                 <span className="text-yellow-400 cursor-pointer hover:underline" onClick={() => setEditingItem({tempId: item.tempId, price: item.price})}>
                   {formatCurrency(item.price)}
                 </span>
                 <Trash2 size={12} className="text-red-400 cursor-pointer hover:text-red-300" onClick={() => removeFromCart(item.tempId)} />
              </div>
            </div>
          ))}
        </div>
        
        {/* Discount Field */}
        <div className="flex items-center gap-2 bg-slate-700 p-1 rounded border border-slate-600">
          <Percent size={12} className="text-yellow-500"/>
          <input 
            type="number"
            className="bg-transparent text-white text-xs w-full focus:outline-none placeholder-gray-400"
            placeholder="Desconto no Total (R$)"
            value={discount}
            onChange={e => setDiscount(e.target.value)}
          />
        </div>

        {/* Extra Fields */}
        <div className="grid grid-cols-2 gap-2">
            <input 
              className="text-black text-xs p-1.5 rounded" 
              placeholder="Obs (Ex: Sem cebola)"
              value={obs}
              onChange={e => setObs(e.target.value)}
            />
            <select className="text-black text-xs p-1.5 rounded" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              <option value="Pix">Pix</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Cartão">Cartão</option>
            </select>
        </div>

        {payMethod === 'Dinheiro' && (
           <div className="flex items-center gap-2 bg-slate-700 p-1 rounded">
              <span className="text-[10px]">Troco p/:</span>
              <input 
                type="number" 
                className="flex-1 text-black text-xs p-1 rounded" 
                placeholder="R$ Valor da nota"
                value={changeFor}
                onChange={e => setChangeFor(e.target.value)}
              />
              <span className="text-xs font-bold text-yellow-400">
                 {changeFor ? formatCurrency(Number(changeFor) - total) : 'R$ 0,00'}
              </span>
           </div>
        )}

        <button onClick={finalizeSale} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded text-xs transition uppercase tracking-wider">
          FINALIZAR VENDA
        </button>
      </div>

      {/* Price Edit Modal */}
      {editingItem && (
        <div className="absolute inset-0 bg-black/80 z-20 flex flex-col items-center justify-center p-4 rounded">
          <label className="text-white text-xs mb-1">Novo Preço</label>
          <input 
            type="number" 
            autoFocus
            className="text-center p-2 rounded text-black font-bold mb-2 w-32"
            value={editingItem.price}
            onChange={e => setEditingItem({...editingItem, price: e.target.value})}
          />
          <div className="flex gap-2">
            <button onClick={() => setEditingItem(null)} className="bg-gray-600 text-white px-3 py-1 rounded text-xs">Cancelar</button>
            <button onClick={updateCartItemPrice} className="bg-green-500 text-white px-3 py-1 rounded text-xs">Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- COLUNA 3: EXPEDIÇÃO ---
function ExpeditionPanel({ sales, setSales, clients, products, setProducts }) {
  const updateStatus = (saleId, newStatus) => {
    setSales(sales.map(s => s.id === saleId ? { ...s, status: newStatus } : s));
  };

  const togglePrint = (saleId, field) => {
    setSales(sales.map(s => s.id === saleId ? { ...s, [field]: !s[field] } : s));
  };

  const cancelSale = (sale) => {
    if (!confirm(`Deseja cancelar a venda de ${formatCurrency(sale.total)}? Isso devolverá os itens ao estoque.`)) return;

    // Return to stock logic
    const newProducts = [...products];
    sale.items.forEach(item => {
      const dbProd = newProducts.find(p => p.id === item.id);
      if (dbProd) {
        if (dbProd.isCombo) {
           dbProd.comboItems?.forEach(ing => {
             const dbIng = newProducts.find(p => p.id === ing.id);
             if (dbIng) {
               dbIng.stock += ing.qty;
               dbIng.stockHistory.push({ date: new Date().toISOString(), type: 'CANCEL_RETURN', qty: ing.qty });
             }
           });
        } else {
          dbProd.stock += 1;
          dbProd.stockHistory.push({ date: new Date().toISOString(), type: 'CANCEL_RETURN', qty: 1 });
        }
      }
    });

    setProducts(newProducts);
    setSales(sales.filter(s => s.id !== sale.id));
  };

  const printLabel = (sale, client) => {
    const w = window.open('', '', 'width=300,height=400');
    w.document.write(`
      <style>body{font-family:sans-serif; padding:10px; text-align:center; margin:0} .box{border:2px solid #000; padding:5px; margin-bottom:5px}</style>
      <h2>PEDIDO #${sale.id.substring(0,4).toUpperCase()}</h2>
      <div class="box">
        <h3>${client.name}</h3>
        <p>${client.address}</p>
        <p>${client.district} - ${client.city}</p>
        <p><strong>ROTA: ${client.route || 'GERAL'}</strong></p>
      </div>
      <p style="font-size:12px">OBS: ${sale.obs || '-'}</p>
      <script>window.print()</script>
    `);
    w.document.close();
  };

  const printPickingList = (sale, client) => {
    const w = window.open('', '', 'width=400,height=600');
    w.document.write(`
      <style>body{font-family:monospace; padding:20px;} h2{border-bottom:1px solid #000}</style>
      <h2>LISTA DE SEPARAÇÃO #${sale.id.substring(0,4)}</h2>
      <p>CLIENTE: ${client.name}</p>
      <hr/>
      <ul>
        ${sale.items.map(i => `<li>[ ] ${i.name}</li>`).join('')}
      </ul>
      <hr/>
      <p>OBS: ${sale.obs || ''}</p>
      <script>window.print()</script>
    `);
    w.document.close();
  };

  const activeSales = sales.filter(s => s.status !== 'Entregue').sort((a,b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="space-y-2">
      {activeSales.map(sale => {
        const client = clients.find(c => c.id === sale.clientId) || {};
        const isPendente = sale.status === 'Pendente';
        const isMontagem = sale.status === 'Montagem';
        
        return (
          <div key={sale.id} className={`p-2 border rounded shadow-sm relative group transition-all ${isPendente ? 'bg-red-50 border-red-200' : isMontagem ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
             
             {/* Header Card */}
             <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-xs text-gray-600 bg-white px-1 rounded border">#{sale.id.substring(0,4)}</span>
                <button onClick={() => cancelSale(sale)} className="text-red-300 hover:text-red-600" title="Cancelar Venda"><XCircle size={14}/></button>
             </div>
             
             <div className="font-bold text-sm leading-tight mb-1">{client.name}</div>
             <div className="text-xs text-gray-500 mb-2">{client.district}</div>
             
             {/* Items Preview */}
             <div className="bg-white/60 p-1.5 rounded text-[10px] text-gray-700 mb-2 border border-gray-100 shadow-sm">
               {sale.items.map(i => i.name).join(', ')}
             </div>

             {/* Printing Actions */}
             <div className="bg-white p-2 rounded border border-gray-200 mb-2 space-y-2">
                <div className="flex justify-between items-center text-xs">
                   <div className="flex items-center gap-1">
                     <input type="checkbox" checked={sale.printedLabel} onChange={() => togglePrint(sale.id, 'printedLabel')} />
                     <span className={sale.printedLabel ? 'text-green-600 font-bold' : 'text-gray-500'}>Etiqueta</span>
                   </div>
                   <button onClick={() => printLabel(sale, client)} className="bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded flex gap-1 items-center border">
                      <Tag size={10}/> Imprimir
                   </button>
                </div>
                <div className="flex justify-between items-center text-xs">
                   <div className="flex items-center gap-1">
                     <input type="checkbox" checked={sale.printedList} onChange={() => togglePrint(sale.id, 'printedList')} />
                     <span className={sale.printedList ? 'text-green-600 font-bold' : 'text-gray-500'}>Lista</span>
                   </div>
                   <button onClick={() => printPickingList(sale, client)} className="bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded flex gap-1 items-center border">
                      <List size={10}/> Imprimir
                   </button>
                </div>
             </div>

             {/* Status Actions */}
             <div className="flex justify-between items-center mt-2 border-t pt-2 border-dashed border-gray-300">
               <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{sale.status}</span>
               {isPendente && <button onClick={() => updateStatus(sale.id, 'Montagem')} className="bg-red-500 text-white text-xs px-3 py-1.5 rounded font-bold shadow hover:bg-red-600 transition">INICIAR</button>}
               {isMontagem && <button onClick={() => updateStatus(sale.id, 'Rota')} className="bg-yellow-500 text-white text-xs px-3 py-1.5 rounded font-bold shadow hover:bg-yellow-600 transition">PRONTO</button>}
               {sale.status === 'Rota' && <span className="text-xs text-green-600 font-bold flex items-center gap-1"><CheckCircle size={12}/> OK</span>}
             </div>
          </div>
        );
      })}
      {activeSales.length === 0 && <div className="text-center text-gray-400 text-xs mt-10 p-4 border-2 border-dashed border-gray-200 rounded">Expedição Vazia</div>}
    </div>
  );
}

// --- COLUNA 4: LOGÍSTICA ---
function LogisticsPanel({ sales, setSales, clients, companyPhone }) {
  const [selectedRoute, setSelectedRoute] = useState('Todas');
  const [routeSales, setRouteSales] = useState([]); 

  useEffect(() => {
    const ready = sales.filter(s => s.status === 'Rota');
    const filtered = selectedRoute === 'Todas' 
      ? ready 
      : ready.filter(s => {
          const c = clients.find(cl => cl.id === s.clientId);
          return c?.route === selectedRoute;
        });
    setRouteSales(filtered);
  }, [sales, selectedRoute, clients]);

  const routes = [...new Set(clients.map(c => c.route).filter(Boolean))];

  const moveOrder = (index, direction) => {
    const newOrder = [...routeSales];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
    } else if (direction === 'down' && index < newOrder.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    }
    setRouteSales(newOrder);
  };

  const generateDriverLink = () => {
    if (routeSales.length === 0) return alert("Nada para entregar!");
    
    const payload = {
      route: selectedRoute,
      companyPhone, 
      generatedAt: new Date(),
      orders: routeSales.map(s => {
        const c = clients.find(cl => cl.id === s.clientId);
        return {
          id: s.id,
          customer: c.name,
          phone: c.phone,
          address: c.address,
          district: c.district,
          map: c.mapLink,
          total: s.total,
          pay: s.payMethod,
          changeFor: s.changeFor,
          change: s.changeFor ? s.changeFor - s.total : 0,
          obs: s.obs,
          items: s.items.map(i => i.name)
        };
      })
    };

    const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
    const link = `${window.location.origin}${window.location.pathname}#driver=${encoded}`;
    
    // Fallback copy method
    const textArea = document.createElement("textarea");
    textArea.value = link;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      alert("LINK COPIADO! Envie para o entregador.");
    } catch (err) {
      console.error('Erro ao copiar', err);
      prompt("Copie o link manualmente:", link);
    }
    document.body.removeChild(textArea);
  };

  const forceDelivery = (id) => {
    if (confirm("Marcar como entregue manualmente?")) {
      setSales(sales.map(s => s.id === id ? { ...s, status: 'Entregue' } : s));
    }
  };

  const totalValue = routeSales.reduce((acc, s) => acc + s.total, 0);

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="bg-indigo-50 p-2 rounded border border-indigo-100 space-y-2">
        <label className="text-[10px] font-bold text-indigo-800 uppercase">1. Filtrar Rota</label>
        <div className="flex gap-2">
          <select className="flex-1 input-field bg-white" value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)}>
            <option value="Todas">Todas as Rotas</option>
            {routes.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={generateDriverLink} className="bg-indigo-600 text-white px-3 rounded hover:bg-indigo-700 shadow flex items-center gap-2 text-xs font-bold" title="Criar Link">
            <Share2 size={14} /> CRIAR LINK
          </button>
        </div>
      </div>

      {routeSales.length > 0 && (
        <div className="flex justify-between items-center text-xs px-2 py-1 bg-white border rounded text-gray-500">
           <span>{routeSales.length} Entregas</span>
           <span className="font-bold text-green-700">Total: {formatCurrency(totalValue)}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2 p-1 bg-gray-50 border rounded">
         {routeSales.map((s, idx) => {
           const client = clients.find(c => c.id === s.clientId) || {};
           return (
             <div key={s.id} className="bg-white p-2 rounded shadow-sm border-l-4 border-indigo-500 flex gap-2 relative">
                <div className="flex flex-col justify-center gap-1 border-r pr-2 text-gray-400">
                  <button onClick={() => moveOrder(idx, 'up')} className="hover:text-indigo-600"><ArrowUp size={14}/></button>
                  <span className="text-center font-bold text-xs text-indigo-900 bg-indigo-100 rounded">{idx + 1}º</span>
                  <button onClick={() => moveOrder(idx, 'down')} className="hover:text-indigo-600"><ArrowDown size={14}/></button>
                </div>
                <div className="flex-1 min-w-0">
                   <div className="flex justify-between">
                     <span className="font-bold text-sm text-gray-800 truncate">{client.name}</span>
                     <button onClick={() => forceDelivery(s.id)} className="text-gray-300 hover:text-green-500"><CheckCircle size={14}/></button>
                   </div>
                   <div className="text-xs text-gray-500 truncate">{client.address}</div>
                   
                   <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                      <span className="bg-gray-200 px-1 rounded">{s.payMethod}</span>
                      <span className="bg-green-100 text-green-800 px-1 rounded font-bold">{formatCurrency(s.total)}</span>
                      {s.changeFor && <span className="bg-red-100 text-red-800 px-1 rounded font-bold">Troco: {formatCurrency(s.changeFor - s.total)}</span>}
                   </div>
                   {s.obs && <div className="text-[10px] text-orange-600 font-bold mt-1 truncate">OBS: {s.obs}</div>}
                </div>
             </div>
           );
         })}
         {routeSales.length === 0 && <div className="text-center text-xs text-gray-400 mt-4">Nenhuma entrega nesta rota.</div>}
      </div>
      <div className="text-[10px] text-gray-400 text-center">Ordene a sequência com as setas.</div>
    </div>
  );
}

// --- COLUNA 5: CRM ---
function CRMPanel({ sales, clients, products }) {
  const [filter, setFilter] = useState('all'); // 'today', 'all'

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const filteredSales = filter === 'all' 
    ? sales 
    : sales.filter(s => s.date.startsWith(todayStr));

  const totalSold = filteredSales.reduce((acc, s) => acc + s.total, 0);
  const deliveredSales = filteredSales.filter(s => s.status === 'Entregue');
  const deliveredTotal = deliveredSales.reduce((acc, s) => acc + s.total, 0);
  
  // Best Sellers
  const prodCount = {};
  filteredSales.forEach(s => s.items.forEach(i => prodCount[i.name] = (prodCount[i.name] || 0) + 1));
  const bestSellers = Object.entries(prodCount).sort((a,b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-4">
      
      {/* Date Filter */}
      <div className="flex bg-gray-200 p-1 rounded">
        <button onClick={() => setFilter('today')} className={`flex-1 py-1 text-xs font-bold rounded ${filter === 'today' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>HOJE</button>
        <button onClick={() => setFilter('all')} className={`flex-1 py-1 text-xs font-bold rounded ${filter === 'all' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>TOTAL</button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="bg-white border rounded p-3 shadow-sm border-l-4 border-green-500">
          <div className="text-xs text-gray-500 uppercase font-bold flex justify-between">
            <span>Recebido (Entregue)</span>
            <Banknote size={14}/>
          </div>
          <div className="text-xl font-bold text-gray-800">{formatCurrency(deliveredTotal)}</div>
        </div>
        <div className="bg-white border rounded p-3 shadow-sm border-l-4 border-orange-500">
          <div className="text-xs text-gray-500 uppercase font-bold flex justify-between">
            <span>Volume Total (Vendas)</span>
            <FileText size={14}/>
          </div>
          <div className="text-lg font-bold text-gray-800">{formatCurrency(totalSold)}</div>
        </div>
      </div>

      <div className="bg-white border rounded p-2">
        <h3 className="font-bold text-xs mb-2 text-gray-600 border-b pb-1">TOP PRODUTOS ({filter === 'today' ? 'Hoje' : 'Geral'})</h3>
        {bestSellers.map(([name, qty], i) => (
          <div key={name} className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0">
            <span>{i+1}. {name}</span>
            <span className="font-mono bg-gray-100 px-1 rounded">{qty}</span>
          </div>
        ))}
        {bestSellers.length === 0 && <div className="text-xs text-gray-400 text-center py-2">Sem vendas no período.</div>}
      </div>

      <div className="bg-white border rounded p-2">
         <h3 className="font-bold text-xs mb-2 text-gray-600 border-b pb-1">STATUS DOS PEDIDOS</h3>
         <div className="space-y-1">
            <div className="flex justify-between text-xs">
               <span className="text-red-500 font-bold">Pendentes</span>
               <span>{filteredSales.filter(s => s.status === 'Pendente').length}</span>
            </div>
            <div className="flex justify-between text-xs">
               <span className="text-blue-500 font-bold">Em Rota</span>
               <span>{filteredSales.filter(s => s.status === 'Rota').length}</span>
            </div>
            <div className="flex justify-between text-xs">
               <span className="text-green-500 font-bold">Concluídos</span>
               <span>{filteredSales.filter(s => s.status === 'Entregue').length}</span>
            </div>
         </div>
      </div>
    </div>
  );
}

// --- DRIVER VIEW (MOBILE) ---
function DriverView({ data, onExit }) {
  if (!data) return <div className="p-10 text-center">Link expirado ou inválido.</div>;

  const handleAction = (order, type) => {
    const cleanPhone = (p) => p.replace(/\D/g, '');
    let text = '';
    let url = '';

    if (type === 'going') {
      text = `Olá ${order.customer}, seu pedido saiu para entrega e está chegando! 🛵`;
      url = `https://wa.me/55${cleanPhone(order.phone)}?text=${encodeURIComponent(text)}`;
    } else if (type === 'arrived') {
      text = `Olá ${order.customer}, o entregador chegou! 📍`;
      url = `https://wa.me/55${cleanPhone(order.phone)}?text=${encodeURIComponent(text)}`;
    } else if (type === 'confirm') {
      if (!data.companyPhone) return alert("Telefone da empresa não configurado.");
      text = `✅ BAIXA DE ENTREGA\n\nCliente: ${order.customer}\nValor: ${formatCurrency(order.total)}\nPgto: ${order.pay}${order.change > 0 ? ` (Troco R$${order.change})` : ''}\nStatus: ENTREGUE`;
      url = `https://wa.me/55${cleanPhone(data.companyPhone)}?text=${encodeURIComponent(text)}`;
    }

    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-100 pb-12 font-sans">
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md flex justify-between items-center">
        <div>
           <h1 className="font-bold text-lg leading-none">{data.route}</h1>
           <div className="text-[10px] text-gray-400 mt-1">{data.orders.length} Entregas</div>
        </div>
        <button onClick={onExit} className="bg-slate-700 text-xs px-3 py-2 rounded border border-slate-600">Sair</button>
      </div>

      <div className="p-4 space-y-6">
        {data.orders.map((order, idx) => (
          <div key={order.id} className="bg-white rounded-xl shadow-sm border overflow-hidden relative">
            <div className="absolute top-0 left-0 bg-slate-900 text-white px-3 py-1 text-sm font-bold rounded-br-lg">
              #{idx + 1}
            </div>
            
            <div className="p-4 pt-8">
              <div className="flex justify-between items-start">
                 <h2 className="text-xl font-bold text-gray-800">{order.customer}</h2>
                 <div className="text-right">
                   <div className="font-bold text-green-700 text-lg">{formatCurrency(order.total)}</div>
                   <div className="text-[10px] bg-gray-100 px-1 rounded text-gray-600 uppercase">{order.pay}</div>
                 </div>
              </div>
              <p className="text-gray-600 text-sm mt-1">{order.address}</p>
              
              {order.change > 0 && (
                <div className="mt-2 bg-red-100 text-red-800 p-2 rounded text-center font-bold border border-red-200 animate-pulse">
                   🚨 LEVAR TROCO: {formatCurrency(order.change)}
                </div>
              )}

              {order.obs && (
                <div className="mt-2 bg-yellow-100 text-yellow-800 p-2 rounded text-xs font-bold border border-yellow-200 flex gap-2 items-center">
                   <AlertTriangle size={16}/> {order.obs}
                </div>
              )}

              <div className="mt-3 bg-gray-50 p-2 rounded text-xs text-gray-600 border border-gray-100">
                {order.items.join(' + ')}
              </div>
            </div>

            {/* ACTION GRID */}
            <div className="grid grid-cols-4 border-t divide-x bg-gray-50">
              {order.map && (
                 <a href={order.map} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center py-3 hover:bg-gray-200">
                   <Navigation size={20} className="text-blue-600 mb-1"/>
                   <span className="text-[10px] font-bold text-blue-800">MAPA</span>
                 </a>
              )}
              <button onClick={() => handleAction(order, 'going')} className="flex flex-col items-center justify-center py-3 hover:bg-gray-200">
                <Truck size={20} className="text-orange-500 mb-1"/>
                <span className="text-[10px] font-bold text-orange-700">INDO</span>
              </button>
              <button onClick={() => handleAction(order, 'arrived')} className="flex flex-col items-center justify-center py-3 hover:bg-gray-200">
                <MapPin size={20} className="text-purple-600 mb-1"/>
                <span className="text-[10px] font-bold text-purple-800">AQUI</span>
              </button>
              <button onClick={() => handleAction(order, 'confirm')} className="flex flex-col items-center justify-center py-3 hover:bg-green-100 bg-green-50">
                <CheckCircle size={20} className="text-green-600 mb-1"/>
                <span className="text-[10px] font-bold text-green-800">OK</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

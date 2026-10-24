import type {BasketTemplate,Product,ProductType} from '../../../core/model';
import type {ExtraGroup} from '../../../core/extras';
import type {AvailableAdminSection} from '../../navigation';
import {AdminIcon} from '../../shell/AdminIcon';

interface Props {
  products:readonly Product[];
  types:readonly ProductType[];
  baskets:readonly BasketTemplate[];
  extras:readonly ExtraGroup[];
  onNavigate:(id:AvailableAdminSection)=>void;
}
export function HomeDashboard({products,types,baskets,extras,onNavigate}:Props){
  const checks=[
    {title:'Conferir produtos',detail:'Revise SKUs, estoque e preços antes de disponibilizar para venda.',id:'produtos' as const},
    {title:'Definir tipos de produto',detail:'Cadastre arroz, feijão, óleo e as marcas permitidas.',id:'tipos' as const},
    {title:'Montar as cinco cestas',detail:'Configure os tipos, as quantidades e o valor interno.',id:'cestas' as const},
    {title:'Organizar produtos extras',detail:'Escolha os grupos exibidos após a personalização.',id:'extras' as const}
  ];
  return <div className="da-dashboard">
    <div className="da-welcome">
      <div><span className="da-welcome-eyebrow">PAINEL DE CONTROLE</span><h2>Sua loja, mais fácil de administrar.</h2>
      <p>Configure a vitrine com poucos passos. Esta prévia usa apenas dados demonstrativos.</p>
      <button type="button" className="da-primary-action" onClick={()=>onNavigate('cestas')}>Configurar cestas <AdminIcon name="arrow" size={17}/></button></div>
      <span className="da-welcome-shape" aria-hidden="true"><AdminIcon name="basket" size={72}/></span>
    </div>
    <div className="da-dashboard-stats">
      <div><span>Produtos de exemplo</span><strong>{products.length}</strong><small>Cadastro independente por SKU</small></div>
      <div><span>Tipos de produto</span><strong>{types.length}</strong><small>Opções de substituição</small></div>
      <div><span>Tamanhos de cesta</span><strong>{baskets.length}</strong><small>Composição individual</small></div>
      <div><span>Grupos de extras</span><strong>{extras.filter(item=>item.active).length}</strong><small>Opcionais para todas as cestas</small></div>
    </div>
    <section className="da-dashboard-tasks panel"><div className="da-list-heading"><h2>Configurar a vitrine</h2><span>Atalhos de trabalho</span></div>
      <p>Siga uma ordem simples para cadastrar e organizar os itens da loja.</p>
      <div className="da-task-list">
        {checks.map((item,index)=><button type="button" key={item.id} onClick={()=>onNavigate(item.id)}>
          <span className="da-task-number">{index+1}</span><span className="da-task-text"><b>{item.title}</b><small>{item.detail}</small></span><AdminIcon name="chevron" size={19}/>
        </button>)}
      </div>
    </section>
    <div className="da-dashboard-footer">Os dados apresentados são de demonstração. Pedidos, clientes e integrações serão habilitados em futuras etapas.</div>
  </div>;
}

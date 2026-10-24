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

const SETUP_TASKS=[
  {title:'Revisar cadastro de produtos',detail:'SKUs, preços, estoque e visibilidade.',id:'produtos'},
  {title:'Configurar tipos de produto',detail:'Arroz, feijão, óleo e produtos equivalentes.',id:'tipos'},
  {title:'Definir as composições das cestas',detail:'Quantidades e valor interno de cada tamanho.',id:'cestas'},
  {title:'Organizar produtos extras',detail:'Itens opcionais de todas as cestas.',id:'extras'}
] as const;

export function HomeDashboard({products,types,baskets,extras,onNavigate}:Props){
  const metrics=[
    {label:'Produtos cadastrados',value:products.length,detail:'Exemplos em memória'},
    {label:'Tipos de produto',value:types.length,detail:'Grupos de substituição'},
    {label:'Tamanhos de cesta',value:baskets.length,detail:'Modelos configuráveis'},
    {label:'Grupos extras',value:extras.filter(group=>group.active).length,detail:'Opcionais ativos'}
  ];
  return <div className="da-dashboard">
    <section className="da-setup-overview">
      <div>
        <p className="da-overline">CONFIGURAÇÃO DA VITRINE</p>
        <h2>Organize os produtos e as cestas.</h2>
        <p>Centralize as tarefas da loja em um painel simples. Nesta prévia, as alterações não são salvas no banco.</p>
      </div>
      <button type="button" className="da-primary-action" onClick={()=>onNavigate('cestas')}>
        Configurar cestas <AdminIcon name="arrow" size={16}/>
      </button>
    </section>

    <section className="da-dashboard-stats" aria-label="Resumo da configuração demonstrativa">
      {metrics.map(metric=><div key={metric.label} className="da-metric">
        <span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small>
      </div>)}
    </section>

    <div className="da-dashboard-work">
      <section className="da-dashboard-tasks panel">
        <div className="da-list-heading"><h2>Configurar catálogo e cestas</h2><span>4 etapas</span></div>
        <p>As tarefas abaixo já podem ser testadas com dados demonstrativos.</p>
        <div className="da-task-list">
          {SETUP_TASKS.map((item,index)=><button type="button" key={item.id} onClick={()=>onNavigate(item.id)}>
            <span className="da-task-number">{index+1}</span>
            <span className="da-task-text"><b>{item.title}</b><small>{item.detail}</small></span>
            <AdminIcon name="chevron" size={17}/>
          </button>)}
        </div>
      </section>

      <section className="da-operational-panel panel">
        <div className="da-list-heading"><h2>Próximos módulos</h2><span>Planejamento</span></div>
        <p>As novas ferramentas aparecerão aqui quando estiverem implementadas e testadas.</p>
        <div className="da-operational-list">
          <div><AdminIcon name="orders"/><span><b>Pedidos</b><small>Novo · Em separação · Pronto · Entregue</small></span><em>Planejado</em></div>
          <div><AdminIcon name="users"/><span><b>Atendimento</b><small>Conversas de WhatsApp e pedidos vinculados</small></span><em>Planejado</em></div>
          <div><AdminIcon name="megaphone"/><span><b>Avisos de andamento</b><small>Templates utilitários pela Meta</small></span><em>Planejado</em></div>
          <div><AdminIcon name="plug"/><span><b>Notas fiscais</b><small>Emissão após separação pelo Bling</small></span><em>Planejado</em></div>
        </div>
      </section>
    </div>
    <p className="da-dashboard-footer">Ambiente exclusivo de demonstração. Nenhum pedido é enviado, nenhuma nota é emitida e nenhum cliente é contatado.</p>
  </div>;
}

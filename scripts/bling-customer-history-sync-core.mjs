const text=v=>String(v??'').trim();
export const digits=v=>String(v??'').replace(/\D/g,'');
export const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};

export function normalizePhoneBR(value){
  let d=digits(value);
  if(!d)return null;
  if(d.startsWith('55')&&(d.length===12||d.length===13))return `+${d}`;
  if(d.length===10||d.length===11)return `+55${d}`;
  return null;
}

export function historyWindow(days=90,now=new Date()){
  const safe=Math.max(1,Math.min(3650,Number.parseInt(String(days),10)||90));
  const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
  const start=new Date(end.getTime()-(safe-1)*86400000);
  const iso=d=>d.toISOString().slice(0,10);
  return {start:iso(start),end:iso(end)};
}

function addressSource(contact){
  const e=contact?.endereco||{};
  return e?.geral||e?.principal||e?.cobranca||e||{};
}

export function mapBlingContact(contact={}){
  const a=addressSource(contact);
  const email=text(contact.email||contact.emailNfe||contact.emailNotaFiscal).toLowerCase();
  return {
    bling_contact_id:Number(contact.id)||null,
    name:text(contact.nome||contact.fantasia||contact.razaoSocial),
    cpf_cnpj:digits(contact.numeroDocumento||contact.cpfCnpj||contact.cpf||contact.cnpj)||null,
    phone_e164:normalizePhoneBR(contact.celular||contact.telefone||contact.fone||contact.whatsapp),
    email:email||null,
    address:{
      label:'Principal',
      street:text(a.endereco||a.logradouro||a.rua)||null,
      number:text(a.numero)||null,
      complement:text(a.complemento)||null,
      neighborhood:text(a.bairro)||null,
      city:text(a.municipio||a.cidade)||null,
      state:text(a.uf||a.estado).toUpperCase().slice(0,2)||null,
      postal_code:digits(a.cep)||null,
      reference:text(a.referencia||a.pontoReferencia)||null
    },
    raw:contact
  };
}

function saleItems(source={}){
  const rows=Array.isArray(source.itens)?source.itens:Array.isArray(source.items)?source.items:[];
  return rows.map((item,index)=>{
    const product=item.produto||item.product||{};
    const quantity=num(item.quantidade??item.quantity);
    const unit=num(item.valor??item.preco??item.unitPrice??item.valorUnitario);
    return {
      item_index:index,
      bling_product_id:Number(product.id||item.idProduto)||null,
      sku:text(item.codigo||product.codigo||item.sku)||null,
      name:text(item.descricao||product.nome||item.nome)||`Item ${index+1}`,
      quantity,
      unit_price:unit,
      line_total:Number((quantity*unit).toFixed(2)),
      raw:item
    };
  });
}

export function mapBlingSale(source={}){
  const situation=source.situacao||source.status||{};
  const contact=source.contato||source.customer||{};
  const store=source.loja||source.store||{};
  return {
    bling_order_id:Number(source.id)||null,
    bling_contact_id:Number(contact.id||source.idContato)||null,
    order_number:text(source.numero||source.numeroPedido)||null,
    order_date:text(source.data||source.dataEmissao||source.dataVenda).slice(0,10)||null,
    status_id:Number(situation.id)||null,
    status_name:text(situation.valor||situation.nome||situation.descricao)||null,
    total:num(source.total),
    discount:num(source.desconto?.valor??source.desconto),
    other_expenses:num(source.outrasDespesas??source.outras_despesas),
    store_id:Number(store.id)||null,
    store_order_number:text(source.numeroLoja||source.numeroPedidoLoja)||null,
    items:saleItems(source),
    raw:source
  };
}

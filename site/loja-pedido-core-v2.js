'use strict';

    function buildOrder(form){
      const pricing=cartPricing(),data={};
      new FormData(form).forEach((value,key)=>{data[key]=value});
      const cpf=String(data.cpf||'').replace(/\D/g,''),phone=cleanPhone(data.phone);
      if(!text(data.name))throw new Error('Informe o nome completo.');
      if(cpf.length!==11)throw new Error('Informe um CPF válido.');
      if(phone.length!==11)throw new Error('Informe um WhatsApp válido com DDD.');
      if(!text(data.neighborhood))throw new Error('Informe o bairro.');
      if(pricing.total<CONFIG.MIN_ORDER)throw new Error(`O pedido mínimo é ${money(CONFIG.MIN_ORDER)}.`);
      const number=orderNumber(),id=`site-${number}-${Math.random().toString(36).slice(2,7)}`,payment=paymentName(data.payment);
      const items=pricing.lines.map(line=>({
        firebaseKey:line.product.firebaseKey,produtoId:line.product.id,sku:line.product.codigo,codigo:line.product.codigo,
        identificadores:{id:line.product.id,firebaseKey:line.product.firebaseKey,sku:line.product.codigo,gtin:line.product.gtin||line.product.ean||'',ean:line.product.ean||line.product.gtin||''},
        nome:line.product.name,qtd:line.qty,quantidade:line.qty,price:line.effectiveUnit,preco:line.effectiveUnit,
        precoTabela:line.product.price,total:line.total,gtin:line.product.gtin||line.product.ean||'',ean:line.product.ean||line.product.gtin||'',
        url_imagem:line.product.image,gondola:line.product.gondola||'Z-Sem Gôndola',prateleira:line.product.shelf||'-',localizacao:line.product.location||'',
        categoria:line.product.category||'',subcategoria:line.product.subcategory||'',subsubcategoria:line.product.subsubcategory||'',marca:line.product.brand||'',embalagem:line.product.package||''
      }));
      const totalProducts=round(items.reduce((sum,item)=>sum+item.precoTabela*item.qtd,0));
      const difference=round(pricing.total-totalProducts);
      const client={
        nome:text(data.name),cpf,telefone:phone,telefoneFormatado:formatPhone(phone),celular:phone,email:text(data.email),
        cep:String(data.cep||'').replace(/\D/g,''),cepFormatado:formatCep(data.cep),cidade:text(data.city),uf:'MT',
        bairro:text(data.neighborhood),rua:text(data.street),quadra:text(data.block),casa:text(data.house),numero:text(data.house),
        complemento:[data.block?`Quadra ${text(data.block)}`:'',text(data.reference)].filter(Boolean).join('. '),
        frente:text(data.reference),pagamento:payment,pagamentoCodigo:data.payment,pagamentoIdBling:'',agendamento:data.date
      };
      const payload={pedido:{
        id,numero:number,idempotencyKey:id,
        metadados:{appVersion:CONFIG.BUILD,pedidoCriadoEm:new Date().toISOString(),catalogoCarregadoEm:new Date(state.catalogLoadedAt).toISOString(),catalogoFonte:state.catalogSource,catalogoModo:'compacto-unico',catalogVerified:false},
        itens:items,total:pricing.total,totalProdutos,outrasDespesasBling:difference>0?difference:0,descontoBling:difference<0?Math.abs(difference):0,desconto:pricing.discount,
        cupom:pricing.coupon&&pricing.eligibility.ok?{codigo:pricing.coupon.codigo,tipo:pricing.coupon.tipo,percentual:num(pricing.coupon.desconto),valorDesconto:pricing.couponDiscount,itensParticipantes:pricing.participatingItems}:null,
        kitPromocional:pricing.bundles.adjustment<0?{valorDesconto:Math.abs(pricing.bundles.adjustment)}:null,
        atacado:pricing.wholesaleDiscount?{percentual:CONFIG.WHOLESALE_RATE*100,quantidadeMinima:CONFIG.WHOLESALE_QTY,valorDesconto:pricing.wholesaleDiscount}:null,
        validadeQuantidade:pricing.expiryBulkDiscount?{percentual:CONFIG.EXPIRY_BULK_RATE*100,quantidadeMinima:CONFIG.WHOLESALE_QTY,diasMaximos:39,valorDesconto:pricing.expiryBulkDiscount}:null,
        observacoes:pricing.bundles.activeBundles.length?'Pedido com Cesta/Kit':'Pedido Comum',cliente:client
      }};
      return {payload,pricing,client,number};
    }

    function orderMessage(order){
      const {pricing,client,number}=order,lines=pricing.lines.map(line=>`${line.qty}x ${line.product.name}`).join('\n');
      const discounts=[
        pricing.couponDiscount?`🏷️ Cupom: − ${money(pricing.couponDiscount)}`:'',
        pricing.bundles.adjustment<0?`🎁 Desconto de cesta/kit: − ${money(Math.abs(pricing.bundles.adjustment))}`:'',
        pricing.expiryBulkDiscount?`⏳ Validade + quantidade: − ${money(pricing.expiryBulkDiscount)}`:'',
        pricing.wholesaleDiscount?`📦 3 ou mais unidades: − ${money(pricing.wholesaleDiscount)}`:''
      ].filter(Boolean).join('\n');
      return `*PEDIDO #${number}*\n*ENTREGA:* ${formatDate(client.agendamento)}\n------------------------------\n*ITENS SELECIONADOS*\n${lines}\n------------------------------\nValor normal: ${money(pricing.subtotal)}${discounts?`\n${discounts}`:''}\n💰 *TOTAL FINAL:* ${money(pricing.total)}\n------------------------------\n*DADOS PARA ATENDIMENTO*\nNome: ${client.nome}\nWhatsApp: ${client.telefoneFormatado}\nCidade: ${client.cidade}/MT\nBairro: ${client.bairro}${client.rua?`\nRua: ${client.rua}`:''}${client.quadra?`\nQuadra: ${client.quadra}`:''}${client.casa?`\nNº: ${client.casa}`:''}${client.frente?`\nReferência: ${client.frente}`:''}\nPagamento: ${client.pagamento}\n------------------------------\nOlá! Gostaria de confirmar este pedido e o endereço de entrega.`;
    }

    function openWhatsApp(message){
      const mobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const url=`${mobile?'https://api.whatsapp.com/send':'https://web.whatsapp.com/send'}?phone=${CONFIG.WHATSAPP}&text=${encodeURIComponent(message)}`;
      const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';document.body.appendChild(link);link.click();link.remove();
    }

    function buildFirebaseOrder(makePayload){
      const pedido=makePayload&&makePayload.pedido?makePayload.pedido:{},cliente=pedido.cliente||{},nowIso=new Date().toISOString();
      const itens=(Array.isArray(pedido.itens)?pedido.itens:[]).map(item=>({
        produtoId:String(item.produtoId||item.identificadores&&item.identificadores.id||''),
        firebaseKey:String(item.firebaseKey||item.identificadores&&item.identificadores.firebaseKey||''),
        sku:String(item.sku||item.codigo||''),codigo:String(item.codigo||item.sku||''),
        identificadores:item.identificadores||{id:String(item.produtoId||''),firebaseKey:String(item.firebaseKey||''),sku:String(item.sku||''),gtin:String(item.gtin||item.ean||''),ean:String(item.ean||item.gtin||'')},
        nome:String(item.nome||''),quantidade:Number(item.qtd||item.quantidade||0),preco_unitario:Number(item.price||item.preco||0),
        subtotal:round(Number(item.qtd||item.quantidade||0)*Number(item.price||item.preco||0)),gtin:String(item.gtin||item.ean||''),ean:String(item.ean||item.gtin||''),
        url_imagem:String(item.url_imagem||CONFIG.LOGO),gondola:String(item.gondola||'Z-Sem Gôndola'),prateleira:String(item.prateleira||'-'),localizacao:String(item.localizacao||''),
        categoria:String(item.categoria||''),subcategoria:String(item.subcategoria||''),subsubcategoria:String(item.subsubcategoria||''),marca:String(item.marca||''),embalagem:String(item.embalagem||''),
        status_separacao:'pendente',quantidade_separada:0,separado_em:'',separador:''
      }));
      const address=[cliente.rua,cliente.numero||cliente.casa,cliente.quadra?`Quadra ${cliente.quadra}`:'',cliente.bairro,[cliente.cidade,cliente.uf||'MT'].filter(Boolean).join('/'),cliente.cepFormatado?`CEP ${cliente.cepFormatado}`:''].filter(Boolean).join(', ');
      return {
        id:String(pedido.id||''),numero_pedido:String(pedido.numero||pedido.id||''),idempotency_key:String(pedido.idempotencyKey||pedido.id||''),origem:'site',metadados:pedido.metadados||{},
        status:'recebido',status_separacao:'pendente',criado_em:nowIso,atualizado_em:nowIso,
        link_pedido:`${CONFIG.SITE_URL}/pedido.html?id=${encodeURIComponent(String(pedido.id||''))}`,firebase_path:`/pedidos/${String(pedido.id||'')}`,
        mini_site_interno:`${CONFIG.SITE_URL}/pedidos.html?id=${encodeURIComponent(String(pedido.id||''))}`,
        separacao:{status:'pendente',iniciado_em:'',finalizado_em:'',separador:'',total_itens:itens.length,itens_separados:0,itens_pendentes:itens.length,observacoes_internas:''},
        bling:{status:'aguardando_make',id_contato:'',id_pedido_venda:'',numero_pedido_bling:''},
        integracao:{whatsapp:'aberto',firebase:'salvo_pelo_site',make:'pendente',criado_pelo_site_em:nowIso},
        cliente:{nome:String(cliente.nome||'Cliente Site'),cpf:String(cliente.cpf||''),telefone:String(cliente.telefone||''),telefoneFormatado:String(cliente.telefoneFormatado||''),celular:String(cliente.celular||cliente.telefone||''),email:String(cliente.email||'')},
        entrega:{agendamento:String(cliente.agendamento||''),cep:String(cliente.cep||''),cepFormatado:String(cliente.cepFormatado||''),cidade:String(cliente.cidade||''),uf:String(cliente.uf||'MT'),bairro:String(cliente.bairro||''),rua:String(cliente.rua||''),numero:String(cliente.numero||cliente.casa||''),casa:String(cliente.casa||''),quadra:String(cliente.quadra||''),complemento:String(cliente.complemento||''),frente:String(cliente.frente||''),endereco_completo:address},
        pagamento:{forma:String(cliente.pagamento||''),codigo:String(cliente.pagamentoCodigo||''),total:Number(pedido.total||0),totalProdutos:Number(pedido.totalProdutos||0),desconto:Number(pedido.desconto||0),outrasDespesasBling:Number(pedido.outrasDespesasBling||0),descontoBling:Number(pedido.descontoBling||0),total_texto:money(Number(pedido.total||0))},
        cupom:pedido.cupom||null,kitPromocional:pedido.kitPromocional||null,atacado:pedido.atacado||null,validadeQuantidade:pedido.validadeQuantidade||null,observacoes:String(pedido.observacoes||''),itens,
        envio:{status:'aguardando_separacao',entregador:'',saiu_em:'',entregue_em:'',tentativas:[],observacoes:''},
        historico:[{data:nowIso,acao:'pedido_recebido_site',usuario:'site',observacao:'Pedido salvo diretamente pelo site antes do processamento do Make/Bling.'}],
        controle:{pedido_original_site:true,bloquear_alteracao_por_whatsapp:true,aguardando_processamento_make:true,observacao_interna:'WhatsApp é o canal prioritário. O pedido foi preservado no Firebase e aguarda integração secundária com Make/Bling.'}
      };
    }

    function normalizeQueueEntry(item){
      const makePayload=item&&item.makePayload||item&&item.payload||null;
      const id=String(item&&item.id||makePayload&&makePayload.pedido&&makePayload.pedido.id||'');
      if(!id||!makePayload)return null;
      return {
        id,makePayload,firebaseOrder:item.firebaseOrder||buildFirebaseOrder(makePayload),
        createdAt:Number(item.createdAt||Date.now()),updatedAt:Number(item.updatedAt||Date.now()),
        firebaseStatus:item.firebaseStatus||(item.firebaseDone?'sent':'pending'),makeStatus:item.makeStatus||(item.makeDone?'sent':'pending'),
        makeAttempts:Number(item.makeAttempts||0),lastMakeAttemptAt:Number(item.lastMakeAttemptAt||0),lastError:String(item.lastError||'')
      };
    }

    function readOrderQueue(){
      const raw=readLocal(CONFIG.ORDER_QUEUE_KEY,[]);
      return (Array.isArray(raw)?raw:[]).map(normalizeQueueEntry).filter(Boolean);
    }

    function writeOrderQueue(queue){
      writeLocal(CONFIG.ORDER_QUEUE_KEY,(Array.isArray(queue)?queue:[]).map(normalizeQueueEntry).filter(Boolean).slice(-20));
    }

    function updateQueueEntry(id,changes){
      const queue=readOrderQueue(),index=queue.findIndex(item=>item.id===String(id));
      if(index<0)return null;
      queue[index]=Object.assign({},queue[index],changes||{},{updatedAt:Date.now()});writeOrderQueue(queue);return queue[index];
    }

    function removeQueueEntry(id){writeOrderQueue(readOrderQueue().filter(item=>item.id!==String(id)))}

    function enqueueOrder(payload){
      const queue=readOrderQueue(),id=String(payload&&payload.pedido&&payload.pedido.id||'');if(!id)return null;
      const index=queue.findIndex(item=>item.id===id),current=index>=0?queue[index]:null;
      const entry={id,makePayload:payload,firebaseOrder:buildFirebaseOrder(payload),createdAt:current?current.createdAt:Date.now(),updatedAt:Date.now(),firebaseStatus:current?current.firebaseStatus:'pending',makeStatus:current?current.makeStatus:'pending',makeAttempts:current?current.makeAttempts:0,lastMakeAttemptAt:current?current.lastMakeAttemptAt:0,lastError:''};
      if(index>=0)queue[index]=entry;else queue.push(entry);writeOrderQueue(queue);return entry;
    }

    async function fetchWithTimeout(url,options,timeoutMs){
      const controller='AbortController'in window?new AbortController():null,timer=controller?setTimeout(()=>controller.abort(),timeoutMs||8000):null;
      try{return await fetch(url,Object.assign({},options||{},controller?{signal:controller.signal}:{}))}finally{if(timer)clearTimeout(timer)}
    }

    async function readFirebaseOrder(id){
      try{const response=await fetchWithTimeout(`${CONFIG.FIREBASE_ORDERS_BASE}/${encodeURIComponent(String(id))}.json`,{method:'GET',cache:'no-store'},6000);return response.ok?await response.json():null}catch(_){return null}
    }

    function firebaseOrderHasBling(order){return Boolean(order&&order.bling&&(order.bling.id_pedido_venda||order.bling.numero_pedido_bling))}

    async function processOrderQueue(targetId=''){
      if(!navigator.onLine||processOrderQueue.running)return;processOrderQueue.running=true;
      try{
        const queue=readOrderQueue().sort((a,b)=>targetId?(a.id===targetId?-1:b.id===targetId?1:a.createdAt-b.createdAt):a.createdAt-b.createdAt);
        for(const snapshot of queue.slice(0,4)){
          let item=readOrderQueue().find(entry=>entry.id===snapshot.id);if(!item)continue;
          if(item.makeStatus==='sent'&&item.firebaseStatus!=='sent'){
            const existing=await readFirebaseOrder(item.id);if(existing)updateQueueEntry(item.id,{firebaseStatus:'sent',lastError:''});
          }
          item=readOrderQueue().find(entry=>entry.id===snapshot.id);if(!item)continue;
          if(item.firebaseStatus!=='sent'){
            try{
              const response=await fetchWithTimeout(`${CONFIG.FIREBASE_ORDERS_BASE}/${encodeURIComponent(item.id)}.json`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.firebaseOrder),keepalive:true},8000);
              if(!response.ok)throw new Error(`Firebase respondeu ${response.status}`);
              updateQueueEntry(item.id,{firebaseStatus:'sent',lastError:''});
            }catch(error){updateQueueEntry(item.id,{firebaseStatus:'pending',lastError:error&&error.message||'Falha ao salvar no Firebase'})}
          }
          item=readOrderQueue().find(entry=>entry.id===snapshot.id);if(!item)continue;
          if(item.makeStatus!=='sent'){
            const now=Date.now();
            if(item.makeAttempts>0){
              const existing=await readFirebaseOrder(item.id);
              if(firebaseOrderHasBling(existing)){updateQueueEntry(item.id,{firebaseStatus:'sent',makeStatus:'sent',lastError:''});item=readOrderQueue().find(entry=>entry.id===snapshot.id)}
              else if(item.lastMakeAttemptAt&&now-item.lastMakeAttemptAt<10*60*1000)continue;
            }
            if(item&&item.makeStatus!=='sent'){
              updateQueueEntry(item.id,{makeStatus:'sending',makeAttempts:item.makeAttempts+1,lastMakeAttemptAt:now,lastError:''});
              try{
                const response=await fetchWithTimeout(CONFIG.MAKE_ORDER_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.makePayload),keepalive:true},12000);
                if(!response.ok)throw new Error(`Make respondeu ${response.status}`);
                updateQueueEntry(item.id,{makeStatus:'sent',lastError:''});
              }catch(error){updateQueueEntry(item.id,{makeStatus:'pending',lastError:error&&error.message||'Falha ao enviar ao Make'})}
            }
          }
          item=readOrderQueue().find(entry=>entry.id===snapshot.id);if(item&&item.firebaseStatus==='sent'&&item.makeStatus==='sent')removeQueueEntry(item.id);
        }
      }finally{processOrderQueue.running=false}
    }

    async function verifySelectedProducts(payload){
      const keys=Array.from(new Set(payload.pedido.itens.map(item=>item.firebaseKey).filter(Boolean)));
      const verified=[];
      await Promise.all(keys.map(async key=>{
        try{
          const response=await fetch(`${CONFIG.FIREBASE_PRODUCT_BASE}/${encodeURIComponent(key)}.json`,{cache:'no-store'});
          if(response.ok&&await response.json())verified.push(key);
        }catch(_){}
      }));
      return verified.length===keys.length;
    }

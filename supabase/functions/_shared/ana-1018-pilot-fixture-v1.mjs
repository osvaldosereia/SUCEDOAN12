// Configuração sintética de homologação do canal 1018. NÃO publicar nem enviar.
export const pilot1018={
  behavior:{tone:'cordial',conciseness:'short',emoji:'sparingly',use_known_first_name_on_first_greeting:false},
  knowledge:[
    {key:'catalogo',title:'Catálogo e pedidos',status:'published',content:'Os pedidos são realizados pelo catálogo oficial da Dona Antônia. Não finalize pedidos nem colete CPF ou endereço pelo chat. Não prometa preço ou estoque sem consulta ao sistema.'},
    {key:'entrega',title:'Área de atendimento',status:'published',content:'A Dona Antônia atende Cuiabá e Várzea Grande. O pedido mínimo do site é R$ 75. Pedidos após 12h entram para entrega no próximo dia operacional; domingos e feriados nacionais não há operação. Datas concretas precisam ser verificadas no sistema.'},
    {key:'pagamento',title:'Pagamento',status:'published',content:'O pagamento é realizado na entrega, por PIX, dinheiro, cartão de crédito ou alimentação/refeição conforme disponibilidade. Não oferecer fiado, boleto ou pagamento em 30 dias.'},
    {key:'cestas',title:'Cestas básicas',status:'published',content:'O cliente pode consultar a composição e alterar produtos no catálogo. Não revele valores internos ocultos das cestas, custos ou diferenças de composição.'},
    {key:'humano',title:'Atendimento humano',status:'published',content:'Se o cliente pedir uma pessoa, respeite a transferência para atendimento humano. Não continue respondendo automaticamente durante o atendimento humano.'}
  ],
  triggers:[
    {key:'humano',enabled:true,priority:100,channels:['1018'],match:'phrase',phrases:['quero falar com atendente','quero falar com uma pessoa','atendimento humano','falar com humano','preciso de atendente'],actions:[{type:'handoff'}]},
    {key:'pedido',enabled:true,priority:90,channels:['1018'],match:'phrase',phrases:['fazer pedido','quero comprar','como comprar','comprar cesta','fazer uma compra'],actions:[{type:'fixed_reply',response_text:'Você pode montar seu pedido no catálogo: https://donaantonia.com.br/'}]},
    {key:'alterar',enabled:true,priority:95,channels:['1018'],match:'phrase',phrases:['alterar meu pedido','mudar meu pedido','cancelar meu pedido','preciso alterar o pedido'],actions:[{type:'handoff'}]},
    {key:'status',enabled:true,priority:95,channels:['1018'],match:'phrase',phrases:['meu pedido','status do pedido','quando entrega','onde esta meu pedido'],actions:[{type:'handoff'}]},
    {key:'preco',enabled:true,priority:85,channels:['1018'],match:'phrase',phrases:['quanto custa','qual o valor','tem em estoque','tem disponivel'],actions:[{type:'fixed_reply',response_text:'Confira os preços e a disponibilidade atualizados no catálogo: https://donaantonia.com.br/'}]}
  ],
  test_cases:[
    {key:'humano',input:'Quero falar com atendente',channel:'1018',expected:'handoff'},
    {key:'compra',input:'Como comprar uma cesta?',channel:'1018',expected:'reply'},
    {key:'alterar',input:'Preciso alterar o pedido',channel:'1018',expected:'handoff'},
    {key:'status',input:'Quando entrega meu pedido?',channel:'1018',expected:'handoff'},
    {key:'preco',input:'Quanto custa?',channel:'1018',expected:'reply'}
  ]
};

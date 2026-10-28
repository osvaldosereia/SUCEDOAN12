// Immutable post-order follow-up templates. No customer/order data is exposed
// in Meta template definitions; only the approved URL suffix is supplied at send time.
const EXAMPLE_CAPABILITY='0123456789abcdef'.repeat(4);

export function buildPostorderOffersTemplate(channel){
  if(!['0975','1018'].includes(String(channel)))throw Error('invalid_channel');
  return {
    name:'pedidoofertas'+channel+'v1',
    language:'pt_BR',
    category:'MARKETING',
    components:[
      {type:'BODY',text:'🛍️ Quer acrescentar mais produtos?\nAproveite nossas ofertas e inclua tudo no mesmo pedido! 👇'},
      {type:'BUTTONS',buttons:[
        {type:'URL',text:'Ver ofertas',url:'https://donaantonia.com.br/ofertas/?c={{1}}',example:[EXAMPLE_CAPABILITY]}
      ]}
    ]
  };
}

export function buildPostorderConfirmTemplate(channel){
  if(!['0975','1018'].includes(String(channel)))throw Error('invalid_channel');
  return {
    name:'pedidoconfirmacao'+channel+'v1',
    language:'pt_BR',
    category:'UTILITY',
    components:[
      {type:'BODY',text:'✅ Pedido #{{1}}\n💰 Total final: {{2}}\nPodemos preparar seu pedido?',
        example:{body_text:[['1234','R$ 205,00']]}},
      {type:'BUTTONS',buttons:[
        {type:'QUICK_REPLY',text:'Confirmar pedido'},
        {type:'QUICK_REPLY',text:'Preciso alterar'}
      ]}
    ]
  };
}
export const postorderFollowupTemplates=['0975','1018'].flatMap(c=>[
  buildPostorderOffersTemplate(c),buildPostorderConfirmTemplate(c)
]);

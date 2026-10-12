// Declarative templates for Meta WhatsApp Cloud API; never send until status APPROVED.
const BODY=[
'🛒 PEDIDO DONA ANTÔNIA',
'',
'📅 Pedido: {{1}}',
'🔢 Número: {{2}}',
'',
'👤 CLIENTE',
'Situação: {{3}}',
'Nome: {{4}}',
'WhatsApp: {{5}}',
'',
'📍 ENTREGA',
'Endereço: {{6}}',
'Bairro: {{7}}',
'Cidade: {{8}}',
'Data: {{9}}',
'',
'🧺 CESTA',
'{{10}}',
'',
'📦 PRODUTOS',
'{{11}}',
'',
'💰 TOTAL: {{12}}',
'💳 PAGAMENTO: {{13}}',
'',
'✅ Recebemos seu pedido. Confira os dados e confirme para liberar a preparação.'
].join('\n');
const EXAMPLES=['12/10/2026','DB068','CADASTRADO','Cliente de exemplo',
  '(65) 99999-9999','Rua Exemplo, 100','Centro','Cuiabá','13/10/2026',
  '1x Cesta Grande','4x Arroz, 2x Açúcar','R$ 402,41','PIX'];
const EXAMPLE_TOKEN='0123456789abcdef'.repeat(4);
export const buildPostorderTemplate=(channel)=>{
 if(!['0975','1018'].includes(String(channel)))throw Error('invalid_channel');
 return {
  name:'pedidoorganizadosite'+channel+'v3',
  language:'pt_BR',
  category:'UTILITY',
  components:[
   {type:'BODY',text:BODY,example:{body_text:[EXAMPLES]}},
   {type:'BUTTONS',buttons:[
    {type:'URL',text:'Ver meu pedido',url:'https://donaantonia.com.br/pedido/?c={{1}}',example:[EXAMPLE_TOKEN]}
   ]}
  ]
 };
};
export const postorderTemplates=['0975','1018'].map(buildPostorderTemplate);

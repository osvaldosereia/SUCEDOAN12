import fs from 'node:fs';

function replaceOnce(text, from, to, label){
  const count=text.split(from).length-1;
  if(count!==1)throw new Error(`${label}: esperado 1 match, encontrado ${count}`);
  return text.replace(from,to);
}

const adminPath='vitrine/admin/index.html';
let admin=fs.readFileSync(adminPath,'utf8');

admin=replaceOnce(
  admin,
  "  function orderIssueShortcut(problems){",
  "  function orderCustomerDataPending(o){\n    const reasons=orderProblemReasons(o);\n    return reasons.some(reason=>['Cliente não identificado','Telefone pendente','Endereço incompleto','CPF/CNPJ pendente'].includes(reason));\n  }\n  function orderIssueShortcut(problems){",
  'admin helper pendencia'
);

admin=replaceOnce(
  admin,
  "  function orderIssueShortcut(problems){\n    if(problems.includes('Endereço incompleto'))return ['address','Corrigir endereço'];",
  "  function orderIssueShortcut(problems){\n    if(problems.includes('Telefone pendente')||problems.includes('CPF/CNPJ pendente'))return ['customer','Completar dados'];\n    if(problems.includes('Endereço incompleto'))return ['address','Corrigir endereço'];",
  'admin atalhos telefone cpf'
);

admin=replaceOnce(
  admin,
  "  function orderRowPrimaryActionHtml(o,problems,shortcut){\n    const next=orderNextAction(o);",
  "  function orderRowPrimaryActionHtml(o,problems,shortcut){\n    const next=orderNextAction(o);\n    if(orderCustomerDataPending(o)){\n      const kind=shortcut?.[0]||'customer';\n      return '<button class=\"row-next-action issue\" type=\"button\" data-order-issue-open=\"'+esc(o.id)+'\" data-order-issue-kind=\"'+esc(kind)+'\">Completar dados do cliente</button>';\n    }",
  'admin bloqueio proxima acao'
);

admin=replaceOnce(
  admin,
  "      '<div><span class=\"row-title\">#'+esc(shortOrder(o.order_number))+'</span>'+(problems.length?'<span class=\"sub\" style=\"color:#b3261e\">'+esc(problems[0])+(problems.length>1?' · +'+(problems.length-1):'')+'</span>':'')+'</div>'+",
  "      '<div><span class=\"row-title\">#'+esc(shortOrder(o.order_number))+'</span>'+(orderCustomerDataPending(o)?'<span class=\"pill danger\" style=\"margin-top:5px\">AGUARDANDO DADOS DO CLIENTE</span>':'')+(problems.length?'<span class=\"sub\" style=\"color:#b3261e\">'+esc(problems[0])+(problems.length>1?' · +'+(problems.length-1):'')+'</span>':'')+'</div>'+",
  'admin destaque lista'
);

admin=replaceOnce(
  admin,
  "    const deliveryProblems=orderProblemReasons(o).some(x=>['Cliente não identificado','Endereço incompleto'].includes(x));",
  "    const deliveryProblems=orderCustomerDataPending(o);",
  'admin abrir dados pendentes'
);

fs.writeFileSync(adminPath,admin);

for(const path of ['index.html','vitrine/index.html']){
  let html=fs.readFileSync(path,'utf8');
  html=replaceOnce(
    html,
    "    function basketCard(b,index=99){",
    "    function basketPublicAvailabilityLabel(){return ''}\n    function basketCard(b,index=99){",
    `${path}: helper estoque publico`
  );
  html=replaceOnce(
    html,
    "+'</div><div class=\"sub\" style=\"margin:0 0 7px\">'+esc(formatQty(b.stock_quantity||0))+' pronta(s)</div><button",
    "+'</div>'+basketPublicAvailabilityLabel()+'<button",
    `${path}: ocultar saldo numerico`
  );
  fs.writeFileSync(path,html);
}

console.log('patch admin + basket public availability aplicado');

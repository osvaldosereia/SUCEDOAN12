# Dona Antônia Operations 2.0 — Avarias, Vencimentos, Perdas, Descartes e Origem Fiscal do Estoque (DRAFT FINAL DE ANÁLISE)

> Documento de análise. Não implementar ainda.
> Atualização: 2026-09-25.

## Objetivo
Tratar corretamente o produto que:
- quebra;
- vaza;
- rasga;
- é contaminado;
- vence;
- desaparece;
- é encontrado em falta no balanço;
- sobra sem origem comprovada;
- precisa ser devolvido ao fornecedor.

## Descoberta fiscal MT — perda exige documento
Consultas oficiais recentes da SEFAZ/MT foram claras.

Consulta 151/2026:
perda, extravio ou redução de estoque sem causa conhecida devem ser formalizados com documento fiscal de baixa, sem destaque de ICMS, usando CFOP 5.927, com estorno do crédito quando anteriormente apropriado.

Consulta 148/2026:
produtos vencidos, deteriorados ou avariados sem valor econômico, destinados a descarte, usam CFOP 5.927 para baixa; se houver remessa interestadual para estabelecimento de descarte, a consulta indicou documento adicional para trânsito.

Referência consolidada:
https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=471

Consulta 049/2023 reforça:
- falta por perecimento/deterioração/extravio/roubo/furto -> NF-e 5.927;
- sobra física não autoriza emissão de NF-e fictícia para "criar" estoque;
- origem da sobra deve ser investigada e pode exigir regularização/denúncia espontânea.

Referência:
https://www.sefaz.mt.gov.br/legislacao/subindice.aspx?id=402

## Correção importante no desenho anterior do Balanço
O balanço mobile pode ser rapidíssimo para **contar**.

Mas a diferença não deve virar automaticamente um simples saldo final no Bling em todos os casos.

### Contagem = realidade física
Registrar:
- esperado;
- contado;
- diferença;
- lote;
- operador;
- localização.

### Reconciliação = tratamento da diferença
- diferença zero -> fecha;
- falta explicada por venda/entrada ainda não lançada -> corrigir documento de origem;
- avaria/vencimento/perda -> baixa fiscal apropriada;
- falta sem causa -> CFOP 5.927 + revisão;
- sobra -> investigar origem; não "fabricar" entrada fiscal.

Portanto:
**Conferência de estoque mede. A regularização explica.**

Isso é mais profissional e evita que o botão de balanço vire uma forma de esconder diferenças fiscais.

## Estrutura física mínima — dois depósitos, não duas lojas
A empresa continua tendo apenas uma loja/operação.

No Bling usar conceitualmente:
1. `Geral` — vendável;
2. `Quarentena` — desconsiderado do saldo vendável.

O Bling permite criar depósito cujo saldo é desconsiderado, inclusive citando avaria/conserto como exemplo.

Referência:
https://ajuda.bling.com.br/hc/pt-br/articles/360036176533-Cadastrar-um-dep%C3%B3sito-de-estoque

Também permite transferência entre depósitos e transferência de lote preservando o lote.

Referências:
- https://ajuda.bling.com.br/hc/pt-br/articles/360036193214-Como-transferir-estoque-de-produtos-entre-dep%C3%B3sitos
- https://ajuda.bling.com.br/hc/pt-br/articles/37493123505559-Como-realizar-a-transfer%C3%AAncia-de-lote-entre-dep%C3%B3sitos-no-Bling

## Fluxo de avaria encontrada no barracão
Operador:
1. bipar EAN;
2. escolher AVARIA;
3. quantidade;
4. opcional foto;
5. confirmar.

Automático:
- retirar imediatamente da disponibilidade de venda;
- transferir Geral -> Quarentena quando tecnicamente homologado;
- preservar lote;
- criar evento/atenção de descarte.

Depois:
- supervisor verifica se é perda definitiva, devolução ao fornecedor ou produto recuperável.

### Se perda definitiva
CNPJ/estoque fiscal regular:
- preparar baixa fiscal CFOP 5.927;
- sem destaque de ICMS conforme consulta;
- estornar crédito somente quando houver crédito apropriado e conforme regime;
- remover definitivamente do estoque após documento/processo.

### Se fornecedor aceita devolução
Não tratar como perda.
Usar **devolução de compra** ao fornecedor.

O Bling suporta devolução de compra a partir da nota de entrada.

## Produto vencido
Na data de vencimento:
- bloquear venda imediatamente;
- tirar do pool promocional;
- lote vai para Quarentena;
- gerar tarefa de descarte.

Depois, em lote:
- supervisor confirma os itens efetivamente descartados;
- sistema prepara baixa fiscal 5.927 para estoque fiscal CNPJ;
- registrar motivo "vencimento";
- guardar lote/validade/quantidade;
- finalizar.

Não precisa emitir uma nota por unidade; o desenho deve permitir agrupar descarte em lotes operacionais conforme regra fiscal homologada.

## Produto avariado durante separação
Não cancelar o pedido inteiro.

Fluxo:
- bipar item como danificado;
- mover unidade para Quarentena;
- buscar outra unidade vendável;
- continuar pedido.

Se não houver substituição:
- pedido entra em exceção;
- cliente escolhe remover/trocar/cancelar.

A perda da unidade é tratada separadamente do pedido.

## Produto avariado durante entrega
Se ainda não entregue:
- cliente pode aceitar substituição futura ou recusar item;
- se item retorna após NF-e/circulação, tratar retorno parcial;
- depois inspeção -> Quarentena -> perda ou volta ao Geral.

## Perda/roubo/extravio
Registrar motivo distinto:
- quebra/avaria;
- vencimento;
- roubo/furto;
- extravio;
- falta de inventário;
- descarte sanitário;
- outro.

Fiscalmente podem convergir para 5.927, mas o motivo operacional deve permanecer detalhado para gestão.

## Evidências
Para perdas relevantes:
- data/hora;
- produto;
- quantidade;
- lote;
- custo;
- motivo;
- operador;
- supervisor;
- foto opcional;
- referência da NF-e de baixa;
- destino/descarte quando houver.

Não exigir foto para uma unidade barata se isso tornar operação impraticável. Pode haver limiar por valor/quantidade.

## Estoque CPF — NÃO assumir que está "fora da SEFAZ"
A hipótese "comprou no CPF, então não precisa de baixa fiscal" NÃO é segura como regra de sistema.

O RICMS/MT, art. 201, exige NF-e de entrada em várias hipóteses de entrada de bens/mercadorias no estabelecimento, inclusive provenientes de pessoa física ou pessoa não obrigada à emissão.

Referência atual:
https://www.sefaz.mt.gov.br/legislacao/SubIndice.aspx?ID=27

Isso não resolve automaticamente o caso específico:
**fornecedor emitiu a compra para o CPF do proprietário e a mercadoria foi colocada no estoque e vendida pela empresa**.

Esse cenário precisa de orientação contábil/fiscal própria.

## Política segura até homologação das compras em CPF
XML em CPF:
- pode atualizar/enriquecer cadastro de produto;
- pode cadastrar fornecedor como evidência;
- pode alimentar custo gerencial;
- NÃO cria conta a pagar empresarial automaticamente;
- NÃO entra automaticamente como estoque fiscal regular da empresa;
- NÃO deve disparar automaticamente uma NF-e 5.927 de perda.

Se a mercadoria física está no barracão:
- marcar origem `cpf_pending_regularization`;
- Control Tower mostra quantidade/valor pendente de política;
- contador define como regularizar a entrada na empresa;
- depois da regularização, passa a seguir as mesmas regras CNPJ.

## Proveniência mínima por entrada/lote
Para automatizar corretamente, precisamos saber de onde a quantidade veio.

Não criar um segundo estoque.
Manter apenas metadado/proveniência:
- cnpj_xml
- cpf_pending_regularization
- manual_regularized
- return_from_customer
- adjustment_review

Idealmente vinculada ao lote/entrada do Bling.

## Sobra de inventário
Se contagem física > estoque oficial:
- não lançar automaticamente Balanço para cima;
- abrir "Sobra sem origem";
- procurar:
  - XML não lançado;
  - devolução;
  - compra não recebida;
  - fator caixa/unidade errado;
  - erro de baixa;
  - item CPF;
  - cadastro duplicado.

Somente regularizar depois de identificar a causa.

## Faltas de inventário
Se físico < oficial:
1. procurar venda/baixa pendente;
2. procurar transferência/recebimento incorreto;
3. se perda real/causa desconhecida -> baixa fiscal 5.927;
4. fechar divergência.

## Bling como sistema profissional
O Bling passou em 2026 a impedir edição/exclusão de lançamentos de estoque em campos críticos, melhorando rastreabilidade.

Referência:
https://ajuda.bling.com.br/hc/pt-br/articles/35308144234775-Bloqueio-da-edi%C3%A7%C3%A3o-e-exclus%C3%A3o-de-lan%C3%A7amentos-de-estoque-no-Bling

Esse comportamento é desejável: correção deve ser novo evento, não apagar histórico.

## Interface mobile proposta
No Tablet Operação, além de Separado/Problema:
**ESTOQUE**
- Balanço
- Avaria/Vencido
- Retorno de entrega

### Avaria/Vencido
EAN -> produto -> motivo -> quantidade -> confirmar.

### Retorno de entrega
QR do pedido -> conferir itens que voltaram -> condição -> confirmar.

O funcionário não escolhe CFOP, CST ou natureza fiscal.
O sistema/contador define regras; funcionário registra apenas o fato físico.

## Automação
Automático:
- bloquear venda;
- mover para Quarentena;
- calcular custo da perda;
- agrupar fila de descarte;
- preparar documento fiscal;
- atualizar Control Tower.

Humano:
- confirmar ocorrência física;
- confirmar descarte/devolução ao fornecedor;
- resolver sobra;
- aprovar exceções fiscais.

## Gate
Antes de implementação:
1. contador homologa 5.927/natureza/CST/CSOSN/regime;
2. contador define compras CPF;
3. POC de depósito Quarentena desconsiderado;
4. POC transferência de lote;
5. POC NF-e de baixa e estoque do depósito correto;
6. definir política de agrupamento de descarte;
7. revisar regra de Balanço.

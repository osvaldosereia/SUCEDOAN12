# Dona Antônia Operations 2.0 — Compras, XML, Recebimento e Estoque (DRAFT)

> Documento de análise. Não implementar ainda.
> Última atualização: 2026-09-25.

## Objetivo
Definir como usar o Bling como núcleo de compras/entrada/estoque, preservando somente as regras especiais da Dona Antônia:
- XMLs em CPF;
- caixa/fardo -> unidade;
- revisão humana em conversões ambíguas;
- eventual enriquecimento automático do cadastro.

## Descobertas oficiais do Bling
Fontes consultadas em 2026-09-25:
- Notas recebidas/SEFAZ: https://ajuda.bling.com.br/hc/pt-br/articles/360057118174-Como-consultar-manifestar-e-importar-as-notas-de-entrada-da-SEFAZ
- Importar XML de entrada: https://ajuda.bling.com.br/hc/pt-br/articles/360036460513-Como-importar-o-XML-de-nota-de-entrada
- Conciliar XML com pedido de compra: https://ajuda.bling.com.br/hc/pt-br/articles/21830391097367-Como-vincular-os-itens-da-Nota-Fiscal-de-Entrada-com-Pedidos-de-Compra-na-Importa%C3%A7%C3%A3o-do-XML
- DUN: https://ajuda.bling.com.br/hc/pt-br/articles/37475309054487-Como-cadastrar-e-utilizar-o-c%C3%B3digo-DUN-no-Bling
- Lote na entrada: https://ajuda.bling.com.br/hc/pt-br/articles/32537061154711-Como-cadastrar-o-lote-pela-nota-de-entrada-no-Bling
- Lote/FEFO na venda: https://ajuda.bling.com.br/hc/pt-br/articles/34291368501911-Como-usar-o-lote-no-pedido-de-venda-do-Bling
- obrigatoriedade de validade: https://ajuda.bling.com.br/hc/pt-br/articles/36277066728343-Como-configurar-a-obrigatoriedade-da-Data-de-Validade-e-ou-Fabrica%C3%A7%C3%A3o-no-Controle-de-Lotes

## Capacidade nativa que devemos aproveitar

### NF-e emitida para o CNPJ
O Bling pode:
- consultar notas emitidas contra o CNPJ diretamente na SEFAZ;
- fazer manifestação do destinatário;
- buscar automaticamente as NF-e recebidas;
- importar a nota de entrada;
- conciliar produtos;
- lançar estoque;
- lançar contas;
- relacionar itens ao pedido de compra.

O Bling alerta para não usar dois sistemas diferentes consultando a mesma distribuição de NF-e/NSU simultaneamente.

### Decisão provisória
**O Bling deve ser o único consumidor da distribuição SEFAZ do CNPJ.**

Não criar um segundo consumidor SEFAZ no Supabase.

Fluxo alvo:
SEFAZ -> Bling (busca nativa) -> nossa camada lê/reage ao que o Bling já recebeu.

Isso reduz risco de consumo indevido de NSU e de notas "sumirem" entre sistemas.

## O que o módulo atual faz de verdade
O `purchase-xml-v1` atual NÃO consulta diretamente a distribuição SEFAZ.

Ele:
1. autentica no Bling;
2. lista NF-e no endpoint do próprio Bling (`/nfe?tipo=0`);
3. obtém XML pelo Bling;
4. processa os XMLs localmente.

Portanto ele pode coexistir tecnicamente com a busca SEFAZ nativa do Bling, desde que o Bling seja quem alimente a lista de notas recebidas.

### Dependência importante
Se a busca automática de NF-e recebidas não estiver habilitada/configurada no Bling (certificado A1 etc.), nossa rotina pode apenas reler o que já existe no Bling e não descobrir novas notas da SEFAZ.

Isso deve ser verificado na homologação.

## Busca diária
Hoje existe uma rotina própria:
- janela de 3 dias;
- lista NF-e do Bling;
- baixa XML pelo Bling;
- processamento local.

No projeto final, avaliar substituir o polling diário por:
- busca automática nativa do Bling;
- webhook/evento se existir para entrada recebida/importada;
- leitura sob demanda/reconciliação diária apenas como garantia.

Princípio: não consultar por cron se o evento/nativo resolver.

## XML CNPJ — desenho alvo
1. Bling encontra NF-e na SEFAZ.
2. Operação manifesta conforme regra.
3. Nota entra em fila de recebimento.
4. Conciliar itens com produtos do Bling.
5. Produtos sem vínculo entram em "Precisa de você".
6. Conferir embalagem/quantidade.
7. Check-in físico.
8. Lote/validade.
9. Confirmar recebimento.
10. Lançar estoque.
11. Lançar/conciliar contas a pagar.
12. Atualizar custo/fornecedor conforme política.
13. Ledger registra todo o fluxo.

## Check-in
O Bling possui recurso de Check-in de Recebimentos e o DUN depende dele.

O projeto final deve preferir o Check-in nativo se a conta Dona Antônia tiver o recurso habilitado.

Benefícios:
- leitura por código;
- conferência física antes da entrada;
- DUN;
- rastreabilidade de divergência;
- evita lançar estoque antes de conferir.

## Caixa/fardo -> unidade
Este é requisito especial e não pode depender só de texto do XML.

### Bling nativo
DUN-14 permite cadastrar:
- código da embalagem coletiva;
- quantidade de unidades contidas;
- mais de um DUN/tamanho por produto.

No Check-in, uma leitura do DUN pode equivaler a 6, 12, 24 etc. unidades.

Limitação:
- DUN é recurso de recebimento;
- nem todo fornecedor enviará DUN útil;
- XML pode usar unidade CX/FD/PCT sem relação inequívoca;
- um mesmo fornecedor/produto pode mudar apresentação.

### Regra Dona Antônia
Manter um dicionário determinístico:
produto + fornecedor + código do item do fornecedor + unidade de compra -> unidade base + fator.

Exemplo:
Fornecedor X / Arroz Y / CX -> UN / 10.

Se houver DUN confirmado, ele é forte evidência para o fator.
Se XML qCom/qTrib produzir razão coerente, usar como sugestão.
Se nenhuma evidência segura, mandar para revisão humana.

Nunca inferir fator apenas do nome "caixa".

## Estado do módulo custom atual
Já existe:
- `product_supplier_packaging`;
- `purchase_xml_items`;
- `product_purchase_history`;
- `purchase_stock_receipts`;
- `set_conversion`;
- cálculo de base_quantity/base_unit_cost;
- persistência do fator por fornecedor/produto/embalagem;
- entrada física idempotente;
- confirmação humana `CONFIRMAR_ENTRADA`.

Essa parte tem valor e provavelmente deve ser reduzida para **regra especial de conversão/auditoria**, não virar um ERP paralelo de compras.

## Lotes e validade
O Bling atual permite:
- cadastrar lote durante entrada;
- dividir uma entrada em vários lotes;
- exigir validade/fabricação;
- na baixa automática, consumir o lote com validade mais próxima.

### Decisão provisória
Bling deve ser a fonte oficial de lote/validade.

A regra comercial Dona Antônia de desconto por vencimento poderá consultar os lotes do Bling e aplicar preço/oferta no canal de venda, sem manter uma "validade única" paralela como verdade principal.

## XML de CPF
Esses XMLs não aparecem naturalmente na distribuição SEFAZ do CNPJ da empresa.

Fluxo proposto:
1. upload manual no Admin;
2. staging Dona Antônia;
3. extrair fornecedor/produto/GTIN/NCM/CEST/unidades/custo;
4. resolver produto do Bling;
5. registrar evidência;
6. atualizar dados permitidos somente após regras/gates;
7. **não criar conta a pagar empresarial**;
8. não registrar a nota como obrigação fiscal/financeira da empresa automaticamente.

### Estoque/custo de compra em CPF
O usuário deseja que produtos/fornecedor sejam aproveitados e que não haja financeiro empresarial.
Ainda precisa ser definido com contador como o custo/entrada física de mercadoria adquirida em CPF deve ser refletido contabilmente/fiscalmente na empresa.

Projeto deve separar:
- evidência cadastral;
- entrada física;
- custo gerencial;
- documento fiscal da empresa;
- financeiro.

Nunca tratar essas cinco coisas como se fossem automaticamente equivalentes.

## Produtos novos
O Bling consegue criar produtos a partir de nota de entrada.

No projeto final:
- evitar criação automática de produto ativo na vitrine;
- produto novo entra como cadastro ERP/inativo para venda até passar gates:
  - GTIN/SKU;
  - unidade base;
  - conversão;
  - NCM/CEST/fiscal;
  - preço de venda;
  - categoria;
  - imagem/descrição comercial quando necessário.

## Fornecedor
Bling deve ser fonte oficial do fornecedor.
A camada Dona Antônia mantém apenas metadados especiais necessários à conversão/qualidade da importação.

## Contas a pagar
CNPJ:
- Bling deve ser a fonte oficial;
- preferir parcelas/condições vindas da entrada/pedido de compra;
- deduplicação por documento/chave.

CPF:
- bloqueio absoluto de criação automática de contas a pagar empresariais.

## Control Tower
A Central deve exibir:

### Recebimentos
- NF-e novas no Bling;
- aguardando manifestação;
- aguardando conciliação;
- aguardando check-in;
- recebidas hoje;
- divergências.

### Precisa de você
- produto sem vínculo;
- GTIN conflitante;
- fator caixa->unidade desconhecido;
- custo incoerente;
- lote sem validade;
- diferença pedido de compra x NF-e;
- XML CPF;
- conta a pagar divergente.

### Automação
- última busca/entrada Bling;
- última reconciliação;
- XMLs processados;
- duplicados;
- falhas;
- itens em revisão.

## O que provavelmente será removido/reduzido
Após homologação:
- custom daily polling que não agregar valor;
- criação duplicada de contas a pagar;
- estoque paralelo de recebimento;
- validações que Bling já executa.

## O que provavelmente permanece custom
- upload XML CPF;
- fator caixa/fardo -> unidade;
- fila de revisão;
- regras de ativação na vitrine;
- auditoria/ledger;
- integração Control Tower;
- eventuais transformações necessárias entre Bling e site.

## Gates de implementação futura
1. confirmar certificado A1 e busca automática SEFAZ no Bling;
2. confirmar Check-in de Recebimentos habilitado;
3. confirmar campo DUN disponível;
4. configurar/validar lotes e validade;
5. definir política fiscal/contábil para compras no CPF;
6. testar 10-20 XMLs reais CNPJ e CPF;
7. testar caixas com fatores diferentes;
8. validar custo unitário final;
9. validar contas a pagar;
10. somente então simplificar/remover módulo custom.

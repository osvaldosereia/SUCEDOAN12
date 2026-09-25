# Dona Antônia Operations 2.0 — HANDOFF

> Documento canônico de continuidade. Atualizar ao final de cada rodada relevante.
> Última atualização: 2026-09-25.

## Objetivo
Simplificar a operação da Dona Antônia usando:
- donaantonia.com.br como canal de venda;
- Vitrine/Admin como interface operacional simples para funcionários;
- Bling como ERP oficial (produtos, estoque operacional, compras, fornecedores, vendas, fiscal e financeiro);
- ChatGPT como camada de gestão, análise, automações e acompanhamento;
- Supabase apenas para regras e integrações específicas que o Bling não resolve adequadamente.

## Princípios
1. Não substituir nem apagar fluxo de produção antes de homologar o substituto.
2. Não reconstruir no Admin funções que o Bling já execute bem.
3. Funcionários não devem depender do painel completo do Bling para a rotina.
4. Regras críticas e determinísticas não ficam a critério da IA.
5. Preferir eventos/webhooks a polling periódico.
6. Bling será a fonte oficial do ERP; Admin será a interface operacional da Dona Antônia.
7. ChatGPT será a interface gerencial do proprietário sempre que tecnicamente possível.

## Escopo da auditoria
Classificar cada função atual como:
- BLING
- ADMIN DONA ANTÔNIA
- CHATGPT
- INTEGRAÇÃO MÍNIMA
- REMOVER APÓS HOMOLOGAÇÃO

Domínios:
- site e checkout;
- pedidos;
- clientes;
- produtos e cadastro;
- estoque;
- cestas;
- ofertas;
- validade;
- gôndola/prateleira;
- compras e fornecedores;
- XML/NF-e de entrada;
- conversão caixa -> unidade;
- fiscal;
- contas a pagar;
- contas a receber;
- separação/picking;
- conferência;
- impressão automática;
- expedição;
- entrega/rotas;
- relatórios e gestão;
- automações ChatGPT.

## Regras já aprovadas
### XML / compras
- NF/XML do CNPJ: usar o máximo possível do fluxo nativo do Bling.
- XML de compra no CPF: pode cadastrar/atualizar produtos, fornecedor, custo e estoque conforme regras aprovadas, mas NÃO deve criar conta a pagar/vínculo financeiro empresarial.
- Compras em caixa com venda por unidade exigem conversão determinística para unidades, custo unitário e estoque correto.

### Pedidos / operação
Fluxo-alvo:
cliente -> donaantonia.com.br -> validação mínima -> Bling -> separação -> conferência -> fiscal -> expedição -> entrega.

- Ao entrar pedido, objetivo é imprimir automaticamente uma lista de separação organizada por gôndola/prateleira.
- Interface do funcionário deve ser simples: Montar -> Conferir -> Expedir.
- Folha do entregador é diferente da folha de separação: cliente, endereço, telefone, localização/mapa, volumes, pagamento/valor a receber e observações.
- Avaliar aproveitamento de Picking/Packing, Checkout de Pedidos, DANFE simplificado, etiquetas e impressão nativa do Bling.
- Para impressão personalizada imediata, avaliar ponte/agente local de impressão sem recriar ERP.

## Arquitetura-alvo
CLIENTE
  -> donaantonia.com.br
  -> camada mínima Dona Antônia
  -> Bling (ERP)
  -> fiscal/financeiro/estoque/compras

FUNCIONÁRIO
  -> Admin Operacional Dona Antônia
  -> Montagem / Conferência / Expedição / Entrega

PROPRIETÁRIO
  -> ChatGPT
  -> gestão do Bling + exceções + relatórios + automações

BLING
  -> webhooks/eventos
  -> sincronização mínima com Supabase/Admin quando necessário

## Estado técnico conhecido
- Repositório principal: osvaldosereia/SUCEDOAN12.
- Supabase canônico ativo: ssbesxgaijknwsjbsbcz.
- Projeto legado Chat Commerce OS qxstkwshuvplmmftrctj está inativo.
- Há diversas Edge Functions históricas/duplicadas relacionadas a Bling e operação; NÃO remover até auditoria e homologação.
- A documentação existente registra runtimes antigos de Bling Hub/fiscal desativados, embora jobs pg_cron tenham existido.
- O Vitrine/Admin atual possui ações intermediárias de Bling/fiscal/financeiro que precisam ser confrontadas com capacidades nativas do Bling/MCP.

## Fases
### Fase 1 — Auditoria e matriz
Inventariar GitHub + Supabase + Admin + integração Bling e produzir matriz de destino.

### Fase 2 — Bling como ERP
Validar conexão, permissões, módulos e configurações; definir fonte oficial por domínio.

### Fase 3 — Pedido até expedição
Simplificar pedido do site -> Bling; impressão automática; separação; conferência; NF-e; expedição.

### Fase 4 — Compras / XML / estoque
NF-e recebida, XML manual CPF/CNPJ, fornecedores, caixa->unidade, custos, estoque e pedidos de compra.

### Fase 5 — Financeiro
Contas a pagar/receber, vencimentos, conciliação operacional e relatórios.

### Fase 6 — ChatGPT gestor
Rotinas agendadas, alertas por exceção, panorama diário, estoque crítico, compras, fiscal, financeiro e pedidos parados.

### Fase 7 — Limpeza
Remover somente componentes comprovadamente substituídos e sem dependências de produção.

## Próximo passo
Executar a Fase 1: auditoria ampla e criar a matriz:
FUNÇÃO ATUAL | ONDE ESTÁ | COMO FUNCIONA | DESTINO | MOTIVO | RISCO | DEPENDÊNCIAS | AÇÃO.

## Como retomar em qualquer novo chat
Dizer:
"Retome Dona Antônia Operations 2.0. Leia docs/projects/dona-antonia-operations-2/HANDOFF.md no SUCEDOAN12, confirme o estado real no GitHub/Supabase antes de agir e continue do Próximo passo. Não altere produção sem homologação."

## Regra de continuidade
Ao terminar cada rodada importante:
1. atualizar este HANDOFF;
2. registrar o que foi realmente concluído;
3. registrar pendências/bloqueios;
4. atualizar Próximo passo;
5. nunca depender apenas do histórico do chat.

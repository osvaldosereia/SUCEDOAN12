# Dona Antônia Operations 2.0 — IMPLEMENTATION ROADMAP

> Aprovado para implantação segura em 2026-09-25. Executar por homologação, shadow/canary e rollback; não fazer big-bang.
> Atualizado em 2026-10-22 após validação do estado real no GitHub, site em uso e Supabase.

## REFORMA CONTÍNUA DO SISTEMA E DO SITE PÚBLICO — 2026-10-22

### Decisão de arquitetura

Esta reforma é do sistema já usado pela Dona Antônia. Não criar outro site, outro Admin, outro app, outro banco ou um segundo fluxo operacional. O site público continua na raiz do domínio. O Admin atual em /vitrine/admin/ é a única aplicação administrativa e continuará sendo ajustado nesse caminho. A migração para /admin/ está fora do escopo atual; /admin/ pode ser reconsiderado depois, se houver necessidade. O catálogo em /catalogo-admin/ continua sendo somente uma prévia pública de leitura, não um segundo Admin.

Fonte canônica: repositório osvaldosereia/SUCEDOAN12 e Supabase ssbesxgaijknwsjbsbcz. O projeto Supabase antigo não deve voltar a receber chamadas. Não remover caminhos, tabelas, funções, dados ou integrações até provar que não têm uso. Manter pedidos e histórico, catálogo, estoque Bling, fiscal, financeiro, WhatsApp e regras operacionais.

### Baseline verificado em 2026-10-22

- No snapshot inicial, main estava em 24719f9c57b2d362b1e7c5b197dc57fc66a6b8f5; revalidada em 9ec95df6b55e24f3964c22d4b2064d3163519de4 após a PR #1269. A árvore principal já não contém os diretórios experimentais /site e /admin1.
- No site ao vivo, / abre a vitrine pública; /admin/ retorna para a raiz e não abre o painel; /vitrine/admin/ abre o Admin em uso.
- A troca de produto em uma cesta pública foi testada: escolher Arroz Tio Bonini atualizou o item e o total de R$ 419,30 para R$ 425,70. O teste parou antes de adicionar a cesta ou enviar pedido.
- A página pública raiz concentra cerca de 200 KB de HTML, com aproximadamente 138 KB de JavaScript embutido.
- O Admin atual usa vitrine/admin/admin-runtime.js, com cerca de 642 KB, mais nove fragmentos de texto ordenados em runtime-src. Eles recompõem uma única IIFE e ainda não são módulos independentes. O CSS principal tem cerca de 126 KB.
- O diretório tests/ tem três arquivos, além de dezenas de scripts/test-* na pasta scripts/. Há 66 workflows de GitHub; falta mapear quais executam os gates relevantes para cada área. Cada lote deve rodar o build e os testes direcionados correspondentes.
- No projeto Supabase canônico há 142 Edge Functions ativas. Os advisors de segurança registravam 3 avisos de search_path mutável, 43 funções SECURITY DEFINER executáveis por authenticated, 1 aviso de proteção contra senhas vazadas e 228 tabelas com RLS sem policy. O último grupo inclui tabelas privadas e políticas de negação padrão; classificar tabela por tabela antes de mudar. Avisos de performance: 77 FKs sem índice e 97 índices sem uso, a revisar com consultas e carga reais. A admin1-products-read-v1 (v3) está ativa e teve chamadas reais nas últimas 24 h (56 GET products, 42 categories, 13 product, 2 matches e 1 health); origem e consumidor ainda não aparecem nos logs. O wrapper admin1-legacy-catalog-read-v1 existe no repositório, mas não constava como deployment ativo nesta revalidação. Manter a função ativa e identificar o consumidor antes de qualquer mudança.
- Este snapshot é uma fotografia, não um valor permanente. Atualizar a baseline antes de cada onda; o roadmap operacional existente e parte do handoff têm datas de setembro e não substituem a leitura do runtime atual.

### Checkpoint de execução — 2026-10-22

- Main atual em `383fc5062483dacb61541ec2624b526633ee4d4a`; #1269 já está mergeada em `9ec95df6b55e24f3964c22d4b2064d3163519de4`, portanto os documentos que vieram dela já estão em main. #1273 foi integrada em `52c7ca0a75a0e7bb55f3cd4d99b7cf969bcb6627`; #1275 em `383fc5062483dacb61541ec2624b526633ee4d4a`. A branch main está sem proteção/checks obrigatórios configurados.
- #1275 adicionou diagnóstico categorizado limitado ao GET válido de `admin1-products-read-v1` e teste de contrato. Arquivos: `.github/workflows/admin1-products-read-context-ci.yml`, `scripts/test-admin1-consumer-context.mjs`, `supabase/functions/admin1-products-read-v1/consumer-context.mjs`, `supabase/functions/admin1-products-read-v1/index.ts`. Sem parâmetros ou identificadores de busca, IP, Referer completo ou User-Agent bruto no logger customizado.
- Projeto canônico `ssbesxgaijknwsjbsbcz` está ACTIVE_HEALTHY, região sa-east-1, PostgreSQL 17.6.1.166. A função canônica `admin1-products-read-v1` está ACTIVE v4, `verify_jwt=false`, hash `b61be132530350da259e006674038c458c0d2aac3d5142c70e6ff2eeb8f58ff9`. O GET controlado `?action=health` retornou 200 e logou `health / unknown / browser / fetchSite=none`; isso valida execução do logger, não comprova uso pelo frontend.
- Foi revalidada `admin1-legacy-catalog-read-v1` ACTIVE v2 em outro projeto, `xaoeldjuxzsdsblimzxo`, `verify_jwt=false`; o código publicado encaminha ao leitor canônico. Não desligar nem migrar até mapear chamadas naturais e dependências.
- Testes direcionados da #1275 passaram (teste de contexto, sintaxe JS e TS); `python3 scripts/build-vitrine-admin-runtime.py --check` passou (9 fragmentos, 640.167 caracteres). Os quatro testes ajustados pela #1273 também passaram. Na main, Pages deploy run `39845023999` e Admin1 reader run `39845026219` concluíram success. No snapshot geral consultado, Basket kit editor seguia in progress e o workflow independente XML R31 one-shot falhou 401 por token inválido.
- Smoke do site publicado: `/` abriu a vitrine pública com cinco cestas/ofertas e carrinho vazio; `/vitrine/admin/` abriu a Central. A aba Produtos ficou em “Carregando…”; log canônico registrou POST 401 em `admin-products-live-v1` v183 em 22/10/2026 20:04:02Z. A causa ainda não está isolada. Nenhuma mutação de catálogo/pedido/estoque, mensagem, emissão fiscal ou pagamento ocorreu.
- Supabase: foi aplicado somente deploy v4 do leitor canônico no projeto `ssbesxgaijknwsjbsbcz`. Sem migration/schema/dados/policies/grants/configuração; sem advisors de banco, pois não houve alteração desses itens. O wrapper legado permaneceu intacto. Rollback da função é redeploy da fonte v3 anterior; rollback do código é revert dos commits #1275/#1273.
- Rotas preservadas: site `/`; Admin `/vitrine/admin/`. Sem `/admin/`, aplicação paralela, pedido/check-out sintético ou efeitos em Bling, WhatsApp, fiscal ou financeiro.

### Rodada anterior concluída — contratos do Admin e jornada pública — 2026-10-22 (histórico)

- A PR #1269 está merged; main é `9ec95df6b55e24f3964c22d4b2064d3163519de4`. PR #1270 continua aberta, com 19 workflows (9 success, 10 failure); o gate direcionado `products-session` passa. As dez falhas foram reproduzidas no SHA-base `24719f9c57b2d362b1e7c5b197dc57fc66a6b8f5` e no HEAD de #1270 antes dos ajustes, sem diferença atribuível ao código de Produtos.
- PR #1271 (`agent/admin-runtime-contract-tests`, revisão de código `4544862784812ce91b074c829e059b5255ba98ee`) atualiza somente contratos de teste do Admin modular e dos pedidos. O helper `scripts/helpers/admin-ui-source.mjs` compõe HTML, runtime e folhas de estilo realmente servidos; 15 testes foram ajustados, incluindo harness de sintaxe ESM e testes da vitrine pública do pedido. Commits desta atualização: `65938f4`, `15ec7d2` e `4544862`. Nenhum runtime ou comportamento operacional mudou.
- Passaram localmente 24/24 testes do lote, o build check do runtime, `node --check vitrine/admin/admin-runtime.js` e `git diff --check`. Na última consulta da revisão de código `4544862`, cinco de sete workflows estavam concluídos com sucesso; o job ANA já havia passado e o workflow de Cestas ainda instalava Chromium. Nenhum dos sete workflows reportou falha; consultar o estado final antes da integração. Smoke de leitura confirmou `/` com cinco cestas e carrinho vazio e `/vitrine/admin/` na Central com 19 áreas. Nenhuma publicação ocorreu.
- Supabase canônico `ssbesxgaijknwsjbsbcz`: ACTIVE_HEALTHY, PostgreSQL 17.6.1.166, 1.244 migrations (última `20261022114704`), 142 funções. Advisors atuais seguem com 228 RLS sem policy, 3 search_path mutáveis, 43 SECURITY DEFINER executáveis por authenticated, 1 aviso de proteção de senha; performance 77 FKs sem índice, 97 índices sem uso e 1 aviso de conexões. Não houve migration, deploy de função, alteração de configuração ou dados. O descompasso de migration (1.244 no banco / 180 arquivos, 31 timestamps comuns) continua bloqueando DDL.
- Rollback: reverter ou fechar #1271; só contratos de teste/helper foram alterados. Sem efeito no runtime ou banco.

Próxima ação exata: corrigir a jornada pública existente em `pedido/index.html` para usar o `channel_origin` que `order-public-view-v1` já retorna ao montar o link de WhatsApp para os canais 0975/1018; cobrir os dois casos sem enviar mensagem. No mesmo domínio, ajustar `scripts/test-admin-pending-data-baskets-public-v1.mjs` e `scripts/test-checkout-simple-ux.mjs` para validar `/` como entrada pública e `/vitrine/` como redirecionamento legado, em vez de exigir cópias HTML. Preservar `/` e `/vitrine/admin/`; executar testes de link curto/cliente e smoke de leitura. Não aplicar migrations no canônico até reconciliar o ledger.

### Rodada atual — ofertas da home e primeiro carregamento de imagem — 2026-10-22

- Baseline revalidada: `main` `b75035006a064c5939d7e1dbb4fe8c8ad5307c88`; PRs #1269 e #1270 merged. #1271 aberta, mergeable, HEAD de código `89d1e46f368ea2811fc9ff5cbe9e206f85b533c0`.
- Corrigido o carregamento de ofertas na home existente em `/`: seção e mount entram no shell inicial e em navegação nova, observer lazy é ativado ao hidratar, e ofertas carregadas/cacheadas são preservadas em atualizações do catálogo. O índice global impede múltiplas imagens de cesta de receberem prioridade alta.
- Arquivos nesta onda: `index.html`, `scripts/test-storefront-mobile-r3.mjs`, `r4.mjs` e `r5.mjs`. R1–R5 passaram no snapshot da PR; `python3 scripts/build-vitrine-admin-runtime.py --check` passou (9 fragmentos, 638.778 caracteres); os 13 workflows do commit `89d1e46` passaram.
- Smoke de leitura antes do merge: `/` exibiu cinco cestas/carrinho vazio; `/vitrine/admin/` abriu a Central com 19 áreas. Não houve pedido ou mensagem. O novo commit ainda não estava publicado.
- Supabase `ssbesxgaijknwsjbsbcz`: `ACTIVE_HEALTHY`, Postgres `17.6.1.166`, 1.244 migrations, última `20261022114704`, 142 funções; `admin1-products-read-v1` ativa v3. Nenhuma mudança de DB/função/config/dados nesta onda. Ledger divergente (180 SQLs no repo; 31 versões compartilhadas); sem DDL até reconciliar.
- Rollback: reverter o merge de #1271; não há rollback de Supabase.
- Próximo gate desta onda: integrar #1271 pelo fluxo normal após os checks da revisão documental final e confirmar a implantação por smoke de leitura no mesmo `/` e `/vitrine/admin/`.

### Ordem de execução

#### Onda 0 — ajustes urgentes e rede de segurança

1. [Concluída parcialmente em 2026-10-22] Mapear a entrada /vitrine/admin/ e as 19 áreas/entradas observadas; o primeiro lote de baixo risco foi escolhido e codificado na PR #1270. A integração segue bloqueada pelo CI amplo vermelho (10/19 checks), embora o gate dedicado de Produtos esteja verde. Completar a matriz de dependências e corrigir os contratos falhos após confirmar quais já falham em main. Não migrar a URL.
2. Registrar um conjunto curto de regressão da vitrine: carregamento inicial, preços de cesta, troca de opção, recálculo do total e estado sem pedido submetido. Critério: a correção recente de variação permanece coberta e não há chamada de criação de pedido no teste.
3. Reconciliar a árvore publicada, o commit de main e as versões das funções críticas no Supabase, incluindo Admin1. Critério: cada função ativa do fluxo principal tem fonte versionada e consumidor identificado; divergências entram em uma lista de correção, sem deploy cego.
4. Classificar os avisos de segurança do Supabase começando por funções SECURITY DEFINER, search_path e autenticação. Corrigir somente permissões comprovadamente excessivas, com teste de acesso permitido e negado. Não adicionar policies abertas para silenciar o advisor.

#### Onda 1 — organizar o Admin existente

1. Mapear entrada, navegação, módulos, folhas de estilo, chamadas de API, estado compartilhado e pontos de inicialização.
2. Manter o runtime servido estável enquanto os fragmentos são organizados. A cada lote: editar função ou grupo pequeno, regenerar o runtime e exigir python3 scripts/build-vitrine-admin-runtime.py --check.
3. Extrair funções puras e dependências explícitas antes de separar módulos por domínio. Preservar ordem e nomes de eventos, funções globais, contratos Supabase e regras de negócio até que testes as protejam.
4. Depois da paridade estrutural, organizar CSS por domínio sem alterar precedência visual. Testar navegação, modal e viewport correspondentes.
5. Critério: o Admin atual fica mais fácil de localizar e alterar, sem mudar o comportamento operacional do lote.

#### Onda 2 — organizar o site público existente

1. Manter index.html como entrada de /. Inventariar os blocos de HTML, CSS e JavaScript e suas dependências.
2. Extrair um bloco por lote para arquivos existentes ou novos dentro do mesmo projeto; não criar uma segunda pasta/site para servir a vitrine.
3. Priorizar cesta, busca/categorias, produto, carrinho e checkout. Preservar preço, estoque, substituição, mínimo de pedido, região de entrega e integração com o Supabase canônico.
4. Critério: a mesma URL pública carrega os mesmos fluxos; os testes da cesta e uma verificação visual simples passam depois de cada lote.

#### Onda 3 — contratos do backend e módulos por domínio

Trabalhar um domínio por vez: catálogo/produtos; cestas; clientes; pedidos; estoque; expedição/entregas; compras/XML; Bling; fiscal/financeiro; WhatsApp/atendimento. Documentar entrada, saída, autenticação, efeitos no banco e retries de cada Edge Function chamada pelo domínio. Extrair código compartilhado somente quando as responsabilidades e permissões forem claras. Evitar juntar ou renomear APIs durante uma extração estrutural.

Critério por domínio: contrato registrado, teste do caminho feliz, teste de falha/retry quando houver efeito externo, fonte no GitHub alinhada com a função publicada e rollback conhecido.

#### Onda 4 — dados, segurança e desempenho

1. Auditar policies e grants com os papéis anon, authenticated e service_role; testar acesso negativo e positivo. RLS habilitado sem policy pode ser a negação correta.
2. Revisar funções SECURITY DEFINER e fixar search_path explicitamente quando aplicável; confirmar proprietário, grants e chamadas antes de alterar.
3. Medir consultas lentas e planos antes de adicionar ou remover índices. Não excluir índices somente porque o advisor marca “unused”.
4. Fazer mudanças de schema aditivas, migradas e reversíveis. Preservar histórico e evitar renomear/apagar dados como parte de uma extração de frontend.
5. Critério: o advisor é acompanhado por achados classificados e cada correção tem teste de segurança e de desempenho.

#### Onda 5 — interface, acessibilidade e limpeza final

Após estabilizar a estrutura e os contratos, corrigir navegação móvel, estados de carregamento/erro, acessibilidade, tempo de carregamento e consistência visual no próprio site e Admin. Remover código, funções, tabelas, crons ou rotas antigas somente depois de busca de referências no repositório, confirmação de ausência de uso no runtime/logs e plano de rollback.

### Regra objetiva para cada ajuste

Um lote contém uma mudança pequena e um domínio. Antes: identificar arquivo, comportamento atual e risco. Durante: preservar contratos e limitar o diff. Depois: executar somente as verificações que cobrem a mudança — sintaxe/build, teste direcionado e smoke de leitura quando necessário. Mudanças com efeitos em pedido, estoque, financeiro, fiscal ou Bling exigem teste em modo seguro e evidência antes da ativação. Não fazer compra, checkout real ou alteração operacional para testar.

Registrar em cada lote: arquivos, commit/PR, comando de teste e resultado, verificação no site quando pertinente, eventual alteração Supabase e rollback. Se falhar, corrigir o lote atual antes de começar outro.

### Execução autônoma horária

- A cada hora, retomar do último checkpoint verificável no repositório, nas PRs e neste roadmap.
- Buscar o máximo de progresso **validado** por rodada. Podem ser concluídos vários ajustes pequenos quando pertencem ao mesmo domínio, compartilham testes e têm rollback claro. Não misturar alterações independentes só para aumentar o volume.
- Trabalhar no código em uso: vitrine/Admin em `/vitrine/admin/` e site público em `/`. Não criar Admin/site paralelo e não migrar a rota para `/admin/`.
- Priorizar a próxima pendência das ondas acima; escolher uma área coerente por rodada. Se um teste falhar, corrigir e repetir os testes do mesmo lote antes de mudar de domínio.
- Versionar em branch `agent/*`, fazer commits pequenos, manter/abrir PR e registrar arquivos, SHAs, testes, CI, smoke e rollback. Integrar/publicar apenas pelo fluxo já aprovado do repositório, depois dos gates correspondentes.
- Alterar o Supabase canônico quando a correção confirmar necessidade: versionar schema/funções em migrations, conferir alvo/impacto/dados/idempotência/rollback, testar em branch disponível quando viável, aplicar só a mudança necessária, consultar o resultado e executar os testes/advisors pertinentes. Corrigir dados apenas em linhas identificadas e preservar pedidos/histórico. Não enviar mensagens, emitir NF-e, criar checkout/pedido em produção, movimentar dinheiro ou estoque como smoke; prepare o código e registre o gate quando houver efeito externo.
- Ao final de cada rodada, atualizar HANDOFF com resultado comprovado, o que ficou pendente e a próxima tarefa. Desativar a recorrência quando o plano técnico estiver concluído ou restarem somente bloqueios humanos, registrando a lista final.

### Próxima tarefa de código

Diagnosticar e corrigir a aba Produtos que permanece em “Carregando…” em `/vitrine/admin/`: rastrear o POST 401 de `admin-products-live-v1` v183 pelo fluxo existente de JWT/step-up e pelo tratamento de erros no cliente; reproduzir sem salvar dados; preservar as verificações de autenticação; incluir teste de regressão para sucesso, 401 e falha de transporte; rodar o build check do runtime, os testes da área e smoke de leitura. Durante essa investigação, observar chamadas naturais a `admin1-products-read-v1` v4 e mapear o wrapper legado v2 ativo em `xaoeldjuxzsdsblimzxo` antes de mudar qualquer função. Não mudar a rota nem executar DDL antes de reconciliar o ledger divergente.

## Objetivo da programação
Concluir a migração para o desenho Operations 2.0 sem interromper o site público, usando o Bling como ERP/fonte oficial dos domínios homologados e mantendo o Vitrine/Admin como camada operacional simples.

## Estado real de partida
Já concluído ou homologado:
- fundação Control Tower: ledger, attention e approvals;
- motor canônico multicanal;
- site e Nova Venda WhatsApp usando o motor canônico;
- receiver/normalização/ponte de conversa PapoAI;
- Situações/Módulos/Transições do Bling;
- reserva oficial de estoque via situação Aprovado / Separar;
- webhook real Bling com assinatura e idempotência;
- mirror de saldo virtual por webhook;
- read model de estoque vendável;
- proteção de aprovação contra saldo virtual insuficiente;
- lançamento e estorno físico de estoque no Bling homologados por canário;
- picking 85 mm e tablet de Separação;
- Estoque Mobile auditável;
- pagamento efetivo/split e fluxo de não entrega/retorno implementados em modo de homologação.

Gates ainda deliberadamente fechados:
- `ops2_direct_order_state_enabled=false`;
- `stock_authority=legacy_shadow`;
- cutover de estoque ainda não executado;
- impressão física silenciosa ainda não homologada;
- pagamento real -> Bling/financeiro ainda bloqueado;
- fiscal definitivo ainda depende de homologação operacional/contábil.

## BLOCO A — Fechar pedido + estoque Bling
Prioridade máxima. Não iniciar limpeza estrutural antes deste bloco.

### A1 — Atualizar documentação e baseline
- registrar últimos gates já homologados;
- registrar versões atuais das Edge Functions;
- registrar flags/runtime;
- registrar último commit conhecido;
- listar os 4 produtos ativos ainda sem vínculo exato Bling;
- preservar evidência das divergências legado x saldo virtual.

Critério de saída:
- documentação representa exatamente produção;
- existe rollback explícito antes de qualquer cutover.

### A2 — Resolver cobertura do catálogo
- revisar os 4 produtos sem vínculo exato;
- vincular somente por identidade determinística (GTIN/SKU/ID confirmado);
- nunca criar vínculo aproximado automático;
- garantir cobertura do estoque vendável para todos os produtos publicáveis.

Critério de saída:
- nenhum produto publicável sem fonte de saldo segura, ou produto explicitamente bloqueado da venda.

### A3 — Cutover de leitura de estoque
- fazer site/checkout/readiness consumirem o read model de saldo vendável Bling;
- preservar shadow comparativo temporariamente;
- impedir que divergência de `products.stock` volte a autorizar venda;
- manter rollback simples para `legacy_shadow`.

Critério de saída:
- catálogo e checkout usam a mesma regra de saldo;
- produto sem saldo virtual suficiente não pode ser comprado;
- nenhum estoque negativo criado.

### A4 — Remover dupla reserva/dupla baixa
- desativar o efeito operacional legado que reserva/consome `products.stock` no novo fluxo;
- manter dados legados apenas como espelho/auditoria durante a transição;
- reserva oficial passa a ser a reserva do Bling;
- baixa física oficial passa a ocorrer uma única vez no ponto operacional homologado.

Critério de saída:
- confirmar pedido não produz dupla redução;
- cancelar/rollback libera exatamente uma reserva;
- retry é idempotente.

### A5 — Early-order Bling
- habilitar primeiro em canário;
- pedido novo deve existir no Bling em Aguardando confirmação;
- confirmação deve levar a Aprovado / Separar;
- verificar total, itens, cliente, chave externa e situação;
- preservar reconciliação e anti-duplicidade.

Critério de saída:
- 1 pedido canário ponta a ponta sem duplicação;
- rollback comprovado;
- depois pequeno lote controlado.

### A6 — Canário completo de estoque
Fluxo:
pedido -> Aguardando confirmação -> confirmação -> reserva virtual -> separação -> Verificado -> saída -> lançamento físico -> entrega/retorno conforme caso.

Validar:
- saldo virtual;
- saldo físico;
- webhooks;
- mirror;
- read model;
- idempotência;
- atenção/exceções;
- rollback.

Somente após PASS:
- `ops2_direct_order_state_enabled=true` de forma controlada;
- mudar `stock_authority` somente com evidência de cutover;
- registrar timestamp e commit do cutover.

## BLOCO B — Separação e conferência
### B1 — Tablet Separação
- validar em equipamento real;
- leitor EAN;
- estados Confirmado/Separando/Separado;
- reimpressão;
- correções/exceções.

### B2 — Impressão 85 mm
- POC de impressora física;
- foto, EAN, quantidade e localização;
- fila idempotente;
- distinguir queued/presented/printed;
- retry seguro.

### B3 — Checkout/conferência Bling
- POC com Bling Checkout;
- leitura EAN;
- conferência parcial/completa;
- mapear conclusão para Verificado;
- não reconstruir no Admin o que o Checkout resolver melhor.

## BLOCO C — Estoque operacional
### C1 — Balanço
- manter UX mobile;
- substituir efeito local definitivo por reconciliação/movimento oficial;
- diferença nunca deve ser escondida.

### C2 — Geral + Quarentena
- homologar depósitos;
- avaria/vencido/perda -> fluxo fiscal/estoque correto;
- retorno -> Quarentena até inspeção;
- sobra sem origem -> revisão, nunca entrada automática.

### C3 — Lotes/validade
- Bling como fonte de lote/saldo/validade;
- FEFO quando aplicável;
- ofertas limitadas à quantidade elegível;
- lote vencido não desativa produto inteiro se houver outro lote vendável.

## BLOCO D — Rota, entrega e pagamento
### D1 — Rotas
- canário real de `ops_delivery_runs`/`ops_delivery_stops`;
- ordenação e edição antes da saída;
- impedir pedido duplicado em rota;
- futura entrada de pins/localizadores WhatsApp.

### D2 — Entregador
- validar tablet/celular;
- pedido, cliente, telefone, endereço, Maps, observações;
- entregue/não entregue;
- retorno físico;
- reentrega.

### D3 — Pagamento efetivo
- validar PIX, dinheiro, crédito, alimentação/refeição;
- split de duas formas na UI;
- total deve fechar exatamente;
- sincronizar recebimento real ao Bling somente após homologação;
- nunca tratar forma prevista no pedido como pagamento efetivo.

## BLOCO E — Fiscal e financeiro
- fechar regra com contador para entrega domiciliar;
- NF-e/DANFE no ponto correto;
- retorno de mercadoria e recusa;
- perdas/avarias/vencimentos;
- contas a receber;
- conciliação do pagamento efetivo;
- refund/reembolso;
- nenhum fluxo fiscal destrutivo automático sem gate específico.

## BLOCO F — Compras/XML
- preservar rotina atual enquanto substituto não estiver homologado;
- priorizar recursos nativos Bling/SEFAZ/Check-in;
- XML CPF sem financeiro empresarial;
- conversão caixa -> unidade determinística;
- fornecedores/custos;
- devolução a fornecedor;
- remover customização apenas depois de equivalência comprovada.

## BLOCO G — PapoAI multicanal
- mapear somente eventos estruturados confiáveis;
- botão/Flow -> draft versionado;
- texto livre não cria pedido automaticamente;
- confirmação converge para motor canônico;
- pós-venda e recompra entram depois do fluxo operacional principal estável.

## BLOCO H — Control Tower
- completar cards e fila Precisa de você;
- approvals reais;
- timeline;
- saúde das integrações;
- estoque crítico;
- pedidos parados;
- exceções fiscais/financeiras;
- copiloto sob demanda, sem IA decidindo regra crítica.

## BLOCO I — Segurança e perfis
- Owner;
- Supervisor;
- Operador;
- Entregador;
- automações/service role;
- eliminar dependência de perfil/PIN compartilhado;
- princípio do menor privilégio.

## BLOCO J — Limpeza final
Executar somente quando substitutos estiverem homologados:
- Edge Functions históricas;
- tabelas sem uso;
- triggers legados;
- crons inúteis;
- rotas antigas;
- código morto;
- documentação histórica redundante.

Nunca apagar apenas porque parece antigo. Antes da remoção:
1. procurar referências no código;
2. conferir runtime;
3. conferir banco;
4. confirmar substituto;
5. registrar rollback/backup quando aplicável.

# REGRA OBRIGATÓRIA DE CONTINUIDADE E REGISTRO

Esta regra é parte do projeto e deve ser obedecida em TODA rodada de programação, inclusive quando o trabalho for feito em outro chat.

## Antes de programar
1. Ler `HANDOFF.md`.
2. Ler este `IMPLEMENTATION-ROADMAP.md`.
3. Conferir o estado real no GitHub e Supabase.
4. Conferir commits posteriores à última anotação.
5. Não assumir que o histórico do chat é a fonte de verdade.
6. Identificar o gate exato que está sendo trabalhado e o rollback.

## Durante a rodada
Registrar continuamente fatos importantes; não esperar o final se houver risco de perder contexto:
- arquivos alterados;
- migrations aplicadas;
- Edge Functions publicadas e versões;
- flags/runtime alterados;
- testes executados;
- IDs de canário quando necessários;
- resultados observados;
- erros encontrados;
- correções;
- decisões arquiteturais;
- pendências externas/humanas.

## Antes de encerrar qualquer rodada importante
É OBRIGATÓRIO atualizar `HANDOFF.md` e, quando afetado, este roadmap e/ou `HOMOLOGATION-STATUS.md`.

O checkpoint deve conter no mínimo:
- data/hora ou data da rodada;
- objetivo;
- o que foi realmente programado;
- o que foi realmente publicado/aplicado;
- commit(s);
- migrations;
- versões de funções;
- estado das flags;
- testes e evidências;
- PASS/FAIL de cada gate;
- problemas conhecidos;
- rollback disponível;
- o que NÃO foi feito;
- próximo passo exato;
- eventual ação manual necessária.

## Regra de segurança de retomada
Nenhuma rodada deve depender da memória de uma conversa do ChatGPT.

Se um chat travar, fechar ou for substituído, a retomada deve ser possível apenas com:
1. repositório;
2. Supabase/runtime;
3. `HANDOFF.md`;
4. `IMPLEMENTATION-ROADMAP.md`;
5. `HOMOLOGATION-STATUS.md`;
6. commits/logs.

## Regra de conclusão
Uma etapa NÃO está concluída apenas porque o código foi escrito.
Só marcar como concluída quando houver:
- código versionado;
- migration/deploy quando necessário;
- teste;
- evidência;
- rollback conhecido;
- documentação atualizada.

## Comando padrão de retomada
> Retome Dona Antônia Operations 2.0. Leia `docs/projects/dona-antonia-operations-2/HANDOFF.md`, `IMPLEMENTATION-ROADMAP.md` e `HOMOLOGATION-STATUS.md`. Confirme o estado real no GitHub e Supabase e compare os commits posteriores à última anotação. Continue exatamente do próximo gate registrado. Não confie apenas no histórico do chat e não faça limpeza antes de homologar o substituto.


## PLANO AUTÔNOMO DE FECHAMENTO — 12 RODADAS LONGAS — 2026-09-26

Regra desta sequência: R1 inicia imediatamente; R2–R12 avançam em cadência horária por agendamento/encadeamento automático. Bloqueios que exijam presença, decisão ou evidência física do proprietário não interrompem o trabalho seguro: devem ser acumulados nos documentos canônicos e consolidados em uma única lista operacional ao final da R12. Não usar Make. Não mutar pedidos legados. Não inventar evidência física/fiscal/financeira.

1. **R1 — baseline + invariantes Entregador/rota:** consolidar os gates já implementados de pagamento exato antes de delivered e sincronização pedido↔parada↔rota; revisar continuidade, documentação e lacunas seguras antes das próximas ondas.
2. **R2 — pagamento real/split → Bling em shadow:** formas, contas, recebimentos, idempotência, reconciliação, retry e anti-duplicidade; nenhum lançamento real não homologado.
3. **R3 — falha de entrega/retorno/reentrega/cancelamento:** retorno físico, inspeção, avaria/perda, reversões e proteção contra dupla restauração de estoque.
4. **R4 — fiscal operacional NF-e/DANFE:** gate de expedição, autorização SEFAZ, DANFE, erros/retry, vínculo pedido/NF, pagamento efetivo e representação de cesta/diferença; emissão automática continua OFF até homologação.
5. **R5 — estoque Bling/cutover readiness:** writers, triggers, read models, estoque físico/virtual, baixa/reversão idempotente, 14 blockers de recontagem e recuperação do SQL canônico/reprodutível; sem cutover global.
6. **R6 — lotes/validade/FEFO/ofertas:** saldo elegível por lote, faixas 10%/20%/40%, vencidos e integração vitrine/admin sem desativar produto com outro lote vendável.
7. **R7 — compras/XML/fornecedores/caixa→unidade:** rotina diária + manual, CPF sem financeiro, CNPJ financeiro apenas validado, conversões determinísticas, custos, idempotência e aproveitamento Bling/Check-in quando comprovado.
8. **R8 — PapoAI/WhatsApp operacional:** identidade, link personalizado, Flow, cliente, pedido, histórico e eventos estruturados; robustez/idempotência sem reintroduzir inteligência de atendimento no Admin.
9. **R9 — UX operacional das cinco superfícies:** Central, Pedidos/Nova Venda WhatsApp, Tablet Separação, Estoque Mobile e Entregador; mobile, acessibilidade, estados, mensagens e redução de cliques sem duplicar ERP.
10. **R10 — hardening técnico:** GitHub↔Supabase/runtime, RLS/advisors, segurança, performance, custo, Edge Functions, RPCs, triggers, jobs, flags, duplicações e reprodutibilidade.
11. **R11 — ensaio integrado amplo:** site→checkout→pedido→Bling→EAN→fiscal→estoque→expedição→rota→entregador→pagamento→entrega/retorno; corrigir lacunas seguras e regressões.
12. **R12 — auditoria final/readiness:** fechar correções seguras restantes, smoke tests/advisors, estado final e lista única ordenada de todas as ações humanas necessárias para a próxima fase de homologação/cutover.

### Gate pós-R12
Após a R12, pausar novas ondas de implementação que dependam de evidência humana. O proprietário executa a lista consolidada (contagens, equipamento físico, autorizações/canários/cutovers que realmente exijam presença). Só então uma nova sequência de rodadas deve ser planejada com base nas evidências obtidas.

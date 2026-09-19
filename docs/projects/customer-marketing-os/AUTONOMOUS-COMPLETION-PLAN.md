# AUTONOMOUS COMPLETION PLAN — Customer & Marketing OS

Atualizado em 18/09/2026.

Objetivo: esgotar toda programação, teste, hardening, observabilidade e documentação da CM-1 que possa ser concluída sem interação humana, sem ativação externa e sem fabricar evidência.

## Estado de partida

- CM-1: 20 critérios;
- verified: 15;
- implemented aguardando evidência/gate: 5;
- blocked: 0;
- safe_for_internal_homologation=true;
- external_activation_authorized=false;
- Meta Direct OFF;
- canonical outbound OFF;
- publishing OFF;
- strategy AI OFF;
- canary externo 0%;
- Make não é runtime.

Critérios ainda não verificados:
- 2 Identity Resolver — conflitos reais exigem revisão humana;
- 7 Product View — collector pronto, 0 product_view real;
- 13 Opportunity Lifecycle — aguardando lifecycle natural;
- 15 Marketing Brain SUGGEST — gate fechado;
- 18 AI cost measured — ledger pronto, sem execução governada real.

## Regra geral das rodadas

Cada rodada deve:

1. reler HANDOFF.md e CURRENT-STATE.md;
2. confirmar HEAD antes de editar;
3. preservar trabalho paralelo;
4. consultar os RPCs canônicos antes de assumir números;
5. programar o maior bloco seguro possível;
6. executar testes e checks aplicáveis;
7. não abrir gates externos;
8. não fabricar evidência;
9. não resolver identidade automaticamente;
10. atualizar CURRENT-STATE.md e HANDOFF.md ao final.

## Rodada 06 — Regressão, CI e consistência canônica

Objetivo:
- validar toda a suíte Customer OS no HEAD atual;
- identificar asserts/cache/versionamentos desatualizados;
- alinhar documentação canônica com runtime real;
- remover apenas inconsistências técnicas seguras;
- garantir que migrations novas do observador, Vault e lifecycle estejam cobertas por CI;
- verificar que nenhuma mudança paralela quebrou Customer OS.

Saída esperada:
- CI conhecido;
- testes Customer OS verdes ou falhas corrigidas;
- docs canônicos coerentes com 15/5/0;
- nenhuma mudança externa.

## Rodada 07 — Hardening da Central de Relacionamento

Objetivo:
- concluir UX de homologação sem depender de PIN do responsável;
- melhorar painel de evidências;
- separar claramente “programado”, “aguardando evidência real” e “ação humana”;
- exibir readiness Meta/token/callback/permissões sem ambiguidades;
- melhorar estados loading/erro/vazio;
- revisar mobile/desktop por contrato estático e acessibilidade;
- adicionar botão apenas de refresh/read-only quando seguro;
- não criar ações de ativação.

Saída esperada:
- Central pronta para uso humano final;
- nenhum gate sensível exposto;
- testes UI atualizados.

## Rodada 08 — Meta Direct preflight completo sem credencial humana

Objetivo:
- esgotar tudo que pode ser preparado sem o System User token;
- validar contrato de leitura do Vault;
- validar scopes esperados;
- validar callback esperado;
- validar WABA/Phone ID/Graph version;
- reforçar fail-closed;
- melhorar persistência/auditoria de diagnóstico;
- criar testes para respostas Meta de sucesso, token ausente, token inválido, scope ausente e callback divergente usando mocks/fixtures locais;
- garantir que diagnóstico nunca execute POST ou envio.

Saída esperada:
- depois desta rodada, a única pendência Meta técnica deve ser fornecer a credencial e executar a checagem humana/read-only;
- Meta Direct continua OFF.

## Rodada 09 — Identity Review: preparação final humana

Objetivo:
- revisar a fila de conflitos e a UX de comparação;
- melhorar evidências exibidas para cada candidato;
- mascarar dados sensíveis;
- exigir justificativa;
- impedir auto-merge;
- garantir auditoria append-only da decisão;
- adicionar testes de aprovação/rejeição usando fixtures técnicas, sem tocar nos casos reais;
- garantir que decisão humana real possa ser feita em poucos cliques.

Saída esperada:
- não sobra programação de Identity Resolver;
- casos reais continuam pendentes até decisão humana.

## Rodada 10 — Comprar / Product View / Event Collector

Objetivo:
- provar tecnicamente que o frontend publicado contém instrumentação atual;
- validar cache busting;
- validar clique de detalhe -> track -> Edge Function -> RPC por testes não-operacionais;
- cobrir deduplicação, room token, produto inexistente, reload e navegação;
- revisar que catalog_search já está correto;
- não inserir product_view real artificial.

Saída esperada:
- critério 7 ficará dependendo exclusivamente de uma abertura real de produto;
- nenhuma dúvida técnica de deploy/instrumentação permanece.

## Rodada 11 — Opportunity Lifecycle e observabilidade temporal

Objetivo:
- revisar sem mutação artificial as regras de suggested/suppressed/dismissed/converted/expired;
- testar lifecycle com fixtures transitórias/rollback ou testes puros que não persistam evidência;
- validar próxima expiração e relógio;
- criar alerta/read model para oportunidade vencida ainda aberta;
- garantir promoção automática do critério 13 apenas com estado real persistido;
- não antecipar expiração real.

Saída esperada:
- critério 13 dependerá somente do lifecycle natural real.

## Rodada 12 — Marketing Brain e custo de IA sem ativar IA externa

Objetivo:
- validar completamente OBSERVE/SUGGEST por contrato, mocks e fixtures locais;
- validar budget, limite diário, kill switch, idempotência e ledger;
- validar cálculo/registro de custo estimado e real por execução usando dados sintéticos de teste;
- garantir deterministic-first;
- garantir que nenhuma chamada OpenAI real seja necessária para os testes;
- manter strategy_ai_enabled=false, max_daily_calls=0 e budget=0 no runtime.

Saída esperada:
- critérios 15 e 18 ficam tecnicamente prontos;
- a única pendência para evidência real é um futuro gate humano de IA/custo, se realmente necessário.

## Rodada 13 — Auditoria final de segurança e legado

Objetivo:
- auditar dependências de automation_config legado sem limpar flags perigosamente;
- confirmar 0 outbound canônico;
- confirmar PapoAI outbound OFF;
- confirmar templates runtime OFF;
- confirmar Meta Direct OFF;
- confirmar publishing OFF;
- confirmar no browser bundle ausência de secrets;
- revisar RLS/RBAC/service_role boundaries;
- revisar funções Edge e migrations deste projeto;
- revisar que Make não virou dependência operacional;
- corrigir somente problemas seguros encontrados.

Saída esperada:
- nenhuma pendência técnica autônoma conhecida.

## Rodada 14 — Freeze de programação autônoma e pacote para o responsável

Objetivo:
- reexecutar checklist/readiness/evidence;
- rodar CI final;
- consolidar estado em CURRENT-STATE.md e HANDOFF.md;
- criar HUMAN-ACTIONS-FINAL.md com uma lista única, ordenada e simples das ações que dependem do responsável;
- criar FINAL-AUTONOMOUS-CHECKLIST.md mostrando tudo que foi esgotado sem interação humana;
- registrar os critérios que ainda aguardam evidência/gate;
- não declarar CM-1 concluída se gates/evidências ainda faltarem.

Saída esperada:
- programação autônoma da CM-1 considerada esgotada;
- próximas rodadas horárias passam a ser somente observação read-only até surgir evidência real ou o responsável executar ações humanas;
- nenhuma CM-2 é criada automaticamente.

## Ações humanas esperadas depois da Rodada 14

A lista final deve ser recalculada pelo runtime, mas hoje inclui:

1. revisar manualmente conflitos de identidade reais;
2. abrir um produto real no Comprar para gerar product_view real;
3. obter/configurar System User token WhatsApp no Vault;
4. executar Meta Foundation -> Verificar Meta agora;
5. validar PIN/interface da Central no navegador;
6. revisar/aceitar Meta Policy Registry como gate humano;
7. homologar callback Meta Direct quando a credencial permitir;
8. decidir explicitamente se haverá execução real governada de SUGGEST/IA para evidência e custo;
9. autorizar separadamente qualquer ativação externa futura.

## Definition of done da programação autônoma

A programação autônoma está concluída quando:

- Rodadas 06 a 14 estiverem executadas ou justificadamente marcadas “sem mudança necessária”;
- CI conhecido e sem regressão Customer OS;
- nenhum blocker técnico autônomo restar;
- todos os gates externos continuarem fechados;
- HUMAN-ACTIONS-FINAL.md existir;
- HANDOFF.md e CURRENT-STATE.md refletirem o runtime real;
- qualquer item ainda pendente depender genuinamente de ação humana ou evidência orgânica real.

# App Dona Antônia — Status do Projeto

**Estado operacional:** OFF / ISOLADO / NÃO PUBLICADO  
**Uso por clientes:** PROIBIDO  
**Integração com Comprar atual:** DESATIVADA  
**Integrações externas reais:** DESATIVADAS  
**Pedidos reais:** PROIBIDOS  
**Push para clientes reais:** PROIBIDO

## Regras de isolamento vigentes
- desenvolvimento do novo aplicativo em `app-dona-antonia/`; `comprar/` não modificar;
- produção, pedidos reais, push real e executores externos OFF;
- sem Bling, Meta, PapoAI, logística ou dados reais; somente fixtures/IDs `TEST-*`;
- não apagar Edge Functions nem aumentar plano/spend cap;
- não publicar em Play Store/App Store/TestFlight;
- Android/iOS só homologados após build/teste nativo real.

## Estado consolidado
**Concluídas:** R0–R9 e R20.  
**Parciais seguras:** R12–R19 e R21–R24.  
**Bloqueios:** R10/R11 toolchain/build nativo; R13 deploy por quota; R25 produção proibida.  
**PR:** #396 Draft — NÃO MERGEAR.

## Plano autônomo A1–A9
- A1 baseline/suíte: concluída programaticamente; execução integral depende de runner/dependências.
- A2 fail-closed central: concluída.
- A3 sessão/pairing: concluída até limite não nativo.
- A4 deep links/notificações: concluída até limite não nativo.
- A5 mídia/privacidade/dados locais: esgotada programaticamente até limite nativo.
- A6 HML/backend: **esgotada programaticamente sem deploy**.
- A7 UX/acessibilidade/offline/desempenho: **próxima**.
- A8–A9: pendentes.

## Checkpoint A6 — 19/09/2026
A6 fecha preflight, request/idempotência e contratos de bootstrap/catalog/checkout/pairing/telemetria/privacidade. Pairing exige challenge e sessão `TEST-*`, não consumidos e não expirados. Telemetria exige evento sintético e proíbe PII, texto livre, advertising ID e sink externo. Privacidade aceita somente acesso/exclusão do mesmo subject sintético e zero escrita externa. Testes unitários correspondentes foram versionados.

### Validação honesta
Nenhum deploy, migration, executor, pedido ou push foi acionado. Os testes versionados não são declarados verdes sem runner/typecheck real associado ao HEAD. Quota permanece bloqueio válido; não será contornada com exclusão de funções ou aumento de custo.

## Próximo trabalho seguro
1. executar A7: UX, acessibilidade, offline e desempenho;
2. depois A8 release/store/native readiness somente documental/preflight;
3. em A9 criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`; `PROGRAMMATIC_COMPLETE=true` somente se nenhuma tarefa segura independente restar.

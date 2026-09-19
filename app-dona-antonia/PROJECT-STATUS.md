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
- A6 HML/backend: esgotada programaticamente sem deploy.
- A7 UX/acessibilidade/offline/desempenho: esgotada programaticamente até limite de browser/aparelho.
- A8 release/store/native readiness: esgotada documentalmente até limite nativo/humano.
- A9 auditoria final: **próxima**.

## Checkpoint A8 — 19/09/2026
A auditoria estática A7 não deixou tarefa independente adicional identificada; medições e acessibilidade restantes exigem browser/aparelho real. A8 consolidou `STORE-RELEASE-READINESS.md` com gates Android/iOS, assinatura, metadata, reviewer TEST, privacy/data-safety e evidências exigidas. O preflight nativo continua fail-closed e Android/iOS continuam explicitamente não homologados.

### Validação honesta
Testes/typecheck não são declarados verdes sem runner associado ao HEAD. Nenhum build Gradle/Xcode, APK/AAB/IPA, console de loja, TestFlight, publicação, deploy, pedido, push ou integração externa foi acionado.

## Próximo trabalho seguro
Executar A9: auditoria final da branch e dos gates, corrigir qualquer restante seguro, criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md` e somente então avaliar `PROGRAMMATIC_COMPLETE=true`.

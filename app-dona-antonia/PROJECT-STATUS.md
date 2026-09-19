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
- A7 UX/acessibilidade/offline/desempenho: **avançada; fechamento programático em andamento**.
- A8–A9: pendentes.

## Checkpoint A7 — 19/09/2026
A base já preserva viewport mínimo de 320px, touch targets primários de 44px, foco visível, reduced motion, contraste forçado e estados loading/empty/error/offline. `uxReadiness.ts` adiciona recovery determinístico e limitado para offline/error, budgets explícitos de JS/CSS/imagem crítica e contrato de acessibilidade para tamanho, label e teclado. Testes unitários correspondentes foram versionados.

### Validação honesta
Os testes novos não são declarados verdes sem runner/typecheck real associado ao HEAD. Leitor de tela, teclado real, métricas de performance e comportamento nativo exigem execução em ambiente/dispositivo apropriado. Nenhum deploy, pedido, push ou integração externa foi acionado.

## Próximo trabalho seguro
1. fechar auditoria estática restante da A7;
2. executar A8 release/store/native readiness somente documental/preflight;
3. em A9 criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`; `PROGRAMMATIC_COMPLETE=true` somente se nenhuma tarefa segura independente restar.

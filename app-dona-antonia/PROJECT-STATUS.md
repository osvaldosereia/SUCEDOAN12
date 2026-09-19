# App Dona Antônia — Status do Projeto

**Estado operacional:** OFF / ISOLADO / NÃO PUBLICADO  
**Uso por clientes:** PROIBIDO  
**Integração com Comprar atual:** DESATIVADA  
**Integrações externas reais:** DESATIVADAS  
**Pedidos reais:** PROIBIDOS  
**Push para clientes reais:** PROIBIDO

> Histórico detalhado das Rodadas 0–24 permanece no Git. Este arquivo mantém o checkpoint operacional consolidado.

## Regras de isolamento vigentes
- todo desenvolvimento do novo aplicativo fica em `app-dona-antonia/`;
- `comprar/` não pode ser modificado;
- produção, pedidos reais, push real e executores externos permanecem OFF;
- sem Bling, Meta, PapoAI, logística ou dados reais de clientes;
- somente fixtures/IDs `TEST-*` e homologação;
- não apagar Edge Functions para liberar quota e não aumentar plano/spend cap;
- não publicar em Play Store/App Store/TestFlight;
- Android/iOS só podem ser marcados homologados após build/teste nativo real.

## Estado consolidado
**Concluídas:** R0–R9 e R20.  
**Parciais seguras:** R12–R19 e R21–R24.  
**Bloqueios:** R10/R11 toolchain/build nativo; R13 deploy por quota; R25 produção proibida.  
**PR:** #396 Draft — NÃO MERGEAR.

## Plano autônomo A1–A9
- A1 baseline/suíte: programaticamente concluída; execução integral depende de runner/dependências.
- A2 fail-closed central: concluída.
- A3 sessão/pairing: concluída até limite não nativo.
- A4 deep links/notificações: concluída até limite não nativo.
- A5 mídia/privacidade/dados locais: **esgotada programaticamente até limite nativo**; permissões/pickers/EXIF efetivo dependem de build/teste nativo.
- A6 HML/backend: **em andamento seguro, sem deploy**.
- A7–A9: pendentes.

## Checkpoint A6 — 19/09/2026
A6 possui preflight de backend, segurança de request/idempotência e agora contratos estáticos `hmlBoundaryContracts.ts` para bootstrap/catalog/checkout. Todos falham fechado fora de homologação ou diante de subject/recurso não `TEST-*`. Bootstrap proíbe request externo; catálogo valida shape, IDs e centavos; checkout exige carrinho/operação/idempotência/produtos sintéticos, carrinho não vazio e total autoritativo idêntico ao apresentado. Testes unitários correspondentes foram adicionados.

### Validação honesta
Nenhum deploy, migration ou executor foi acionado. Os testes foram versionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. A quota continua sendo bloqueio válido e não será contornada apagando funções ou aumentando custo.

## Próximo trabalho seguro
1. continuar A6 em contratos pairing/telemetria/privacidade e revisão final das fronteiras HML sem deploy;
2. esgotada A6, avançar A7, A8 e A9 sequencialmente;
3. em A9 criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`; só definir `PROGRAMMATIC_COMPLETE=true` se nenhuma tarefa segura independente restar.

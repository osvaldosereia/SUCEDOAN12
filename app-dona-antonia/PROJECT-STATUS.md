# App Dona Antônia — Status do Projeto

**Estado operacional:** OFF / ISOLADO / NÃO PUBLICADO  
**Uso por clientes:** PROIBIDO  
**Integração com Comprar atual:** DESATIVADA  
**Integrações externas reais:** DESATIVADAS  
**Pedidos reais:** PROIBIDOS  
**Push para clientes reais:** PROIBIDO

> Histórico detalhado das Rodadas 0–24 permanece no Git. Este arquivo passa a manter o checkpoint operacional consolidado para evitar divergência de handoffs extensos.

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
- A5 mídia/privacidade/dados locais: **parcial avançada**.
- A6–A9: pendentes.

## Checkpoint A5 — 19/09/2026
Já existia `localMediaVault.ts`, cofre efêmero somente de metadados com IDs `TEST-MEDIA-*`, MIME/tamanho/TTL/retenção fechados e zero bytes/texto/filename/URL persistidos.

Nesta continuação foram adicionados:
- `src/platform/mediaPrivacyPolicy.ts`: contrato puro de fronteira para Photo Picker/câmera/microfone; valida source/MIME, limite de 8 MiB e áudio <=120 s; determina `strip-exif-before-boundary`; não recebe bytes, filename, URL nem texto do cliente;
- `src/privacy/localPrivacyRights.ts`: acesso e eliminação locais somente para `TEST-SUBJECT-*` + `TEST-MEDIA-*`; metadados são imutáveis e correção exige apagar/recriar;
- `tests/unit/mediaPrivacyPolicy.test.ts`;
- `tests/unit/localPrivacyRights.test.ts`.

### Validação honesta
Os testes foram versionados, mas nesta execução não houve runner/typecheck real associado ao HEAD; portanto não são declarados verdes. Permissões nativas, pickers, stripping EXIF efetivo e comportamento em aparelho continuam explicitamente bloqueados até implementação/build/teste Android/iOS real.

## Próximo trabalho seguro
1. concluir apenas o restante programático de A5 que não dependa de dispositivo;
2. avançar A6 em contratos/manifest/checklists HML/backend sem deploy, quota nova ou produção;
3. depois A7, A8 e A9 sequencialmente;
4. em A9 criar `docs/homologation/HUMAN-ACTIONS-FINAL.md` e `FINAL-AUTONOMOUS-CHECKLIST.md`; só definir `PROGRAMMATIC_COMPLETE=true` se nenhuma tarefa segura independente restar.

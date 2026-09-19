# App Dona Antônia — HANDOFF

**Branch:** `app-dona-antonia-r0-isolation`  
**PR:** #396 — Draft — **NÃO MERGEAR**  
**Estado:** OFF / HOMOLOGAÇÃO / ISOLADO / NÃO PUBLICADO

## Ordem de retomada
1. Este arquivo.
2. `app-dona-antonia/docs/homologation/AUTONOMOUS-COMPLETION-PLAN.md`.
3. `app-dona-antonia/PROJECT-STATUS.md`.
4. `docs/projects/APP-DONA-ANTONIA-MASTER.md` quando necessário.

## Estado consolidado
- concluídas: R0–R9 e R20;
- parciais seguras: R12–R19 e R21–R24;
- R10/R11 bloqueadas até toolchain/build nativo real;
- R13 deploy bloqueado por quota;
- R25 produção proibida;
- plano autônomo: A1–A4 concluídas; A5 avançada e parcial até validação/implementação nativa de permissões, pickers e stripping efetivo de metadados.

## Último avanço seguro — A5
Além de `localMediaVault.ts`, foram adicionados `mediaPrivacyPolicy.ts` e `localPrivacyRights.ts`. A fronteira de mídia aceita apenas `TEST-MEDIA-*`, valida origem/MIME, tamanho e áudio de no máximo 120 s, e determina stripping de EXIF antes de qualquer futura fronteira nativa/backend. O contrato nunca recebe bytes, filename, URL ou texto do cliente. Direitos locais sintéticos de acesso e eliminação exigem `TEST-SUBJECT-*`; metadados de mídia são imutáveis e correção exige apagar/recriar.

Foram adicionados testes unitários para EXIF policy, source/MIME, duração, IDs reais fail-closed, acesso, eliminação e imutabilidade. **Validação honesta:** código/testes foram commitados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Fechar o restante programático de A5 que não dependa de dispositivo; manter permissões/pickers/EXIF efetivo como bloqueio nativo explícito.
2. Avançar A6 — HML/backend preparado para deploy sem aumentar quota e sem tocar produção.
3. Manter R10/R11 e R25 fechadas.

## Regras soberanas
- não modificar `comprar/`;
- não mergear PR #396;
- produção/pedidos/push/executores reais OFF;
- sem Bling, Meta, PapoAI ou logística;
- sem dados reais de clientes;
- sem apagar Edge Functions ou aumentar plano/spend cap;
- sem publicação/submissão em lojas;
- sem declarar Android/iOS homologados sem build/teste real.

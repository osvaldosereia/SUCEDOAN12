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
- plano autônomo: A1–A4 concluídas; A5 avançada nesta rodada e permanece parcial até validação nativa de permissões/pickers.

## Último avanço seguro — A5
Foi criado `src/platform/localMediaVault.ts`, cofre efêmero e somente de metadados para mídia HML. Ele nunca persiste bytes, texto do cliente, filename ou URL externa; aceita apenas `TEST-MEDIA-*`, MIME fechado, tamanho máximo de 8 MiB, TTL curto, limite de entradas, limpeza automática/explicita e passa pelo `homologationGuard` antes de aceitar registros.

Foi adicionado `tests/unit/localMediaVault.test.ts`, cobrindo expiração, limite de retenção, limpeza explícita, produção/IDs reais fail-closed, MIME não permitido e tamanho excessivo. Isso reduz risco de retenção acidental enquanto Photo Picker/câmera/microfone e storage nativo aguardam build/teste em dispositivo.

**Validação honesta:** código/testes foram adicionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. Continuar A5 em política de EXIF/anexos, revogação e contratos de acesso/correção/exclusão que possam ser testados sem dispositivo.
2. Depois A6 — HML/backend preparado para deploy sem aumentar quota.
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

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
- plano autônomo: A1–A4 programaticamente concluídas até o limite não nativo; próxima A5.

## Último avanço seguro — A4
Deep links/notificações foram fechados sem rede real. `urlPolicy` agora rejeita qualquer URL absoluta que não seja HTTPS, além das proteções existentes contra credenciais, PII e material de sessão. `appLinks` continua exigindo allowlist explícita para host absoluto e roteia apenas destinos internos determinísticos.

Foi criado `notificationRouter.ts`: aceita apenas IDs opacos `TEST-NOTIFICATION-*`, valida o deep link antes de consumir o ID, deduplica mensagens aceitas com memória limitada e não executa rede/push. Foram adicionados `notificationRouter.test.ts` e `urlPolicySafety.test.ts`. Push permanece sintético (`TEST-PUSH-*`) com preferências locais transacional/marketing.

**Validação honesta:** código/testes foram adicionados, mas não são declarados verdes sem runner/typecheck real associado ao HEAD. Nenhuma homologação Android/iOS foi inferida.

## Próximo trabalho seguro
1. A5 — mídia, privacidade e dados locais: revisar contratos Photo Picker/câmera/microfone, EXIF, anexos, revogação/limpeza e direitos de acesso/correção/exclusão.
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

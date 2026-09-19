# App Dona Antônia — HML Backend Deploy Manifest

**Estado:** PREPARADO / NÃO DEPLOYADO / PRODUÇÃO OFF

Este manifesto é uma barreira operacional para a Rodada A6. Ele não autoriza deploy e não comprova homologação.

## Invariantes obrigatórias
- ambiente alvo exclusivamente `homologation`;
- IDs, sujeitos, sessões, mídia, pairing e notificações exclusivamente `TEST-*`;
- `productionEnabled=false`;
- pedidos reais, push real e executores externos desabilitados;
- nenhuma chamada a Bling, Meta, PapoAI ou logística;
- nenhuma migração destrutiva;
- nenhuma Edge Function existente pode ser apagada para liberar quota;
- nenhum aumento de plano/spend cap;
- rollback deve existir antes de qualquer futura aplicação de migration;
- logs/telemetria não podem conter PII, segredo, token, texto livre de cliente ou bytes de mídia.

## Gate de migrations
Antes de uma futura execução humana/CI em HML:
1. enumerar migrations pendentes e revisar SQL;
2. rejeitar `DROP`, `TRUNCATE`, remoção/relaxamento de RLS ou operação irreversível sem rollback explícito;
3. validar constraints de quantidade, preço e total no servidor;
4. garantir idempotency key para mutações de checkout/pairing;
5. garantir rate limit fail-closed nas fronteiras mutáveis;
6. executar somente contra projeto HML identificado explicitamente;
7. capturar evidência do resultado e do rollback testado.

## Contratos HML que devem permanecer fechados
### Bootstrap/catalog
Somente leitura HML, payload versionado, schema validado, timeout explícito e sem fallback para produção.

### Carrinho/checkout
O cliente nunca é autoridade do total. O servidor deve recalcular total a partir de catálogo HML, rejeitar produto/quantidade/preço inválidos e deduplicar mutações por chave de idempotência. Nenhum pedido real pode ser criado nesta fase.

### Pairing/sessão
Challenges expiram, têm limite de tentativas e uso único. Tokens de fixture devem usar `TEST-SESSION-*`; armazenamento nativo real permanece fora deste gate até build/teste em aparelho.

### Telemetria/privacidade
Registro fechado de eventos, redaction antes do sink e proibição de PII/segredos/texto livre. Direitos sintéticos de acesso/eliminação usam apenas `TEST-SUBJECT-*`.

## Quota
Se o projeto HML não comportar novas Edge Functions, o resultado correto é **BLOCKED_QUOTA**. Não apagar funções, não substituir funções de outro projeto e não aumentar custo.

## Critério de saída A6
A6 pode ser marcada programaticamente preparada quando contratos, manifestos e testes estáticos/sintéticos estiverem versionados. Deploy, migration aplicada e teste integrado real continuam bloqueios externos até evidência real.

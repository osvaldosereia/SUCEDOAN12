# Preflight — Central WhatsApp própria via Meta Cloud API

Use este checklist antes de qualquer deploy, migration aplicada em produção ou canário real.

## Segurança

- [ ] Tokens temporários expostos foram revogados.
- [ ] Token de produção está somente server-side.
- [ ] App Secret está somente server-side.
- [ ] Verify token do webhook está somente server-side.
- [ ] `node scripts/test-whatsapp-meta-no-secrets-v1.mjs` passa.
- [ ] Nenhum segredo aparece no frontend ou documentação.

## Git / branch

- [ ] Trabalho está fora de `main`.
- [ ] Branch está sincronizado com o `main` relevante.
- [ ] Diff foi revisado.
- [ ] Checkout/site público não foi alterado.

## Supabase

- [ ] Projeto confirmado: `ssbesxgaijknwsjbsbcz`.
- [ ] Runtime 0975 conferido.
- [ ] Runtime 1018 conferido.
- [ ] `human_send_enabled=false` antes de canário.
- [ ] `homologated_at=null` antes de canário.
- [ ] Outbox `human_attendance` sem itens inesperados.
- [ ] Provider da outbox aceita `meta`.
- [ ] Provider do runtime aceita `meta`.

## Meta

- [ ] 1018 WABA: `840102181903253`.
- [ ] 1018 Phone Number ID: `1218939807961094`.
- [ ] 0975 WABA: `1497253794754816`.
- [ ] 0975 Phone Number ID: `945659128620084`.
- [ ] App próprio: `1547249776748513`.
- [ ] Permissões oficiais necessárias confirmadas.
- [ ] Subscription correta confirmada antes de ativar inbound próprio.

## Código / testes

- [ ] Teste RED foi observado antes da implementação da feature.
- [ ] Teste específico da mudança passa.
- [ ] Testes existentes relacionados passam.
- [ ] Idempotência está coberta.
- [ ] Janela de 24h está coberta.
- [ ] Destino é resolvido server-side.
- [ ] Provider é resolvido server-side.
- [ ] Rate limit está coberto.
- [ ] Nenhum retry cego para resultado incerto.

## Canário futuro

- [ ] Começar pelo 1018.
- [ ] Usar somente contato/número autorizado para teste.
- [ ] Ativar um canal por vez.
- [ ] Confirmar Graph accepted + `wamid`.
- [ ] Confirmar mensagem canônica no Supabase.
- [ ] Confirmar entrega no destinatário.
- [ ] Confirmar status/reconciliação.
- [ ] Confirmar zero duplicidade.
- [ ] Confirmar rollback funcionando.

## Rollback pronto

- [ ] Comando/procedimento para `human_send_enabled=false` conhecido.
- [ ] Fallback PapoAI continua disponível.
- [ ] Logs/correlation IDs preservados.
- [ ] Nenhuma etapa de rollback depende do checkout público.

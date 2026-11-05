# Atendimento: mensagens interativas — Plano

> Plano derivado de `docs/superpowers/specs/2026-10-27-attendance-interactive-messages-design.md`. Execução inline; nenhuma escrita remota.

**Objetivo:** enviar botões de resposta e listas nativas da Cloud API no atendimento humano, com contrato tipado e controles server-side.

**Arquitetura:** Admin → Server Action autenticada → Edge Function `admin-whatsapp-interactive-send-v1` → RPCs privadas de enqueue/claim/accept → Graph API Meta. Todas as decisões de canal, identidade e elegibilidade ficam no servidor.

## Tarefa 1 — Contrato de domínio e migração aditiva

- [x] Adicionar migration com `ops2_admin_attendance_enqueue_interactive_v1`, `ops2_admin_attendance_claim_interactive_outbox_v1` e `ops2_admin_attendance_accept_meta_interactive_v1`.
- [x] Reutilizar `whatsapp_outbox_v1` e o histórico `whatsapp_messages_v1` sem modificar contratos das RPCs textuais.
- [x] Revalidar janela Meta, conta, destinatário, runtime homologado, canário e incerteza no enqueue/claim; grants restritos a `service_role`.
- [x] Implementar reconciliação de status webhook que chega antes da resposta de aceite Meta (runtime permanece dependente de staging).
- [x] Validar JSON somente para `button` e `list`; máximo conservador de 3 botões ou 10 linhas, sem chave desconhecida.

## Tarefa 2 — Edge Function e transporte

- [x] Criar `supabase/functions/admin-whatsapp-interactive-send-v1/index.ts` com autenticação Admin, corpo limitado e erros allowlisted.
- [x] Criar helper de transporte Meta tipado, com timeout, Graph version/token do runtime e resposta validada `wamid`.
- [x] Impedir retry automático após resultado ambíguo; manter estado de revisão no outbox e bloquear envios seguintes pela RPC.
- [x] Configurar o candidato em `supabase/config.toml` com verificação de JWT alinhada ao padrão atual (a função valida sessão e usuário em código).

## Tarefa 3 — Admin composer e leitura da resposta

- [x] Criar o editor recolhível **Mensagem interativa** com modo Botões/Lista e prévia simples.
- [x] Adicionar Server Action e adapter server-only para chamar apenas a função nova e enviar `conversation_id`, conteúdo tipado e idempotency key.
- [x] Manter envio de texto, respostas rápidas, mídia, Flow e Catálogo em caminhos próprios.
- [x] Projetar `button_reply` e `list_reply` em resumos higienizados; não devolver metadata bruta à UI.
- [x] Mapear janela fechada, não homologado, bloqueio de canário, falha definitiva e incerteza para instruções curtas.

## Tarefa 4 — Notas e verificação local

- [x] Registrar no ledger e no plano principal o suporte adicionado, o contrato Meta e os gates de staging/carrossel.
- [x] Rodar `pnpm typecheck`, Biome focado nos arquivos TypeScript/TSX/CSS alterados, `pnpm build` e `git diff --check`.
- [x] Não rodar testes automatizados; não aplicar migration, não implantar função, não enviar mensagem nem chamar Bling/NF-e.

**Limite da validação local desta revisão:** a sintaxe PL/pgSQL havia sido aceita por `pglast 8.7` na checagem anterior registrada no ledger. O runtime atual desta sessão não tem `pglast`, portanto a pequena correção posterior do alias JSON foi inspecionada, mas não revalidada por parser neste turno. A função Edge também segue sem `deno check`; ambos exigem ferramentas/staging antes da liberação operacional.

## Dependência para concluir a operação

- A migration e a Edge Function são apenas candidatas locais até haver staging persistente com baseline schema-only validado. A branch `main` de produção não recebe DDL ou deploy nesta etapa.
- Carrossel e mensagens nativas de produto/catálogo não fazem parte deste composer. Carrossel requer contrato oficial acessível e verificação de elegibilidade/template no WABA.

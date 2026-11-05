# Modelos aprovados no atendimento — plano

**Objetivo:** permitir que o atendente envie modelos aprovados pela Meta na conversa certa, inclusive quando a janela de 24 horas estiver fechada, usando o gateway e o outbox já ativos.

**Estado local:** adapter, ações autenticadas e composer concluídos; checagens estáticas aprovadas. Nenhum envio ou deploy foi executado. Homologação visual e por número continua pendente.

## Evidência e contrato existente

- Supabase canônico: `ssbesxgaijknwsjbsbcz`.
- Edge Function ativa `admin-whatsapp-templates-v1`, versão 28: `GET ?action=list&account_id={uuid}` lê o cache por conta; `POST ?action=send` recebe `conversation_id`, `template_id`, `parameters` e `idempotency_key`.
- O envio existente encadeia `ops2_admin_attendance_enqueue_template_v1`, claim, transporte Meta e persistência canônica da resposta. A RPC limita a template `APPROVED`, associado à mesma conta e com `metadata.attendance.enabled=true`; valida homologação/canário, parâmetros do BODY, idempotência e estado incerto.
- O cache atual tem modelos liberados para atendimento nos dois números. Não é necessário adicionar tabela, migration, Edge Function nem deploy.

## Execução local

1. Adapter server-only para ler somente modelos `UTILITY` enviáveis da conta da conversa e devolver campos necessários à UI, sem token, metadata bruta ou telefone de destino. O modelo `MARKETING` permanece no fluxo próprio de consentimento.
2. Server Actions autenticadas para listar e enviar; validar UUIDs, quantidade/tamanho dos parâmetros e manter o transporte oficial no gateway.
3. Componente recolhível **Modelo aprovado** no composer, com seleção do modelo/idioma, campos derivados de `{{1}}…{{N}}` do corpo, prévia e confirmação explícita de envio.
4. Exibir somente modelos de utilidade aprovados, liberados para atendimento e compatíveis com BODY estático/dinâmico suportado pelo gateway. A Server Action confere novamente o modelo na conta selecionada antes do envio. Erros de homologação, canário, limite, configuração e envio incerto terão mensagens curtas; envio incerto bloqueia retry automático.
5. Registrar arquitetura e pendências de homologação em cada número. Fazer somente verificações estáticas locais; não enviar mensagens reais, alterar Supabase, implantar função ou emitir nota.

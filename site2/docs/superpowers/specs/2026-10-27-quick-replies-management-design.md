# Configurações: respostas rápidas

## Objetivo

Permitir que a equipe mantenha os textos reutilizáveis que aparecem no composer do atendimento, sem depender de editar dados no banco.

## Decisões fechadas

1. Resposta rápida é apenas texto de apoio. Salvar, editar ou escolher não envia mensagem ao cliente.
2. Criar e editar usa a ação existente `quick_reply_save`; essa gravação também reativa item pausado.
3. Pausar usa `quick_reply_deactivate`, que preserva o registro e permite reativação posterior. Não há exclusão física.
4. O gateway ativo, e não o browser, executa gravações. Server Actions revalidam a sessão; gateway valida usuário administrativo e entrada.
5. A tela fica em `/configuracoes/respostas-rapidas`, ligada a partir de **Configurações**, para manter a tela principal de conexões curta.
6. Itens ativos e pausados aparecem em listas/accordions simples; campos são título, texto, favorito e ordem. Título até 80 caracteres; conteúdo até 4.000; ordem entre -9999 e 9999.
7. Conflito de título mostra aviso curto. Não retornar dados brutos do gateway nem exibir informações de segredo.

## Contrato remoto verificado

- Projeto `ssbesxgaijknwsjbsbcz`; Edge Function `admin-whatsapp-ops-v1` v39 e commit fixo `13d10dfcaa925340b0ce17011498cb6a502572fa`.
- `GET quick_replies` retorna somente ativos por padrão; `include_inactive=1` retorna também pausados.
- `POST quick_reply_save`: recebe opcional `id`, `title`, `content`, `is_favorite` e `sort_order`; atualiza/cria e seta `is_active=true`. Duplicidade de título retorna `quick_reply_title_conflict`.
- `POST quick_reply_deactivate`: recebe UUID e seta `is_active=false`.
- Tabela `public.attendance_quick_replies_v1` impõe título 1–80 e conteúdo 1–4000; schema remoto não precisa de migration.

## Critérios de aceite

- A tela lista respostas ativas e pausadas sem editar diretamente o banco.
- Novo item pode ser salvo e passa a aparecer no composer depois do reload.
- Item ativo pode ser editado; favorito/ordem preservados conforme campos enviados.
- Pausar remove o item do composer sem apagar seu texto.
- Salvar item pausado o reativa; conflito e falhas têm mensagens claras.
- Nenhuma dessas ações envia mensagem ao WhatsApp.

## Segurança e limite

- Toda gravação passa por `requireAdminSession()` e `admin-whatsapp-ops-v1` autenticado.
- IDs e comprimentos são validados novamente no servidor; erros remotos são allowlisted.
- Esta fatia não altera a forma de enviar interativos Meta nem publica função/migration.

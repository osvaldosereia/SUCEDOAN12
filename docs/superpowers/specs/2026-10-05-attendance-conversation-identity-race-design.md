# Atendimento — Conversa canônica e telefone do contato

Data: 2026-10-05  
Status: aguardando revisão do usuário  
Escopo: correção da corrida de criação de conversas, telefone mostrado no contexto e consolidação segura da duplicata comprovada.

## Objetivo

Garantir uma conversa aberta por conta WhatsApp e telefone do contato, exibir o telefone da conversa selecionada (não o telefone principal de outro canal do cadastro) e consolidar a conversa duplicada já observada sem perder mensagens ou estado.

## Evidência confirmada

Na produção, a conta 0975 contém três conversas recentes associadas à mesma cliente:

- Duas conversas têm o mesmo telefone de contato e foram criadas com cerca de 0,2 segundo de diferença. Uma contém uma mensagem inbound e a outra contém o restante do histórico.
- A terceira conversa usa um número diferente, mas está vinculada à mesma cliente. Ela representa outra identidade de WhatsApp e deve continuar separada.
- A conversa da duplicata mais antiga também tem estado de leitura que aponta para sua mensagem; a conversa que será mantida já possui um estado de leitura posterior.
- A função `whatsapp_resolve_conversation_v1` busca uma conversa aberta e usa `FOR UPDATE`, mas não serializa a primeira inserção quando ainda não existe linha. Duas transações podem observar ausência simultaneamente e inserir.
- O contexto da conversa já retorna o telefone canônico da conversa. A interface, porém, mostra `customer.phone_e164`, que vem do telefone principal do cadastro e pode ser de outro número/canal.

## Regras aprovadas

1. A identidade operacional da conversa é a combinação da conta WhatsApp e do telefone canônico do contato.
2. Conversas de números diferentes permanecem separadas, mesmo quando estão vinculadas ao mesmo cliente.
3. A criação e a resolução de uma conversa para a mesma conta e telefone devem ser serializadas antes da consulta que decide inserir.
4. Ao abrir uma conversa, o telefone exibido como contato vem de `conversation.phone_e164`; telefone principal do cliente continua sendo informação do cadastro e não substitui o número da conversa.
5. A consolidação de registros existentes só é permitida quando conta, telefone canônico e `customer_id` são iguais. Grupos com cliente conflitante ou telefone inválido ficam intocados para revisão manual.
6. A conversa mantida é a que possui mais mensagens; empates são resolvidos por atividade mais recente e depois por UUID estável.
7. Mensagens e referências ligadas à conversa duplicada são transferidas para a conversa mantida antes da exclusão da duplicata. O estado de leitura mais recente prevalece. Etiquetas são unidas sem duplicação.
8. A migração deve verificar as condições de identidade e número de linhas afetadas dentro de uma transação; erro ou ambiguidade deve abortar a migração.
9. Nenhuma mudança será aplicada ao banco de produção durante a preparação desta alteração. A migração ficará versionada e revisável antes de qualquer publicação.
10. O transporte Meta, webhooks, PapoAI, números de canal, vínculos de clientes, dados do cliente e os outros números da cliente ficam fora da mudança.

## Solução

### Resolução concorrente no banco

Atualizar `whatsapp_resolve_conversation_v1` para obter um advisory transaction lock calculado com a conta WhatsApp e o telefone canônico antes de procurar conversa aberta. A transação que entrar em seguida encontrará a conversa inserida pela primeira e a reutilizará. A busca por registro existente e o retorno permanecem como hoje.

A chave do lock usa escopo de conta, evitando bloquear o mesmo telefone em contas/canais diferentes. O valor de telefone deve ser normalizado pela função canônica brasileira já existente quando possível; entradas que essa função não reconhece mantêm seu valor validado atual para não mudar silenciosamente contratos existentes.

### Exibição do telefone

Alterar o componente de contexto do atendimento para mostrar `state.conversation.conversation.phone_e164`. Se a conversa não tiver um telefone canônico disponível, exibir estado vazio/indisponível; não preencher com o telefone principal do cadastro, pois isso poderia identificar outro número como sendo o contato da conversa.

### Consolidação de duplicatas existentes

Adicionar uma rotina transacional idempotente na migração, limitada a conversas abertas que tenham a mesma conta, o mesmo telefone canônico válido e o mesmo `customer_id`. Não unir conversas de telefones diferentes ou clientes diferentes.

A rotina deve:

- escolher a conversa com maior histórico como canônica;
- transferir as mensagens e referências associadas, incluindo estado de atendimento, registros de auditoria, carrinhos, sessões de catálogo, pedidos, fluxos PapoAI, jobs e revisões ANA, tokens de identidade e outboxes;
- unir etiquetas evitando colisões de chave;
- manter o estado de leitura mais recente e referências de follow-up sem regredir o estado;
- validar que nenhuma referência permaneça apontando para a conversa removida;
- remover apenas a linha duplicada depois de transferir referências;
- abortar diante de grupo ambíguo ou conflito que não possa ser preservado automaticamente.

No caso observado, a conversa canônica já tem o estado de leitura mais recente; a conversa duplicada tem uma mensagem e nenhum pedido, carrinho, etiqueta ou outbox associado. A rotina deve preservar a mensagem ao consolidar o registro antigo.

## Arquivos previstos

- Nova migração em `supabase/migrations/` e cópia de referência em `supabase/sql/`.
- `vitrine/admin/atendimento/attendance-app.js`, para exibir o telefone da conversa selecionada.

O arquivo de migração recriará a função de resolução existente com a mesma assinatura e permissões, adicionará o lock e executará a consolidação segura. Não serão alteradas Edge Functions nem formatos de API.

## Verificação e implantação

- Revisar a migração e os predicados antes de publicação.
- Verificar que as mensagens e referências do grupo consolidado apontam para uma única conversa e que a conversa do outro telefone continua separada.
- Verificar que chamadas concorrentes para conta + telefone reutilizam o mesmo registro.
- Conferir que o painel apresenta o número da conversa selecionada mesmo quando o cadastro tem outro telefone principal.
- Não aplicar a migração nem publicar a interface nesta fase de revisão. A publicação exige uma etapa de aprovação explícita.

## Riscos e limites

- A consolidação de dados é irreversível por rollback de esquema simples; por isso, a rotina será restrita por identidade completa e abortará em caso de conflito. Antes da publicação, a revisão deve confirmar o escopo resultante.
- Números de telefone diferentes no mesmo cadastro são aceitos e continuam separados.
- A correção impede novas corridas após sua publicação; ela não reconstrói eventos ausentes nem altera o vínculo comercial/cliente.

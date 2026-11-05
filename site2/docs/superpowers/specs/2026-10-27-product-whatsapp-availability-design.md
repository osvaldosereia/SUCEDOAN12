# Disponibilidade de produto no WhatsApp

## Intenção

Permitir que a equipe habilite ou desabilite um produto para uso nos canais de WhatsApp sem enviar o formulário amplo de edição de produto. Isso dá à equipe uma forma controlada de corrigir etapas de Flow pendentes.

## Evidência

- A ficha local mostra `is_whatsapp_active`, mas não permite alterá-lo.
- O gateway canônico `admin-products-live-v1` aceita esse campo em `product_save`, porém essa operação altera muitos outros campos, reconcilia estoque/lotes e não é apropriada para uma troca isolada de disponibilidade.
- `product_quick_save` altera preço/custo e situação ativa, mas não aceita a flag de WhatsApp.
- A tabela `products` tem o trigger `trg_products_zero_stock_inactive` somente em `UPDATE OF stock`; atualizar apenas a flag não aciona essa regra. `admin_audit_logs` possui RLS, aceita escrita do backend privilegiado e não tem constraint adicional sobre os novos nomes de ação.
- Snapshot agregado read-only do projeto canônico `ssbesxgaijknwsjbsbcz`: 15 produtos ativos desabilitados no WhatsApp aparecem em 18 posições de Flow. Três posições não têm produto ativo. Uma alteração de disponibilidade pode resolver várias posições, mas não corrige nenhuma automaticamente nesta tarefa.

## Abordagens

1. Chamar `product_save` com o restante do formulário preenchido. Rejeitada: o contrato amplo aumenta o risco de alterar preço, estoque, classificação ou outros dados durante uma troca simples.
2. Expandir `product_quick_save` para aceitar a flag. Rejeitada neste recorte: depende de editar/reimplantar a função operacional existente e mistura disponibilidade de canal ao editor de preço.
3. Criar uma mutação estreita, autenticada e auditada, com RPC transacional de service-role e uma ação separada na ficha do produto. Escolhida por limitar a gravação a um único campo, manter a auditoria atômica e preservar os gateways existentes.

## Decisões

- A mutação altera somente `products.is_whatsapp_active` e `updated_at`, registra a ação `product.whatsapp_availability.updated` em `admin_audit_logs` na mesma transação e verifica funcionário ativo nos dois lados. Os únicos papéis autorizados são `owner`, `admin` e `catalog_manager`, seguindo o gateway de upload de imagem de produto existente.
- A requisição contém ID do produto, estado esperado e estado desejado. Se o estado já for o desejado, a operação responde com sucesso idempotente sem gravar auditoria. Caso contrário, estado esperado divergente retorna conflito sem alterar registros.
- Desabilitar é sempre permitido para papel autorizado. Habilitar exige produto ativo, nome válido segundo o normalizador atual (`readText`, controles ASCII mapeados para espaço, whitespace ECMAScript colapsado, máximo 180 unidades UTF-16), URL HTTPS sintaticamente válida com autoridade DNS ASCII, IPv4 ou IPv6 validada, sem credenciais/espaços e com porta entre 0 e 65.535, até 2.048 unidades UTF-16, e preço efetivo aceito pelo `moneyToCents` do emissor: entre zero e 999.999.999 centavos e sem casas fracionárias não nulas além da segunda. Preço de oferta só prevalece quando o emissor o aceita; caso contrário ele usa o preço-base. O Admin não faz requisição HTTP à imagem; acesso público e renderização continuam gates da homologação Meta.
- O RPC usa `SECURITY INVOKER`, `search_path` vazio e execução concedida somente a `service_role`. O Edge Function valida a sessão do Supabase e o papel antes de chamar o RPC com sua credencial privilegiada. Nenhum papel do navegador chama o RPC diretamente.
- O status significa disponibilidade interna para WhatsApp. Não cria vínculo de `product_retailer_id`, não sincroniza nem publica produto no Catálogo Meta e não publica Flow.
- A tela usa ação explícita “Ativar no WhatsApp” ou “Desativar no WhatsApp”, fora do formulário de preço. Nenhum produto existente será habilitado automaticamente.
- A migration e o Edge Function são candidatos locais. Nenhuma DDL, implantação ou alteração de produto ocorrerá no projeto original até existir staging isolado e homologado.
- Não adicionar nem executar testes automatizados nesta fatia; verificar tipos, lint focalizado e análise estática de SQL/Edge quando a ferramenta estiver disponível. A verificação de comportamento fica para staging.

## Critérios de aceite

- Um usuário ativo com papel `owner`, `admin` ou `catalog_manager` pode alternar apenas a flag WhatsApp; um estado divergente dá conflito, exceto repetição idempotente quando o estado já é o desejado.
- `viewer`, outros papéis, sessão inválida, ID inválido, produto ausente ou estado inválido não alteram registros.
- Habilitar produto inativo ou sem nome, foto HTTPS ou preço Flow válido é recusado; desabilitar continua possível.
- O registro de auditoria e a alteração da flag são atômicos; a resposta ao navegador contém apenas estado, horário e erro allowlisted.
- A UI distingue disponibilidade WhatsApp de publicação/vínculo no Catálogo Meta e não apresenta custos, dados fiscais ou payload interno.
- Nenhuma escrita no Supabase original, chamada Graph, mensagem Meta, escrita Bling ou NF-e é feita nesta fatia.

## Referências oficiais

- [Supabase — Securing Edge Functions](https://supabase.com/docs/guides/functions/auth): validação de JWT de usuário e separação entre contexto autenticado e cliente privilegiado.
- [Supabase — Securing your API](https://supabase.com/docs/guides/api/securing-your-api): funções Postgres são executáveis por `PUBLIC` por padrão e exigem grants mínimos.
- [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions): chamadas RPC e privilégios de execução.
- [PostgreSQL 17 — Network Address Functions](https://www.postgresql.org/docs/17/functions-net.html): validação de família e máscara para literais IPv4/IPv6.

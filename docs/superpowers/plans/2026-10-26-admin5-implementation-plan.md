# Admin5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma cópia simplificada e independente do Vitrine Admin para operar WhatsApp, produtos, cestas, pedidos e o catálogo de produtos da Meta.

**Architecture:** Uma aplicação estática em `/admin5` chama os Edge Functions existentes com a sessão do Admin. As telas Cestas e Pedidos preservam os fluxos atuais na primeira rodada; o catálogo recebe um validador e uma prévia local antes de qualquer integração de gravação na Meta.

**Tech Stack:** HTML, CSS e JavaScript ES Modules; Supabase Edge Functions/Postgres já existentes; Meta WhatsApp Business Platform e Commerce Catalog.

**Spec:** `docs/superpowers/specs/2026-10-26-admin5-design.md`

## Global Constraints

- Usar apenas o projeto Supabase canônico `ssbesxgaijknwsjbsbcz`.
- Não colocar `service_role`, token Meta ou App Secret no browser ou no GitHub.
- Consultas do catálogo devem exigir `products.is_active = true`.
- Envio de chat deve continuar passando por `admin-whatsapp-ops-v1`.
- Não alterar o site público ou o Vitrine Admin existente nesta rodada.
- Manter o Admin5 numa branch de revisão; não publicar sem resolver o acesso passwordless já existente.
- Não criar chamada que reserve estoque, confirme pagamento ou emita nota fiscal automaticamente.

## Review Focus

- Canal de destino deve continuar sendo resolvido pelo backend a partir da conversa.
- Janela de serviço Meta fechada deve bloquear mensagem livre.
- Produto inativo nunca deve aparecer na prévia de catálogo.
- Preço, imagem, marca e categoria incompletos devem ficar visíveis como pendência.
- País de origem deve ficar visível como pendência enquanto a origem não estiver cadastrada.
- Variantes de cestas e os dois canais precisam ser reconciliados antes de sincronização remota.

---

### Task 1: Admin5 base e atendimento

**Files:** `admin5/index.html`, `admin5/admin5.css`, `admin5/api.js`, `admin5/app.js`

- [x] Criar navegação responsiva com Atendimento, Produtos, Cestas, Pedidos e Catálogo Meta.
- [x] Reutilizar sessão e chamadas atuais do Vitrine Admin.
- [x] Unificar fila dos canais 0975 e 1018 com busca simples.
- [x] Carregar conversa e permitir texto pelo gateway atual, respeitando o bloqueio de envio.
- [x] Atualizar a fila a cada 30 segundos somente enquanto a tela estiver visível.
- [ ] Homologar visualmente nos dois canais em navegador conectado ao domínio.

### Task 2: Produtos simples

**Files:** `admin5/app.js`, `admin5/admin5.css`

- [x] Listar produtos com busca e filtro ativo/inativo.
- [x] Permitir ativar/desativar por `product_quick_save`.
- [x] Permitir corrigir preço por `product_quick_save`.
- [x] Mostrar saldo atual como leitura e manter a autoridade de estoque existente.
- [ ] Homologar papel de usuário `viewer` e papel autorizado em alteração de preço/status.

### Task 3: Cestas e Pedidos atuais

**Files:** `admin5/app.js`

- [x] Abrir as abas atuais de Cestas e Pedidos dentro do shell Admin5.
- [ ] Verificar a seleção da aba por URL e a sessão compartilhada no mesmo navegador.
- [ ] Ajustar o enquadramento mobile após teste na tela real.

### Task 4: Preparação do catálogo

**Files:** `admin5/app.js`, `docs/admin5/META-WHATSAPP-ESTRATEGIA.md`

- [x] Consultar somente ativos em páginas de até 100 itens.
- [x] Exibir prontidão de nome, preço, imagem e classificação.
- [x] Criar classificação inicial para oito seções e permitir correção local.
- [x] Auditar os 388 ativos: corrigir falsos positivos por “perfume” e “PET” de embalagem; nenhuma categoria ficou sem seção sugerida.
- [x] Baixar CSV interno dos ativos com seção e pendências, sem formato de feed ou escrita na Meta.
- [x] Mostrar cestas ativas para WhatsApp separadas do catálogo de produtos unitários.
- [x] Manter desativados os controles de sincronização Meta nesta fase.
- [ ] Encontrar ou cadastrar país de origem; essa informação é obrigatória no catálogo WhatsApp e não há coluna dedicada no schema atual de `products`.
- [ ] Corrigir preço, imagem, marca e descrição incompletos e persistir a classificação em fonte compartilhada.
- [ ] Confirmar `catalog_id` e acesso Commerce para cada WABA.
- [ ] Implementar sincronização server-side com prévia, lote pequeno, reconciliação e rollback.

### Task 5: Pedidos de catálogo e Flows

**Files:** futura Edge Function de integração, função de webhook existente, configuração de Flow

- [ ] Confirmar o payload real de ordem nativa recebido via webhook.
- [ ] Mapear `product_retailer_id` estável para produto/cesta.
- [ ] Gerar rascunho e recalcular preço/saldo no servidor antes de confirmar.
- [ ] Homologar o Flow de cesta já aprovado: tamanho/preço inicial, arroz primeiro, etapas por tipo com imagem/preço/quantidade, total dinâmico e resumo; confirmar quais padrões de quantidade e repetição o Flow Builder suporta.
- [ ] Usar Flow para endereço, entrega e forma de pagamento após carrinho ou cesta, mantendo confirmação humana.
- [ ] Rodar canário sem efeito fiscal e sem mensagem a cliente real antes de abrir para os canais.

## Rodadas sugeridas

1. **Rodada A — base Admin5:** revisar shell, chat e autenticação atual.
2. **Rodada B — operação:** conferir produtos, Cestas e Pedidos em mobile e desktop.
3. **Rodada C — dados do catálogo:** corrigir preço/imagem/marca e revisar classificação de cada ativo.
4. **Rodada D — Meta:** validar os dois catálogos, testar API em modo de prévia e sincronizar um lote canário.
5. **Rodada E — jornada WhatsApp:** enviar lista por seção, receber um pedido de catálogo, revisar rascunho e confirmar pelo fluxo canônico.

## Verificação executada nesta rodada

- Consulta somente leitura às tabelas, contas WhatsApp, cestas e contagens do projeto canônico.
- Inspeção dos contratos atuais de `admin-whatsapp-ops-v1`, `admin-products-live-v1`, `admin-basket-configuration-v1` e `attendance-auth.js`.
- Pesquisa na documentação oficial Meta sobre catálogos, mensagens interativas, pedidos e Flows.
- Releitura somente dos produtos ativos para auditar a classificação: 182 Mercearia, 83 Limpeza, 94 Lavanderia, 26 Higiene, 3 Casa, 0 Beleza e 0 Pet; 5 cestas permanecem separadas.
- Não houve alteração no Supabase nem envio de mensagens ou pedidos reais.

# ANA Atendimento Completo — plano de execução

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Keep automated tests for Round 5, per the user's explicit sequencing request.

**Goal:** Completar o atendimento WhatsApp no Admin da Dona Antônia com ANA controlada, identificação segura, automações operacionais e caminho de cadastro/pedido assistido sem depender do PapoAI.

**Architecture:** Manter o Supabase como fonte canônica, Edge Functions para política e transporte, Admin para intervenção humana, e templates Meta existentes por finalidade. Gatilhos determinísticos cuidam de dados e eventos; a ANA só prepara/envia texto dentro dos gates de atendimento já existentes. Links identificados usam tokens curtos, de uso único e com expiração.

**Tech stack:** Supabase Postgres migrations, Supabase Edge Functions (Deno/TypeScript), JavaScript do Admin, WhatsApp Cloud API.

## Cinco rodadas amplas

### Rodada 1 — Identidade e primeira resposta

- Reaproveitar conciliação de cliente por telefone normalizado, bloqueio do telefone no cadastro e link individual do catálogo.
- Usar nome confirmado somente em conversa vinculada; primeira saudação diária é neutra se não houver nome.
- Em cumprimento simples, oferecer catálogo identificado sem desviar reclamação/pedido para a loja online.
- Preservar gate humano, janela de atendimento e idempotência.

### Rodada 2 — Conhecimento e limites da ANA

- Consolidar regras de tom, dúvidas básicas, limites transacionais e transferência humana no policy compartilhado pelo worker e pela prévia.
- Manter valores dinâmicos fora da memória do modelo; usar somente contexto validado.
- Não coletar CPF/endereço completo no chat nem inferir gênero ou preferências.

### Rodada 3 — Gatilhos e etiquetas

- Manter etiquetas de dia da semana ligadas à data estruturada de entrega e preservar etiquetas manuais.
- Usar eventos de pedido como fonte para avisos, com idempotência e trilha canônica de envio.
- Fazer marketing segmentável por produto/categoria/interesse declarado e consentimento atual; não inferir perfil.

### Rodada 4 — Templates e cadastro assistido

- Reutilizar templates Meta existentes por conta e finalidade; utility para operação de pedido, marketing somente para autorização/campanha consentida.
- Conferir estado aprovado, variáveis e habilitação no Admin antes do despacho.
- Operar cadastro/busca e pedido assistido na conversa existente, com telefone imutável e revisão humana do resumo do pedido.

### Rodada 5 — Testes, correções e fechamento

- Executar somente agora os testes automatizados e verificações de build/integração adiados das rodadas anteriores.
- Corrigir falhas, repetir os testes afetados e registrar limites de qualquer etapa que dependa de aprovação externa da Meta.
- Conferir diff, estado de deployment e canário sem enviar campanha de marketing.

## Estado inicial verificado

- O Admin tem controle humano/IA, reconciliação de cliente, busca/cadastro a partir da conversa e cadastro com telefone bloqueado.
- O botão de catálogo em Atendimento gera um link curto de identidade, com uso único e expiração, e prepara a mensagem em rascunho.
- A ANA possui gates de controle humano, regras de não inventar dados dinâmicos e handoff; sua política é compartilhada entre worker e prévia.
- Etiquetas de dias da semana são atualizadas por gatilho de pedido.
- O banco já tem consentimento de marketing e template de autorização aprovado. Não habilitar campanhas em lote sem opt-in.

## Critérios de aceite

- Nome só vem de cliente associado sem ambiguidade.
- Mensagem automática não sobrepõe atendimento humano nem responde dados operacionais não confirmados.
- Identificação do checkout usa token temporário; nenhum telefone é exposto em URL.
- Cadastro por atendimento preserva telefone da conversa e CPF permanece opcional.
- Aviso operacional não depende de consentimento de marketing; marketing depende do consentimento registrado.
- Testes são executados apenas na Rodada 5.


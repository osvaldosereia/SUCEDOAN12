# Plano: configuração de WhatsApp Flows no Admin

> Execução greenfield no projeto Supabase canônico. Não criar staging, publicar Flow ou enviar mensagens.

## 1. Contratos privados e keyring

- [x] Adicionar migration com snapshot safe, leitura da chave somente para `service_role`, gravação sem sobrescrever Vault e verificação do fingerprint Meta.
- [x] Adicionar RPCs idempotentes de upsert e ativação de binding por canal; todo binding inicia com envio desligado.
- [x] Restringir `EXECUTE` explicitamente a `service_role`.

## 2. Edge Function Meta

- [x] Implementar autenticação/roles, allowlist de 2 canais, CORS, limites e timeout.
- [x] Adicionar leitura de estado, chave e Flows; emitir apenas DTOs allowlistados.
- [x] Provisionar chave somente quando Meta e Vault não possuem chave; read-back é obrigatório.
- [x] Vincular Flow publicado validando WABA, versões, endpoint esperado e ausência de erros.
- [x] Habilitar envio em operação distinta, repetindo verificações no servidor.

## 3. Tela do Admin

- [x] Adicionar `/configuracoes/fluxos`, com um cartão simples por número e estados sem linguagem técnica desnecessária.
- [x] Permitir atualizar, configurar chave, selecionar/vincular Flow e habilitar envio explicitamente.
- [x] Exibir próximo passo claro quando a configuração exigir ação manual no WhatsApp Manager.
- [x] Linkar a tela em Configurações e navegação existente.

## 4. Entrega

- [x] Atualizar ledger e README com evidência real do deploy, sem registrar valores secretos.
- [x] Fazer typecheck/Biome e `git diff --check`; o CLI Deno não está disponível neste checkout, e a função foi aceita e publicada pelo deploy Supabase. Não executar testes automáticos.
- [x] Aplicar migration e publicar apenas a nova função no Supabase `ssbesxgaijknwsjbsbcz`; conferir estado via retorno sanitizado.

## Estado após esta fatia

A interface e o backend seguro de configuração estão implantados. **Isso não libera pedidos reais:** a configuração de chave/Flow ainda depende de execução autenticada pela equipe, de Flow publicado e válido nos dois números e de validação operacional do pedido ponta a ponta. Não houve publicação, ativação, envio de mensagem ou escrita comercial nesta fatia.

# Fluxo de sessão para Meta Flow 1018 — especificação de segurança

**Status:** somente branch, sem provisionamento Meta e sem deploy no Supabase.

1. Criar token aleatório criptograficamente seguro por envio de Flow, vinculado ao WhatsApp account id do **1018**, telefone E.164 do cliente, Meta Flow ID e WAMID da mensagem de abertura. Persistir somente SHA-256 do token, status pending, data de criação e expiração em até 30 minutos.
2. Enviar o Flow pela API Meta já existente, apenas após autorização do piloto. A resposta recebida deve passar por assinatura HMAC válida, resolução do phone_number_id, normalização canônica e deduplicação por WAMID.
3. Ler `nfm_reply.response_json` com limite de tamanho, validar a intenção na lista permitida. O adaptador `ana-1018-meta-flow-completion-v1.mjs` **não executa ações**.
4. Recuperar a sessão **do banco pelo hash do token**; não aceitar sessão passada pelo navegador/cliente. Verificar conta 1018, telefone do cliente, origem Flow/WAMID, prazo e status. `ana-1018-flow-session-v1.mjs` é o validador puro.
5. Consumir a sessão em uma **transação atômica** no servidor: somente pending pode mudar para consumed, gravando o WAMID inbound. Duplicatas devem retornar o mesmo resultado sem nova operação.
6. Consultar a geração do piloto e o modo de atendimento no momento da execução. Se ocorreu rollback, rejeitar qualquer ação pendente do piloto.
7. Mesmo após consumo, a intenção de consultar/alterar pedido exige vínculo verificado do cliente e regras do pedido. Não é autorização para alterar carrinho, cesta, preço, estoque ou valor oculto.
8. Mensagens de orientação e handoff só podem ser enviadas por uma operação separada, idempotente, com controle de janela de 24h ou template aprovado. Não responder automaticamente durante atendimento humano.

**Pendências antes de uso real:** schema de sessões, RPC de criação/consumo com idempotência, integração segura com webhook/worker, registro real do Flow na Meta, envio de teste para contatos internos, homologação de pedidos/cestas e autorização explícita do usuário. Não reutilizar Edge Functions aposentadas nem ligar o novo piloto durante esses trabalhos.

## Garantias já cobertas por testes locais
- Somente canal 1018, conta e telefone do cliente correspondentes.
- Sessão com prazo curto, token hash presente, referência de Flow e WAMID.
- Rejeição de resposta não verificada, expirada, repetida ou de outra conta.
- Nenhum efeito colateral no verificador puro.

**Não garantido ainda:** persistência e consumo atômico, autenticação do cliente no pedido, Meta Flow publicado ou integração do webhook. Esses componentes precisam de implementação e testes próprios.

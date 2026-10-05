# Atendimento — Identificação, vínculo e cadastro de cliente

Data: 2026-10-05

## Objetivo

Permitir que a Central de Atendimento reconheça automaticamente o cliente do WhatsApp quando houver correspondência segura e, quando não houver, permita buscar, vincular, criar e editar o cadastro sem sair da conversa.

## Regras aprovadas

1. O telefone da conversa é a pista operacional; CPF/CNPJ continua sendo identidade forte.
2. Ao abrir conversa sem `customer_id`, o sistema tenta reconciliar pelo resolvedor canônico `resolve_customer_by_phone_v1`.
3. Correspondência única pode ser vinculada automaticamente.
4. Correspondência ambígua nunca escolhe cliente sozinha.
5. Sem correspondência, a aba direita oferece `Cadastrar cliente` e `Buscar cadastro`.
6. Cadastro novo usa o telefone da própria conversa; o navegador não pode escolher outro destino/telefone para o vínculo.
7. Busca manual permite vincular cadastro existente por nome, telefone ou CPF/CNPJ.
8. Cliente já vinculado pode ser editado na própria lateral direita.
9. Depois de criar/vincular/editar, a conversa é recarregada para atualizar nome, ferramentas, pedidos e contexto.
10. O fluxo do WhatsApp/Meta não deve ser alterado. As operações de cliente ficam isoladas em backend administrativo próprio.

## Arquitetura

- Nova Edge Function administrativa `admin-attendance-customer-v1`, autenticada pela sessão Supabase e tabela `admin_users`.
- Novas RPCs internas service-role-only para reconciliação, busca e vínculo.
- Reutilizar `ops2_admin_customer_save_v2` para criar/editar cliente, sem duplicar regras de identidade.
- Novo módulo `attendance-customer.js` observa o card Cliente na lateral direita e adiciona as ações sem acoplar-se ao transporte Meta.
- Novo CSS isolado `attendance-customer.css`.
- O módulo é carregado pela página já existente sem alterar os módulos de envio, mídia, templates ou ANA.

## Segurança

- Toda escrita exige admin autenticado.
- `conversation_id` e `customer_id` devem ser UUIDs válidos.
- Criação força o telefone canônico da conversa no servidor.
- Vínculo manual não altera automaticamente o telefone principal de um cadastro já existente.
- RPCs novas revogam execução de `public`, `anon` e `authenticated`; apenas `service_role` executa.
- Nenhuma operação altera canal, WABA, Meta, templates, webhook ou transporte.

## UX

### Cliente já vinculado
Exibir nome, telefone, documento mascarado, endereço, compras e marketing como hoje, acrescido do botão `Editar aqui`.

### Cliente encontrado automaticamente
Executar reconciliação e recarregar a conversa. O vínculo passa a aparecer como cliente normal.

### Cliente não encontrado
Exibir telefone da conversa e os botões `Cadastrar cliente` e `Buscar cadastro`.

### Telefone ambíguo
Exibir aviso de que há mais de um cadastro possível e exigir busca/vínculo manual.

### Cadastro novo
Formulário inline com nome obrigatório; CPF/CNPJ, e-mail e endereço opcionais. WhatsApp aparece preenchido e bloqueado com o número da conversa.

### Busca manual
Buscar por nome, telefone ou CPF/CNPJ; cada resultado mostra nome + telefone + documento mascarado e botão `Vincular`.

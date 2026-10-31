# Configuração segura dos WhatsApp Flows no Admin

## Objetivo

Dar à equipe uma tela por número Meta para conferir a chave de criptografia, listar Flows da conta, vincular um Flow publicado ao atendimento e habilitar seu envio somente em uma ação separada.

## Regras

- Projeto Supabase canônico: `ssbesxgaijknwsjbsbcz`; não criar branch/staging.
- A chave privada fica somente no Vault. Browser e logs recebem apenas estado e fingerprints SHA-256.
- Nunca substituir segredo existente nem trocar chave pública que já esteja na Meta. Se houver divergência, bloquear e orientar revisão manual.
- Gerar e registrar uma chave apenas quando não existir chave local nem Meta para o número; ler de volta e comparar antes de marcar `ready`.
- Cada operação busca credenciais estritamente pelo canal `0975` ou `1018`; Graph API é chamada somente no servidor.
- Só listar Flow do WABA do canal. Vincular somente Flow `PUBLISHED`, sem erros de validação, com versões suportadas pelo Flow local e `data_channel_uri` igual ao endpoint verde do projeto (`whatsapp-flow-data-exchange-greenfield-v1?account=<slug>`).
- O vínculo nasce verificado e com envio desligado. Habilitar é uma ação separada; nenhuma publicação ou mensagem é feita automaticamente.
- A Meta Graph permanece a autoridade para estado publicado. A tela não promete entrega de mensagens nem substitui uma conferência operacional com aparelho real.
- Se a Meta já tiver chave sem par privado local, ou a assinatura/fingerprint divergir, o sistema não recupera nem rotaciona: bloqueia a configuração.

## Jornada

1. A tela mostra os dois canais, status do keyring e bindings persistidos.
2. **Atualizar Meta** lê chave e Flows publicados, sem mutação.
3. **Preparar Flow e validar** verifica a chave; se não houver chave em nenhum lado, cria o segredo no Vault, registra a pública e exige read-back válido. Depois cria ou reutiliza o rascunho esperado e envia o JSON aprovado para validação. Se a Meta não confirmar a chave, o processo para.
4. A ação separada **Verificar/configurar chave** continua disponível para reconciliação isolada. Nenhuma operação substitui uma chave existente.
5. **Vincular Flow** reconsulta o Flow por ID na Meta, confere WABA, publicação, erros, endpoint, `json_version=7.3` e `data_api_version=3.0`; salva binding com envio desligado.
6. **Ativar envio** habilita somente o binding selecionado depois de repetir os pré-requisitos no servidor.

A preparação não publica o Flow nem envia mensagens. A UI confirma antes de registrar chave ou alterar o rascunho.

## Contrato técnico

- Uma Edge Function autenticada autoriza `owner`, `admin` e `catalog_manager`, usa token e App Secret exatos do canal, limita body/tempo/paginação e devolve DTO allowlistado.
- RPCs `SECURITY DEFINER` são revogadas de `PUBLIC`, `anon` e `authenticated` e concedidas somente a `service_role`. Uma RPC de provisionamento cria Vault secret somente se o nome está ausente; RPC de reconciliação compara hash sem devolver o segredo à UI.
- `GET /{phone-number-id}/whatsapp_business_encryption`, `POST` no mesmo recurso para registro inicial e GET de Flow por WABA/ID são chamados pelo servidor. Resposta Graph bruta não é persistida nem registrada.
- Persistência de binding atualiza idempotentemente por `(whatsapp_account_id, meta_flow_id, flow_json_version)` e a ativação desliga o binding anterior da mesma conta.

## Fora desta fatia

Publicar Flow (irreversível), enviar mensagem a clientes, emitir NF-e, alterar dados de produtos/clientes/pedidos, mudar webhook Meta e trocar chave existente.

## Evidência oficial consultada

- Meta mantém GET/POST `/{Phone-Number-ID}/whatsapp_business_encryption` em sua coleção oficial: https://www.postman.com/meta/whatsapp-business-platform/request/p9in1an/set-encryption-public-key e https://www.postman.com/meta/whatsapp-business-platform/request/bmn3wob/get-encryption-public-key.
- A coleção oficial Meta lista APIs de Flows e de envio; o endpoint local, versão de JSON e Data API também precisam ser validados para o Flow publicado: https://www.postman.com/meta/whatsapp-business-platform.
- Vault armazena segredos criptografados e disponibiliza criação por `vault.create_secret`; a própria documentação alerta que acesso à view descriptografada deve ser estritamente protegido: https://supabase.com/docs/guides/database/vault.

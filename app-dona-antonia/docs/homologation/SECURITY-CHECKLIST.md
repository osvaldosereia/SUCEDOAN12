# Security Checklist — App Dona Antônia HML

**Estado:** homologação, produção OFF  
**Atualizado:** 18/09/2026

## Barreiras já implementadas e testadas

- [x] nenhum arquivo do Comprar atual é importado pelo runtime novo;
- [x] host atual do Supabase de produção é bloqueado no runtime;
- [x] service role e chaves secretas são bloqueados no bundle;
- [x] Bling e Meta Graph são bloqueados no runtime;
- [x] URLs com telefone, CPF, endereço, token, sessão, segredo ou credenciais são rejeitadas;
- [x] cliente HML aceita somente `TEST-CLIENT-*`;
- [x] checkout HML aceita somente referências `TEST-PROD-*` e `TEST-BASKET-*`;
- [x] checkout HML não transporta telefone, CPF, endereço ou cadastro do cliente;
- [x] service worker não controla `/comprar/`;
- [x] service worker não cacheia POST ou URLs sensíveis;
- [x] renderers de conversa, catálogo e cestas escapam HTML;
- [x] confirmação offline é bloqueada;
- [x] reconexão não duplica pedido;
- [x] telemetria rejeita PII, texto livre e IDs de publicidade;
- [x] tabelas Supabase HML estão com RLS e zero grants para anon/authenticated;
- [x] gate Supabase HML permanece `enabled=false`.

## Hardening local adicional validado

- [x] sessão sintética expirada falha fechado;
- [x] sessão sintética marcada como revogada falha fechado;
- [x] revogação local do aparelho limpa a sessão segura local;
- [x] brute force do código humano de pairing tem limite de tentativas;
- [x] polling de pairing tem limite de tentativas;
- [x] expiração e replay de challenge local são bloqueados;
- [x] deep link com percent-encoding inválido falha fechado;
- [x] deep link absoluto exige HTTPS + host em allowlist;
- [x] token push fora de `TEST-PUSH-*` é recusado antes de efeito externo;
- [x] mídia com ID não TEST, MIME inválido ou tamanho acima do limite é recusada;

## Testes obrigatórios ainda pendentes por dependência futura

- [ ] replay de sessão contra backend real de homologação;
- [ ] token de sessão expirado validado ponta a ponta com backend;
- [ ] aparelho revogado validado ponta a ponta com backend;
- [ ] Keychain no iOS real;
- [ ] Keystore/armazenamento criptografado no Android real;

- [ ] EXIF/metadados de foto;
- [ ] permissões reais de câmera/microfone;
- [ ] deep link nativo malformado em Android/iOS reais;
- [ ] push nativo malformado em aparelho real;
- [ ] inspeção final do APK/AAB/IPA por segredos.

## Regra de gate

A Rodada 22 não pode ser considerada integralmente concluída até os testes pendentes acima existirem e passarem. Nenhuma vulnerabilidade de severidade alta poderá permanecer aberta antes do beta.

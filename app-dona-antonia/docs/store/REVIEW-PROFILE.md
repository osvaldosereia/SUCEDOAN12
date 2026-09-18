# Review Profile — App Dona Antônia

**Estado:** DRAFT / SOMENTE HOMOLOGAÇÃO
**Uso:** futuro review interno/lojas
**Dados reais:** PROIBIDOS

## Identidade sintética

- profile_id: `TEST-REVIEWER-001`
- display_name: `Cliente de Teste`
- environment: `homologation`
- customer_id: `TEST-CUSTOMER-REVIEWER-001`
- sessão esperada: somente token iniciado por `TEST-SESSION-`

Nenhum telefone, CPF, endereço, e-mail ou credencial real deve ser salvo neste documento.

## Cenário que o reviewer deverá conseguir testar

1. abrir o app em ambiente de homologação;
2. navegar por Cestas;
3. abrir Ofertas;
4. adicionar produtos sintéticos;
5. revisar o carrinho;
6. executar checkout fictício;
7. receber apenas pedido `TEST-*`;
8. acompanhar a timeline fictícia;
9. abrir Central de Privacidade;
10. testar preferências sem envio real;
11. testar histórico/recompra somente com histórico sintético.

## Recursos que NÃO podem depender de integração externa

- navegação principal;
- catálogo/cestas;
- carrinho;
- checkout de review;
- acompanhamento fictício;
- privacidade;
- offline básico.

## Recursos que só poderão aparecer como habilitados depois de homologação nativa

- push;
- câmera;
- microfone;
- Photo Picker;
- Universal/App Links;
- sessão persistente Keychain/Keystore.

## Segurança

- nenhuma credencial de produção;
- nenhum cliente real;
- nenhum pedido real;
- nenhum webhook real;
- nenhuma Meta/PapoAI/Bling/logística;
- não reutilizar credencial pessoal do proprietário;
- remover/revogar o perfil de review quando o ciclo de homologação terminar.

## Gate

Este arquivo define apenas o formato seguro do perfil. **Nenhuma conta de loja ou credencial foi criada por este documento.**
